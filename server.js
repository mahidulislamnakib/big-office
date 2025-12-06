// server.js - Big Office - Comprehensive Tender Management System
require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const compression = require('compression');
const path = require('path');
const cors = require('cors');
const fs = require('fs');
const multer = require('multer');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const session = require('express-session');
const AlertGenerator = require('./alert-generator');
const { authenticate, authorize, checkFirmAccess, logActivity, logRequest } = require('./middleware/auth');
const { hashPassword, comparePassword, validatePasswordStrength } = require('./utils/password');

// Import uploadSafe middleware for robust file handling
const uploadSafe = require('./middleware/uploadSafe');
const { startCleanupJob } = require('./utils/cleanupOrphanedFiles');
const { generateTokenPair, verifyRefreshToken } = require('./utils/jwt');
const logger = require('./utils/logger');
const ReportGenerator = require('./utils/reportGenerator');
const { validate, schemas } = require('./middleware/validator');
const { auditLog, auditAuth } = require('./middleware/audit');
const { db, row, rows, run, transaction, withTransaction, paginate } = require('./utils/database');
const { 
  applyFieldSecurity, 
  applyFieldSecurityToList, 
  applyOfficerSecurity,
  logFieldAccess 
} = require('./middleware/fieldSecurity');
const {
  filterOfficerByPermissions,
  filterOfficersListByPermissions,
  recordAuditRead
} = require('./utils/fieldMasking');

const app = express();

// Security middleware
app.use(helmet({
  contentSecurityPolicy: false, // Allow inline scripts for now
  crossOriginEmbedderPolicy: false
}));

// Compression middleware
app.use(compression());

// CORS configuration
const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:3000').split(',');
app.use(cors({
  origin: function(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // Limit each IP to 1000 requests per windowMs (increased for testing)
  message: 'Too many requests from this IP, please try again later'
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Limit each IP to 5 login attempts per windowMs
  skipSuccessfulRequests: true,
  message: 'Too many login attempts, please try again after 15 minutes'
});

app.use('/api/', limiter);
app.use(bodyParser.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Session configuration
app.use(session({
  secret: process.env.SESSION_SECRET || 'big-office-session-secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

// Request logging
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path}`, { 
    ip: req.ip,
    userAgent: req.get('user-agent')
  });
  next();
});

// Middleware to handle .html extension removal
app.use((req, res, next) => {
  if (req.path.indexOf('.') === -1 && req.path !== '/') {
    const file = path.join(__dirname, 'public', req.path + '.html');
    if (fs.existsSync(file)) {
      return res.sendFile(file);
    }
  }
  next();
});

// Root redirect to login
app.get('/', (req, res) => {
  res.redirect('/login');
});

// Officers Directory routes (frontend only - Phase 2)
app.get('/officers', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'officers.html'));
});

app.get('/officers/:id', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'officer-profile.html'));
});

// Helper function alias for backward compatibility
const all = rows;

// ============================================
// SAFE FILE UPLOAD CONFIGURATION
// ============================================
// Using uploadSafe middleware with comprehensive error handling,
// automatic cleanup, and security validations

const uploadDocument = uploadSafe.uploadFirmDocument;
const uploadLetterhead = uploadSafe.uploadLetterhead;
const uploadOfficerPhoto = uploadSafe.uploadOfficerPhoto;
const uploadOfficerDoc = uploadSafe.uploadOfficerDoc;

// Deed Attachment Storage
const deedAttachmentStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = path.join(__dirname, 'uploads', 'deed_attachments');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'deed-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const uploadDeedAttachment = multer({
  storage: deedAttachmentStorage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB per file
  fileFilter: function (req, file, cb) {
    const allowedTypes = /pdf|jpg|jpeg|png|gif|doc|docx|txt/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (mimetype && extname) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only PDF, images, and documents allowed.'));
    }
  }
});

// Initialize alert generator
const alertGenerator = new AlertGenerator();

// Run alert generation every hour
setInterval(() => {
  console.log('Running scheduled alert generation...');
  alertGenerator.generateAllAlerts();
}, 60 * 60 * 1000); // 1 hour

// Run on startup
setTimeout(() => {
  console.log('Initial alert generation...');
  alertGenerator.generateAllAlerts();
}, 5000); // 5 seconds after startup

// ============================================
// FIRMS MANAGEMENT
// ============================================

// List all firms
app.get('/api/firms', authenticate, (req, res) => {
  try {
    const { id } = req.query;
    
    if (id) {
      // Single firm by ID
      const firm = row('SELECT * FROM firms WHERE id = ?', [id]);
      res.json(firm || {});
    } else {
      // All firms
      const firms = rows('SELECT * FROM firms ORDER BY name');
      res.json(firms);
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'DB error' });
  }
});

// Get single firm with related data
app.get('/api/firms/:id', authenticate, checkFirmAccess, (req, res) => {
  try {
    const firm = row('SELECT * FROM firms WHERE id = ?', [req.params.id]);
    if (!firm) return res.status(404).json({ error: 'Firm not found' });
    
    // Get related data
    const licenses = rows('SELECT * FROM licenses WHERE firm_id = ? ORDER BY expiry_date', [req.params.id]);
    const enlistments = rows('SELECT * FROM enlistments WHERE firm_id = ? ORDER BY expiry_date', [req.params.id]);
    const bankAccounts = rows('SELECT * FROM bank_accounts WHERE firm_id = ?', [req.params.id]);
    const contacts = rows('SELECT * FROM contacts WHERE firm_id = ?', [req.params.id]);
    
    res.json({ firm, licenses, enlistments, bankAccounts, contacts });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'DB error' });
  }
});

// Create or update firm
app.post('/api/firms', authenticate, authorize('admin', 'manager'), validate(schemas.firm), auditLog(req => req.body.id ? 'update' : 'create', 'firm'), (req, res) => {
  try {
    const d = req.body;
    
    if (d.id) {
      // Update
      run(`UPDATE firms SET name=?, business_type=?, category=?, tin=?, bin=?, address=?, city=?, 
           postal_code=?, email=?, phone=?, mobile=?, website=?, established_date=?,
           proprietor_name=?, contact_person=?, contact_designation=?, status=?, notes=?,
           updated_at=CURRENT_TIMESTAMP WHERE id=?`,
        [d.name, d.business_type, d.category, d.tin, d.bin, d.address, d.city, d.postal_code, 
         d.email, d.phone, d.mobile, d.website, d.established_date, d.proprietor_name, 
         d.contact_person, d.contact_designation, d.status, d.notes, d.id]);
      res.json({ ok: true, id: d.id });
    } else {
      // Insert
      const info = run(`INSERT INTO firms (name, business_type, category, tin, bin, address, city, 
                        postal_code, email, phone, mobile, website, established_date, 
                        proprietor_name, contact_person, contact_designation, status, notes)
                        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [d.name||'', d.business_type||'', d.category||'', d.tin||'', d.bin||'', d.address||'', d.city||'', 
         d.postal_code||'', d.email||'', d.phone||'', d.mobile||'', d.website||'', 
         d.established_date||'', d.proprietor_name||'', d.contact_person||'', 
         d.contact_designation||'', d.status||'active', d.notes||'']);
      res.json({ ok: true, id: info.lastInsertRowid });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'DB error' });
  }
});

// Delete firm
app.delete('/api/firms/:id', authenticate, authorize('admin'), auditLog('delete', 'firm'), (req, res) => {
  try {
    run('DELETE FROM firms WHERE id = ?', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'DB error' });
  }
});

// ============================================
// eGP REFERENCE DATA API (PHASE 1)
// ============================================

// Get all government agencies
app.get('/api/agencies', authenticate, (req, res) => {
  try {
    const agencies = rows(`
      SELECT id, code, name, name_bn, full_name, ministry, type,
             address, district, contact_person, phone, email,
             egp_enabled, is_active, created_at, updated_at
      FROM agencies
      WHERE is_active = 1
      ORDER BY name
    `);
    res.json(agencies);
  } catch (err) {
    console.error('Error fetching agencies:', err);
    res.status(500).json({ error: 'Failed to fetch agencies' });
  }
});

// Get single agency by ID or code
app.get('/api/agencies/:identifier', authenticate, (req, res) => {
  try {
    const { identifier } = req.params;
    const agency = row(`
      SELECT * FROM agencies 
      WHERE id = ? OR code = ?
    `, [identifier, identifier]);
    
    if (!agency) {
      return res.status(404).json({ error: 'Agency not found' });
    }
    
    // Get tender count for this agency
    const stats = row(`
      SELECT COUNT(*) as tender_count,
             SUM(CASE WHEN status = 'won' THEN 1 ELSE 0 END) as won_count
      FROM tenders 
      WHERE agency_id = ?
    `, [agency.code]);
    
    res.json({ ...agency, ...stats });
  } catch (err) {
    console.error('Error fetching agency:', err);
    res.status(500).json({ error: 'Failed to fetch agency' });
  }
});

// Get all procurement methods
app.get('/api/procurement-methods', authenticate, (req, res) => {
  try {
    const methods = rows(`
      SELECT id, code, name, name_bn, description,
             threshold_min, threshold_max, is_active, created_at
      FROM procurement_methods
      WHERE is_active = 1
      ORDER BY threshold_min DESC NULLS LAST
    `);
    res.json(methods);
  } catch (err) {
    console.error('Error fetching procurement methods:', err);
    res.status(500).json({ error: 'Failed to fetch procurement methods' });
  }
});

// Get tender categories (hierarchical)
app.get('/api/tender-categories', authenticate, (req, res) => {
  try {
    const { parent_id } = req.query;
    
    let sql = `
      SELECT id, code, name, name_bn, parent_id, description, is_active, created_at
      FROM tender_categories_ref
      WHERE is_active = 1
    `;
    const params = [];
    
    if (parent_id !== undefined) {
      if (parent_id === 'null' || parent_id === '') {
        sql += ' AND parent_id IS NULL';
      } else {
        sql += ' AND parent_id = ?';
        params.push(parent_id);
      }
    }
    
    sql += ' ORDER BY name';
    
    const categories = rows(sql, params);
    
    // Add child count for each category
    const categoriesWithChildren = categories.map(cat => {
      const childCount = row(
        'SELECT COUNT(*) as count FROM tender_categories_ref WHERE parent_id = ? AND is_active = 1',
        [cat.code]
      ).count;
      return { ...cat, child_count: childCount };
    });
    
    res.json(categoriesWithChildren);
  } catch (err) {
    console.error('Error fetching tender categories:', err);
    res.status(500).json({ error: 'Failed to fetch tender categories' });
  }
});

// Get category tree (all levels)
app.get('/api/tender-categories/tree', authenticate, (req, res) => {
  try {
    // Get all categories
    const allCategories = rows(`
      SELECT id, code, name, name_bn, parent_id, description, is_active
      FROM tender_categories_ref
      WHERE is_active = 1
      ORDER BY name
    `);
    
    // Build tree structure
    const categoryMap = {};
    const tree = [];
    
    // First pass: create map
    allCategories.forEach(cat => {
      categoryMap[cat.code] = { ...cat, children: [] };
    });
    
    // Second pass: build tree
    allCategories.forEach(cat => {
      if (cat.parent_id) {
        if (categoryMap[cat.parent_id]) {
          categoryMap[cat.parent_id].children.push(categoryMap[cat.code]);
        }
      } else {
        tree.push(categoryMap[cat.code]);
      }
    });
    
    res.json(tree);
  } catch (err) {
    console.error('Error fetching category tree:', err);
    res.status(500).json({ error: 'Failed to fetch category tree' });
  }
});

// ============================================
// COMPETITOR INTELLIGENCE API (PHASE 2)
// ============================================

// Get all competitors
app.get('/api/competitors', authenticate, (req, res) => {
  try {
    const { search, sector, active, blacklisted, limit = 100, offset = 0 } = req.query;
    
    let sql = `
      SELECT c.*,
             (SELECT COUNT(*) FROM competitor_tender_history WHERE competitor_id = c.id) as total_participations,
             (SELECT COUNT(*) FROM competitor_tender_history WHERE competitor_id = c.id AND action = 'won') as total_wins,
             (SELECT COUNT(*) FROM competitor_contacts WHERE competitor_id = c.id) as contact_count
      FROM competitors c
      WHERE 1=1
    `;
    const params = [];
    
    if (search) {
      sql += ' AND (c.name LIKE ? OR c.registration_no LIKE ? OR c.email LIKE ?)';
      const searchPattern = `%${search}%`;
      params.push(searchPattern, searchPattern, searchPattern);
    }
    
    if (sector) {
      sql += ' AND c.typical_sectors LIKE ?';
      params.push(`%${sector}%`);
    }
    
    if (active !== undefined) {
      sql += ' AND c.is_active = ?';
      params.push(active === 'true' || active === '1' ? 1 : 0);
    }
    
    if (blacklisted !== undefined) {
      sql += ' AND c.is_blacklisted = ?';
      params.push(blacklisted === 'true' || blacklisted === '1' ? 1 : 0);
    }
    
    sql += ' ORDER BY c.name LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));
    
    const competitors = rows(sql, params);
    
    // Parse JSON fields
    competitors.forEach(comp => {
      try {
        comp.specialization = JSON.parse(comp.specialization || '[]');
        comp.typical_sectors = JSON.parse(comp.typical_sectors || '[]');
        comp.coverage_areas = JSON.parse(comp.coverage_areas || '[]');
        comp.tags = JSON.parse(comp.tags || '[]');
        comp.win_rate = comp.total_participations > 0 ? ((comp.total_wins / comp.total_participations) * 100).toFixed(1) : 0;
      } catch (e) {}
    });
    
    res.json(competitors);
  } catch (err) {
    console.error('Error fetching competitors:', err);
    res.status(500).json({ error: 'Failed to fetch competitors' });
  }
});

// Get single competitor with details
app.get('/api/competitors/:id', authenticate, (req, res) => {
  try {
    const competitor = row('SELECT * FROM competitors WHERE id = ?', [req.params.id]);
    
    if (!competitor) {
      return res.status(404).json({ error: 'Competitor not found' });
    }
    
    // Parse JSON fields
    try {
      competitor.specialization = JSON.parse(competitor.specialization || '[]');
      competitor.typical_sectors = JSON.parse(competitor.typical_sectors || '[]');
      competitor.coverage_areas = JSON.parse(competitor.coverage_areas || '[]');
      competitor.tags = JSON.parse(competitor.tags || '[]');
    } catch (e) {}
    
    // Get contacts
    const contacts = rows('SELECT * FROM competitor_contacts WHERE competitor_id = ? ORDER BY is_primary DESC, name', [req.params.id]);
    
    // Get participation history
    const history = rows(`
      SELECT cth.*, t.tender_id, t.procuring_entity, t.briefDesc, t.status as tender_status,
             a.name as agency_name
      FROM competitor_tender_history cth
      LEFT JOIN tenders t ON cth.tender_id = t.id
      LEFT JOIN agencies a ON t.agency_id = a.code
      WHERE cth.competitor_id = ?
      ORDER BY cth.action_date DESC
    `, [req.params.id]);
    
    // Calculate statistics
    const stats = row(`
      SELECT
        COUNT(*) as total_participations,
        SUM(CASE WHEN action = 'purchased' THEN 1 ELSE 0 END) as purchased_count,
        SUM(CASE WHEN action = 'submitted' THEN 1 ELSE 0 END) as submitted_count,
        SUM(CASE WHEN action = 'won' THEN 1 ELSE 0 END) as won_count,
        SUM(CASE WHEN action = 'lost' THEN 1 ELSE 0 END) as lost_count,
        SUM(CASE WHEN action = 'disqualified' THEN 1 ELSE 0 END) as disqualified_count,
        AVG(quoted_amount) as avg_bid_amount,
        MIN(quoted_amount) as min_bid_amount,
        MAX(quoted_amount) as max_bid_amount,
        AVG(technical_score) as avg_technical_score,
        AVG(financial_score) as avg_financial_score
      FROM competitor_tender_history
      WHERE competitor_id = ?
    `, [req.params.id]);
    
    stats.win_rate = stats.submitted_count > 0 ? ((stats.won_count / stats.submitted_count) * 100).toFixed(1) : 0;
    stats.success_rate = stats.purchased_count > 0 ? ((stats.submitted_count / stats.purchased_count) * 100).toFixed(1) : 0;
    
    res.json({ competitor, contacts, history, stats });
  } catch (err) {
    console.error('Error fetching competitor:', err);
    res.status(500).json({ error: 'Failed to fetch competitor' });
  }
});

// Create new competitor
app.post('/api/competitors', authenticate, authorize('admin', 'manager'), (req, res) => {
  try {
    const d = req.body;
    
    // Convert arrays to JSON strings
    const specialization = Array.isArray(d.specialization) ? JSON.stringify(d.specialization) : (d.specialization || '[]');
    const typical_sectors = Array.isArray(d.typical_sectors) ? JSON.stringify(d.typical_sectors) : (d.typical_sectors || '[]');
    const coverage_areas = Array.isArray(d.coverage_areas) ? JSON.stringify(d.coverage_areas) : (d.coverage_areas || '[]');
    const tags = Array.isArray(d.tags) ? JSON.stringify(d.tags) : (d.tags || '[]');
    
    const info = run(`
      INSERT INTO competitors (
        name, name_bn, registration_no, company_type, address, city, district, postal_code, country,
        contact_person, phone, mobile, email, website,
        established_year, employee_count, annual_turnover,
        specialization, typical_sectors, coverage_areas,
        rating, reliability_score,
        linkedin_url, facebook_url,
        notes, tags, is_active,
        created_by
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `, [
      d.name, d.name_bn||null, d.registration_no||null, d.company_type||'private_limited',
      d.address||'', d.city||'', d.district||'', d.postal_code||'', d.country||'Bangladesh',
      d.contact_person||'', d.phone||'', d.mobile||'', d.email||'', d.website||'',
      d.established_year||null, d.employee_count||null, d.annual_turnover||null,
      specialization, typical_sectors, coverage_areas,
      d.rating||0, d.reliability_score||0,
      d.linkedin_url||'', d.facebook_url||'',
      d.notes||'', tags, d.is_active !== undefined ? d.is_active : 1,
      req.user.id
    ]);
    
    res.json({ ok: true, id: info.lastInsertRowid });
  } catch (err) {
    console.error('Error creating competitor:', err);
    res.status(500).json({ error: 'Failed to create competitor' });
  }
});

// Update competitor
app.put('/api/competitors/:id', authenticate, authorize('admin', 'manager'), (req, res) => {
  try {
    const d = req.body;
    
    // Convert arrays to JSON strings
    const specialization = Array.isArray(d.specialization) ? JSON.stringify(d.specialization) : d.specialization;
    const typical_sectors = Array.isArray(d.typical_sectors) ? JSON.stringify(d.typical_sectors) : d.typical_sectors;
    const coverage_areas = Array.isArray(d.coverage_areas) ? JSON.stringify(d.coverage_areas) : d.coverage_areas;
    const tags = Array.isArray(d.tags) ? JSON.stringify(d.tags) : d.tags;
    
    run(`
      UPDATE competitors SET
        name = ?, name_bn = ?, registration_no = ?, company_type = ?,
        address = ?, city = ?, district = ?, postal_code = ?, country = ?,
        contact_person = ?, phone = ?, mobile = ?, email = ?, website = ?,
        established_year = ?, employee_count = ?, annual_turnover = ?,
        specialization = ?, typical_sectors = ?, coverage_areas = ?,
        rating = ?, reliability_score = ?,
        linkedin_url = ?, facebook_url = ?,
        notes = ?, tags = ?,
        is_active = ?, is_blacklisted = ?, blacklist_reason = ?,
        updated_at = CURRENT_TIMESTAMP, updated_by = ?
      WHERE id = ?
    `, [
      d.name, d.name_bn, d.registration_no, d.company_type,
      d.address, d.city, d.district, d.postal_code, d.country,
      d.contact_person, d.phone, d.mobile, d.email, d.website,
      d.established_year, d.employee_count, d.annual_turnover,
      specialization, typical_sectors, coverage_areas,
      d.rating, d.reliability_score,
      d.linkedin_url, d.facebook_url,
      d.notes, tags,
      d.is_active, d.is_blacklisted||0, d.blacklist_reason||null,
      req.user.id, req.params.id
    ]);
    
    res.json({ ok: true });
  } catch (err) {
    console.error('Error updating competitor:', err);
    res.status(500).json({ error: 'Failed to update competitor' });
  }
});

// Delete competitor
app.delete('/api/competitors/:id', authenticate, authorize('admin'), (req, res) => {
  try {
    run('DELETE FROM competitors WHERE id = ?', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    console.error('Error deleting competitor:', err);
    res.status(500).json({ error: 'Failed to delete competitor' });
  }
});

// Get competitor contacts
app.get('/api/competitors/:id/contacts', authenticate, (req, res) => {
  try {
    const contacts = rows('SELECT * FROM competitor_contacts WHERE competitor_id = ? ORDER BY is_primary DESC, name', [req.params.id]);
    res.json(contacts);
  } catch (err) {
    console.error('Error fetching contacts:', err);
    res.status(500).json({ error: 'Failed to fetch contacts' });
  }
});

// Add competitor contact
app.post('/api/competitors/:id/contacts', authenticate, authorize('admin', 'manager'), (req, res) => {
  try {
    const d = req.body;
    
    const info = run(`
      INSERT INTO competitor_contacts (competitor_id, name, name_bn, designation, department, phone, mobile, email, is_primary, notes)
      VALUES (?,?,?,?,?,?,?,?,?,?)
    `, [req.params.id, d.name, d.name_bn||null, d.designation||'', d.department||'', d.phone||'', d.mobile||'', d.email||'', d.is_primary||0, d.notes||'']);
    
    res.json({ ok: true, id: info.lastInsertRowid });
  } catch (err) {
    console.error('Error adding contact:', err);
    res.status(500).json({ error: 'Failed to add contact' });
  }
});

// Update competitor contact
app.put('/api/competitors/:id/contacts/:contactId', authenticate, authorize('admin', 'manager'), (req, res) => {
  try {
    const d = req.body;
    
    run(`
      UPDATE competitor_contacts SET
        name = ?, name_bn = ?, designation = ?, department = ?,
        phone = ?, mobile = ?, email = ?, is_primary = ?, notes = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND competitor_id = ?
    `, [d.name, d.name_bn, d.designation, d.department, d.phone, d.mobile, d.email, d.is_primary||0, d.notes||'', req.params.contactId, req.params.id]);
    
    res.json({ ok: true });
  } catch (err) {
    console.error('Error updating contact:', err);
    res.status(500).json({ error: 'Failed to update contact' });
  }
});

// Delete competitor contact
app.delete('/api/competitors/:id/contacts/:contactId', authenticate, authorize('admin', 'manager'), (req, res) => {
  try {
    run('DELETE FROM competitor_contacts WHERE id = ? AND competitor_id = ?', [req.params.contactId, req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    console.error('Error deleting contact:', err);
    res.status(500).json({ error: 'Failed to delete contact' });
  }
});

// Record tender participation
app.post('/api/tenders/:tenderId/participants', authenticate, authorize('admin', 'manager'), (req, res) => {
  try {
    const d = req.body;
    
    const info = run(`
      INSERT INTO competitor_tender_history (
        tender_id, competitor_id, action, action_date,
        quoted_amount, bid_position,
        technical_score, technical_max_score, financial_score, financial_max_score, total_score,
        bid_validity_days, completion_time_offered,
        disqualification_reason, rejection_reason,
        documents_complete, missing_documents,
        notes, internal_notes, created_by
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `, [
      req.params.tenderId, d.competitor_id, d.action, d.action_date||null,
      d.quoted_amount||null, d.bid_position||null,
      d.technical_score||null, d.technical_max_score||100, d.financial_score||null, d.financial_max_score||100, d.total_score||null,
      d.bid_validity_days||null, d.completion_time_offered||null,
      d.disqualification_reason||null, d.rejection_reason||null,
      d.documents_complete||1, d.missing_documents||null,
      d.notes||'', d.internal_notes||'', req.user.id
    ]);
    
    res.json({ ok: true, id: info.lastInsertRowid });
  } catch (err) {
    console.error('Error recording participation:', err);
    res.status(500).json({ error: 'Failed to record participation' });
  }
});

// Get tender participants
app.get('/api/tenders/:tenderId/participants', authenticate, (req, res) => {
  try {
    const participants = rows(`
      SELECT cth.*, c.name as competitor_name, c.registration_no, c.rating, c.reliability_score
      FROM competitor_tender_history cth
      LEFT JOIN competitors c ON cth.competitor_id = c.id
      WHERE cth.tender_id = ?
      ORDER BY cth.action_date DESC, cth.bid_position ASC
    `, [req.params.tenderId]);
    
    res.json(participants);
  } catch (err) {
    console.error('Error fetching participants:', err);
    res.status(500).json({ error: 'Failed to fetch participants' });
  }
});

// Get competitor analytics
app.get('/api/competitors/:id/analytics', authenticate, (req, res) => {
  try {
    const { period = 'all' } = req.query; // all, year, month
    
    let dateFilter = '';
    if (period === 'year') {
      dateFilter = "AND action_date >= date('now', '-1 year')";
    } else if (period === 'month') {
      dateFilter = "AND action_date >= date('now', '-1 month')";
    }
    
    // Overall stats
    const overall = row(`
      SELECT
        COUNT(*) as total_participations,
        SUM(CASE WHEN action = 'won' THEN 1 ELSE 0 END) as wins,
        SUM(CASE WHEN action = 'lost' THEN 1 ELSE 0 END) as losses,
        SUM(CASE WHEN action = 'disqualified' THEN 1 ELSE 0 END) as disqualifications,
        AVG(quoted_amount) as avg_bid,
        AVG(bid_position) as avg_position
      FROM competitor_tender_history
      WHERE competitor_id = ? ${dateFilter}
    `, [req.params.id]);
    
    // By agency
    const byAgency = rows(`
      SELECT
        a.name as agency_name,
        a.code as agency_code,
        COUNT(*) as participation_count,
        SUM(CASE WHEN cth.action = 'won' THEN 1 ELSE 0 END) as wins
      FROM competitor_tender_history cth
      LEFT JOIN tenders t ON cth.tender_id = t.id
      LEFT JOIN agencies a ON t.agency_id = a.code
      WHERE cth.competitor_id = ? ${dateFilter}
      GROUP BY a.code
      ORDER BY participation_count DESC
    `, [req.params.id]);
    
    // By procurement method
    const byMethod = rows(`
      SELECT
        pm.name as method_name,
        pm.code as method_code,
        COUNT(*) as participation_count,
        SUM(CASE WHEN cth.action = 'won' THEN 1 ELSE 0 END) as wins
      FROM competitor_tender_history cth
      LEFT JOIN tenders t ON cth.tender_id = t.id
      LEFT JOIN procurement_methods pm ON t.procurement_method = pm.code
      WHERE cth.competitor_id = ? ${dateFilter}
      GROUP BY pm.code
      ORDER BY participation_count DESC
    `, [req.params.id]);
    
    // Timeline (monthly)
    const timeline = rows(`
      SELECT
        strftime('%Y-%m', action_date) as month,
        COUNT(*) as participation_count,
        SUM(CASE WHEN action = 'won' THEN 1 ELSE 0 END) as wins
      FROM competitor_tender_history
      WHERE competitor_id = ? AND action_date IS NOT NULL ${dateFilter}
      GROUP BY month
      ORDER BY month DESC
      LIMIT 12
    `, [req.params.id]);
    
    res.json({ overall, byAgency, byMethod, timeline });
  } catch (err) {
    console.error('Error fetching analytics:', err);
    res.status(500).json({ error: 'Failed to fetch analytics' });
  }
});

// ============================================
// LICENSES MANAGEMENT
// ============================================

app.get('/api/licenses', authenticate, (req, res) => {
  try {
    const firmId = req.query.firm_id;
    let sql = `SELECT l.*, f.name as firm_name FROM licenses l 
               LEFT JOIN firms f ON l.firm_id = f.id`;
    const params = [];
    
    if (firmId) {
      sql += ' WHERE l.firm_id = ?';
      params.push(firmId);
    }
    
    sql += ' ORDER BY l.expiry_date';
    res.json(rows(sql, params));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'DB error' });
  }
});

app.post('/api/licenses', authenticate, authorize('admin', 'manager'), (req, res) => {
  try {
    const d = req.body;
    
    if (d.id) {
      run(`UPDATE licenses SET firm_id=?, license_type=?, license_number=?, issuing_authority=?,
           issue_date=?, expiry_date=?, renewal_date=?, amount=?, status=?, document_path=?, notes=?,
           updated_at=CURRENT_TIMESTAMP WHERE id=?`,
        [d.firm_id, d.license_type, d.license_number, d.issuing_authority, d.issue_date,
         d.expiry_date, d.renewal_date, d.amount, d.status, d.document_path, d.notes, d.id]);
      res.json({ ok: true, id: d.id });
    } else {
      const info = run(`INSERT INTO licenses (firm_id, license_type, license_number, issuing_authority,
                        issue_date, expiry_date, renewal_date, amount, status, document_path, notes)
                        VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
        [d.firm_id, d.license_type||'', d.license_number||'', d.issuing_authority||'',
         d.issue_date||'', d.expiry_date||'', d.renewal_date||'', d.amount||0, 
         d.status||'active', d.document_path||'', d.notes||'']);
      res.json({ ok: true, id: info.lastInsertRowid });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'DB error' });
  }
});

app.delete('/api/licenses/:id', authenticate, authorize('admin', 'manager'), (req, res) => {
  try {
    run('DELETE FROM licenses WHERE id = ?', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'DB error' });
  }
});

// ============================================
// ENLISTMENTS MANAGEMENT
// ============================================

app.get('/api/enlistments', authenticate, (req, res) => {
  try {
    const firmId = req.query.firm_id;
    let sql = `SELECT e.*, f.name as firm_name FROM enlistments e 
               LEFT JOIN firms f ON e.firm_id = f.id`;
    const params = [];
    
    if (firmId) {
      sql += ' WHERE e.firm_id = ?';
      params.push(firmId);
    }
    
    sql += ' ORDER BY e.expiry_date';
    res.json(rows(sql, params));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'DB error' });
  }
});

app.post('/api/enlistments', authenticate, authorize('admin', 'manager'), (req, res) => {
  try {
    const d = req.body;
    
    if (d.id) {
      run(`UPDATE enlistments SET firm_id=?, authority=?, category=?, work_type=?, 
           enlistment_number=?, issue_date=?, expiry_date=?, renewal_date=?, amount=?, 
           status=?, document_path=?, notes=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`,
        [d.firm_id, d.authority, d.category, d.work_type, d.enlistment_number, d.issue_date,
         d.expiry_date, d.renewal_date, d.amount, d.status, d.document_path, d.notes, d.id]);
      res.json({ ok: true, id: d.id });
    } else {
      const info = run(`INSERT INTO enlistments (firm_id, authority, category, work_type, 
                        enlistment_number, issue_date, expiry_date, renewal_date, amount, 
                        status, document_path, notes) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
        [d.firm_id, d.authority||'', d.category||'', d.work_type||'', d.enlistment_number||'',
         d.issue_date||'', d.expiry_date||'', d.renewal_date||'', d.amount||0, 
         d.status||'active', d.document_path||'', d.notes||'']);
      res.json({ ok: true, id: info.lastInsertRowid });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'DB error' });
  }
});

app.delete('/api/enlistments/:id', authenticate, authorize('admin', 'manager'), (req, res) => {
  try {
    run('DELETE FROM enlistments WHERE id = ?', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'DB error' });
  }
});

// ============================================
// TAX COMPLIANCE
// ============================================

app.get('/api/tax-compliance', authenticate, (req, res) => {
  try {
    const firmId = req.query.firm_id;
    let sql = `SELECT t.*, f.name as firm_name FROM tax_compliance t 
               LEFT JOIN firms f ON t.firm_id = f.id`;
    const params = [];
    
    if (firmId) {
      sql += ' WHERE t.firm_id = ?';
      params.push(firmId);
    }
    
    sql += ' ORDER BY t.due_date DESC';
    res.json(rows(sql, params));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'DB error' });
  }
});

app.post('/api/tax-compliance', authenticate, authorize('admin', 'manager'), (req, res) => {
  try {
    const d = req.body;
    
    if (d.id) {
      run(`UPDATE tax_compliance SET firm_id=?, compliance_type=?, fiscal_year=?, month=?, 
           due_date=?, submission_date=?, amount=?, challan_number=?, status=?, document_path=?, 
           notes=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`,
        [d.firm_id, d.compliance_type, d.fiscal_year, d.month, d.due_date, d.submission_date,
         d.amount, d.challan_number, d.status, d.document_path, d.notes, d.id]);
      res.json({ ok: true, id: d.id });
    } else {
      const info = run(`INSERT INTO tax_compliance (firm_id, compliance_type, fiscal_year, month, 
                        due_date, submission_date, amount, challan_number, status, document_path, notes)
                        VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
        [d.firm_id, d.compliance_type||'', d.fiscal_year||'', d.month||'', d.due_date||'',
         d.submission_date||'', d.amount||0, d.challan_number||'', d.status||'pending', 
         d.document_path||'', d.notes||'']);
      res.json({ ok: true, id: info.lastInsertRowid });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'DB error' });
  }
});

app.delete('/api/tax-compliance/:id', authenticate, authorize('admin', 'manager'), (req, res) => {
  try {
    run('DELETE FROM tax_compliance WHERE id = ?', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'DB error' });
  }
});

// ============================================
// BANK ACCOUNTS
// ============================================

app.get('/api/bank-accounts', authenticate, (req, res) => {
  try {
    const firmId = req.query.firm_id;
    let sql = `SELECT b.*, f.name as firm_name FROM bank_accounts b 
               LEFT JOIN firms f ON b.firm_id = f.id`;
    const params = [];
    
    if (firmId) {
      sql += ' WHERE b.firm_id = ?';
      params.push(firmId);
    }
    
    sql += ' ORDER BY b.bank_name, b.account_number';
    res.json(rows(sql, params));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'DB error' });
  }
});

app.post('/api/bank-accounts', authenticate, authorize('admin', 'manager'), (req, res) => {
  try {
    const d = req.body;
    
    if (d.id) {
      run(`UPDATE bank_accounts SET firm_id=?, bank_name=?, branch_name=?, account_number=?, 
           account_type=?, account_name=?, opening_date=?, maturity_date=?, balance=?, 
           interest_rate=?, signatory_1=?, signatory_2=?, status=?, notes=?, 
           updated_at=CURRENT_TIMESTAMP WHERE id=?`,
        [d.firm_id, d.bank_name, d.branch_name, d.account_number, d.account_type, d.account_name,
         d.opening_date, d.maturity_date, d.balance, d.interest_rate, d.signatory_1, 
         d.signatory_2, d.status, d.notes, d.id]);
      res.json({ ok: true, id: d.id });
    } else {
      const info = run(`INSERT INTO bank_accounts (firm_id, bank_name, branch_name, account_number, 
                        account_type, account_name, opening_date, maturity_date, balance, 
                        interest_rate, signatory_1, signatory_2, status, notes)
                        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [d.firm_id, d.bank_name||'', d.branch_name||'', d.account_number||'', d.account_type||'',
         d.account_name||'', d.opening_date||'', d.maturity_date||'', d.balance||0, 
         d.interest_rate||0, d.signatory_1||'', d.signatory_2||'', d.status||'active', d.notes||'']);
      res.json({ ok: true, id: info.lastInsertRowid });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'DB error' });
  }
});

app.delete('/api/bank-accounts/:id', authenticate, authorize('admin', 'manager'), (req, res) => {
  try {
    run('DELETE FROM bank_accounts WHERE id = ?', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'DB error' });
  }
});

// ============================================
// PAY ORDERS
// ============================================

app.get('/api/pay-orders', authenticate, (req, res) => {
  try {
    const firmId = req.query.firm_id;
    let sql = `SELECT p.*, f.name as firm_name, t.tender_id FROM pay_orders p 
               LEFT JOIN firms f ON p.firm_id = f.id
               LEFT JOIN tenders t ON p.tender_id = t.id`;
    const params = [];
    
    if (firmId) {
      sql += ' WHERE p.firm_id = ?';
      params.push(firmId);
    }
    
    sql += ' ORDER BY p.issue_date DESC';
    res.json(rows(sql, params));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'DB error' });
  }
});

app.post('/api/pay-orders', authenticate, authorize('admin', 'manager'), (req, res) => {
  try {
    const d = req.body;
    
    if (d.id) {
      run(`UPDATE pay_orders SET firm_id=?, tender_id=?, bank_name=?, po_number=?, issue_date=?, 
           amount=?, in_favor_of=?, purpose=?, status=?, encashment_date=?, document_path=?, 
           notes=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`,
        [d.firm_id, d.tender_id, d.bank_name, d.po_number, d.issue_date, d.amount, d.in_favor_of,
         d.purpose, d.status, d.encashment_date, d.document_path, d.notes, d.id]);
      res.json({ ok: true, id: d.id });
    } else {
      const info = run(`INSERT INTO pay_orders (firm_id, tender_id, bank_name, po_number, issue_date, 
                        amount, in_favor_of, purpose, status, encashment_date, document_path, notes)
                        VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
        [d.firm_id, d.tender_id||null, d.bank_name||'', d.po_number||'', d.issue_date||'', d.amount||0,
         d.in_favor_of||'', d.purpose||'', d.status||'active', d.encashment_date||null, 
         d.document_path||'', d.notes||'']);
      res.json({ ok: true, id: info.lastInsertRowid });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'DB error' });
  }
});

app.delete('/api/pay-orders/:id', authenticate, authorize('admin', 'manager'), (req, res) => {
  try {
    run('DELETE FROM pay_orders WHERE id = ?', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'DB error' });
  }
});

// ============================================
// BANK GUARANTEES
// ============================================

app.get('/api/bank-guarantees', authenticate, (req, res) => {
  try {
    const firmId = req.query.firm_id;
    let sql = `SELECT bg.*, f.name as firm_name, t.tender_id, p.project_name 
               FROM bank_guarantees bg 
               LEFT JOIN firms f ON bg.firm_id = f.id
               LEFT JOIN tenders t ON bg.tender_id = t.id
               LEFT JOIN projects p ON bg.project_id = p.id`;
    const params = [];
    
    if (firmId) {
      sql += ' WHERE bg.firm_id = ?';
      params.push(firmId);
    }
    
    sql += ' ORDER BY bg.expiry_date';
    res.json(rows(sql, params));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'DB error' });
  }
});

app.post('/api/bank-guarantees', authenticate, authorize('admin', 'manager'), (req, res) => {
  try {
    const d = req.body;
    
    if (d.id) {
      run(`UPDATE bank_guarantees SET firm_id=?, tender_id=?, project_id=?, bg_type=?, bank_name=?, 
           branch_name=?, bg_number=?, issue_date=?, expiry_date=?, amount=?, percentage=?, 
           in_favor_of=?, claim_period_days=?, commission_rate=?, commission_amount=?, status=?, 
           extension_date=?, release_date=?, document_path=?, notes=?, updated_at=CURRENT_TIMESTAMP 
           WHERE id=?`,
        [d.firm_id, d.tender_id, d.project_id, d.bg_type, d.bank_name, d.branch_name, d.bg_number,
         d.issue_date, d.expiry_date, d.amount, d.percentage, d.in_favor_of, d.claim_period_days,
         d.commission_rate, d.commission_amount, d.status, d.extension_date, d.release_date, 
         d.document_path, d.notes, d.id]);
      res.json({ ok: true, id: d.id });
    } else {
      const info = run(`INSERT INTO bank_guarantees (firm_id, tender_id, project_id, bg_type, bank_name, 
                        branch_name, bg_number, issue_date, expiry_date, amount, percentage, 
                        in_favor_of, claim_period_days, commission_rate, commission_amount, status, 
                        extension_date, release_date, document_path, notes)
                        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [d.firm_id, d.tender_id||null, d.project_id||null, d.bg_type||'', d.bank_name||'', 
         d.branch_name||'', d.bg_number||'', d.issue_date||'', d.expiry_date||'', d.amount||0,
         d.percentage||0, d.in_favor_of||'', d.claim_period_days||0, d.commission_rate||0, 
         d.commission_amount||0, d.status||'active', d.extension_date||null, d.release_date||null,
         d.document_path||'', d.notes||'']);
      res.json({ ok: true, id: info.lastInsertRowid });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'DB error' });
  }
});

app.delete('/api/bank-guarantees/:id', authenticate, authorize('admin', 'manager'), (req, res) => {
  try {
    run('DELETE FROM bank_guarantees WHERE id = ?', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'DB error' });
  }
});

// ============================================
// LOANS
// ============================================

app.get('/api/loans', authenticate, (req, res) => {
  try {
    const firmId = req.query.firm_id;
    let sql = `SELECT l.*, f.name as firm_name FROM loans l 
               LEFT JOIN firms f ON l.firm_id = f.id`;
    const params = [];
    
    if (firmId) {
      sql += ' WHERE l.firm_id = ?';
      params.push(firmId);
    }
    
    sql += ' ORDER BY l.maturity_date';
    res.json(rows(sql, params));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'DB error' });
  }
});

app.post('/api/loans', authenticate, authorize('admin', 'manager'), (req, res) => {
  try {
    const d = req.body;
    
    if (d.id) {
      run(`UPDATE loans SET firm_id=?, bank_name=?, branch_name=?, loan_type=?, loan_number=?, 
           sanction_date=?, loan_amount=?, interest_rate=?, tenure_months=?, installment_amount=?, 
           disbursement_date=?, maturity_date=?, outstanding_amount=?, collateral=?, guarantor=?, 
           status=?, document_path=?, notes=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`,
        [d.firm_id, d.bank_name, d.branch_name, d.loan_type, d.loan_number, d.sanction_date,
         d.loan_amount, d.interest_rate, d.tenure_months, d.installment_amount, d.disbursement_date,
         d.maturity_date, d.outstanding_amount, d.collateral, d.guarantor, d.status, 
         d.document_path, d.notes, d.id]);
      res.json({ ok: true, id: d.id });
    } else {
      const info = run(`INSERT INTO loans (firm_id, bank_name, branch_name, loan_type, loan_number, 
                        sanction_date, loan_amount, interest_rate, tenure_months, installment_amount, 
                        disbursement_date, maturity_date, outstanding_amount, collateral, guarantor, 
                        status, document_path, notes) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [d.firm_id, d.bank_name||'', d.branch_name||'', d.loan_type||'', d.loan_number||'', 
         d.sanction_date||'', d.loan_amount||0, d.interest_rate||0, d.tenure_months||0, 
         d.installment_amount||0, d.disbursement_date||'', d.maturity_date||'', 
         d.outstanding_amount||0, d.collateral||'', d.guarantor||'', d.status||'active', 
         d.document_path||'', d.notes||'']);
      res.json({ ok: true, id: info.lastInsertRowid });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'DB error' });
  }
});

app.delete('/api/loans/:id', authenticate, authorize('admin', 'manager'), (req, res) => {
  try {
    run('DELETE FROM loans WHERE id = ?', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'DB error' });
  }
});

// ============================================
// TENDERS MANAGEMENT (Enhanced)
// ============================================

app.get('/api/tenders', authenticate, (req, res) => {
  try {
    const status = req.query.status;
    const firmId = req.query.firm_id;
    const agencyId = req.query.agency_id;
    const procurementMethod = req.query.procurement_method;
    
    let sql = `SELECT t.*, 
               f.name as assigned_firm_name,
               o.full_name as officer_name,
               o.designation_title,
               o.personal_mobile as officer_mobile,
               o.personal_email as officer_email,
               a.name as agency_name,
               a.code as agency_code,
               pm.name as procurement_method_name,
               pm.code as procurement_method_code,
               tc.name as tender_category_name,
               tc.code as tender_category_code
               FROM tenders t 
               LEFT JOIN firms f ON t.assigned_firm_id = f.id
               LEFT JOIN (
                 SELECT o.id, o.full_name, o.personal_mobile, o.personal_email, d.title as designation_title
                 FROM officers o
                 LEFT JOIN designations d ON o.designation_id = d.id
               ) o ON t.officer_id = o.id
               LEFT JOIN agencies a ON t.agency_id = a.code
               LEFT JOIN procurement_methods pm ON t.procurement_method = pm.code
               LEFT JOIN tender_categories_ref tc ON t.tender_category_ref_id = tc.code
               WHERE 1=1`;
    const params = [];
    
    if (status) {
      sql += ' AND t.status = ?';
      params.push(status);
    }
    
    if (firmId) {
      sql += ' AND t.assigned_firm_id = ?';
      params.push(firmId);
    }
    
    if (agencyId) {
      sql += ' AND t.agency_id = ?';
      params.push(agencyId);
    }
    
    if (procurementMethod) {
      sql += ' AND t.procurement_method = ?';
      params.push(procurementMethod);
    }
    
    sql += ' ORDER BY t.updated_at DESC';
    res.json(rows(sql, params));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'DB error' });
  }
});

app.get('/api/tenders/:id', authenticate, (req, res) => {
  try {
    const tender = row(`SELECT t.*, 
                        o.full_name as officer_name, o.employee_id as officer_employee_id,
                        o.designation_title, o.office_name, 
                        o.personal_mobile as officer_mobile, o.official_mobile as officer_official_mobile,
                        o.personal_email as officer_email, o.official_email as officer_official_email
                        FROM tenders t
                        LEFT JOIN (
                          SELECT o.id, o.full_name, o.employee_id, o.personal_mobile, o.official_mobile,
                                 o.personal_email, o.official_email,
                                 d.title as designation_title, of.office_name
                          FROM officers o
                          LEFT JOIN designations d ON o.designation_id = d.id
                          LEFT JOIN offices of ON o.office_id = of.id
                        ) o ON t.officer_id = o.id
                        WHERE t.id = ?`, [req.params.id]);
    if (!tender) return res.status(404).json({ error: 'Not found' });
    
    const assignments = rows(`SELECT ta.*, f.name as firm_name FROM tender_assignments ta 
                              LEFT JOIN firms f ON ta.firm_id = f.id WHERE ta.tender_id = ?`, 
                              [req.params.id]);
    const costs = rows('SELECT * FROM tender_costs WHERE tender_id = ?', [req.params.id]);
    
    res.json({ tender, assignments, costs });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'DB error' });
  }
});

app.post('/api/tenders', authenticate, authorize('admin', 'manager'), (req, res) => {
  try {
    const d = req.body;
    
    if (d.id) {
      run(`UPDATE tenders SET tender_id=?, procuring_entity=?, official=?, officer_id=?, proc_type=?, method=?, 
           briefDesc=?, itemNo=?, itemDesc=?, techSpec=?, quantity=?, pod=?, delivery=?, invRef=?, 
           docPrice=?, lastPurchase=?, lastSubmission=?, opening=?, tSec=?, validity=?, liquid=?, 
           tenderPrep=?, reqDocs=?, inspection=?, contact=?, tender_value=?, eligibility=?, 
           publication_date=?, site_visit_date=?, pre_bid_meeting=?, status=?, source=?, sector=?, 
           assigned_firm_id=?, is_consortium=?, document_path=?, notes=?, updated_at=CURRENT_TIMESTAMP 
           WHERE id=?`,
        [d.tender_id, d.procuring_entity, d.official, d.officer_id||null, d.proc_type, d.method, d.briefDesc, d.itemNo,
         d.itemDesc, d.techSpec, d.quantity, d.pod, d.delivery, d.invRef, d.docPrice, d.lastPurchase,
         d.lastSubmission, d.opening, d.tSec, d.validity, d.liquid, d.tenderPrep, d.reqDocs, 
         d.inspection, d.contact, d.tender_value, d.eligibility, d.publication_date, d.site_visit_date,
         d.pre_bid_meeting, d.status, d.source, d.sector, d.assigned_firm_id, d.is_consortium, 
         d.document_path, d.notes, d.id]);
      res.json({ ok: true, id: d.id });
    } else {
      const info = run(`INSERT INTO tenders (tender_id, procuring_entity, official, officer_id, proc_type, method, 
                        briefDesc, itemNo, itemDesc, techSpec, quantity, pod, delivery, invRef, docPrice, 
                        lastPurchase, lastSubmission, opening, tSec, validity, liquid, tenderPrep, reqDocs, 
                        inspection, contact, tender_value, eligibility, publication_date, site_visit_date, 
                        pre_bid_meeting, status, source, sector, assigned_firm_id, is_consortium, 
                        document_path, notes) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [d.tender_id||'', d.procuring_entity||'', d.official||'', d.officer_id||null, d.proc_type||'', d.method||'', 
         d.briefDesc||'', d.itemNo||'', d.itemDesc||'', d.techSpec||'', d.quantity||'', d.pod||'', 
         d.delivery||'', d.invRef||'', d.docPrice||'', d.lastPurchase||'', d.lastSubmission||'', 
         d.opening||'', d.tSec||'', d.validity||'', d.liquid||'', d.tenderPrep||'', d.reqDocs||'', 
         d.inspection||'', d.contact||'', d.tender_value||0, d.eligibility||'', d.publication_date||'',
         d.site_visit_date||'', d.pre_bid_meeting||'', d.status||'discovered', d.source||'', 
         d.sector||'', d.assigned_firm_id||null, d.is_consortium||0, d.document_path||'', d.notes||'']);
      res.json({ ok: true, id: info.lastInsertRowid });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'DB error' });
  }
});

app.delete('/api/tenders/:id', authenticate, authorize('admin', 'manager'), (req, res) => {
  try {
    run('DELETE FROM tenders WHERE id = ?', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'DB error' });
  }
});

// ============================================
// PROJECTS
// ============================================

app.get('/api/projects', authenticate, (req, res) => {
  try {
    const firmId = req.query.firm_id;
    let sql = `SELECT p.*, f.name as firm_name, t.tender_id FROM projects p 
               LEFT JOIN firms f ON p.firm_id = f.id
               LEFT JOIN tenders t ON p.tender_id = t.id`;
    const params = [];
    
    if (firmId) {
      sql += ' WHERE p.firm_id = ?';
      params.push(firmId);
    }
    
    sql += ' ORDER BY p.contract_date DESC';
    res.json(rows(sql, params));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'DB error' });
  }
});

app.get('/api/projects/:id', authenticate, (req, res) => {
  try {
    const project = row('SELECT * FROM projects WHERE id = ?', [req.params.id]);
    if (!project) return res.status(404).json({ error: 'Not found' });
    
    const bills = rows('SELECT * FROM project_bills WHERE project_id = ? ORDER BY bill_date', [req.params.id]);
    
    res.json({ project, bills });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'DB error' });
  }
});

app.post('/api/projects', authenticate, authorize('admin', 'manager'), (req, res) => {
  try {
    const d = req.body;
    
    if (d.id) {
      run(`UPDATE projects SET tender_id=?, firm_id=?, project_name=?, contract_number=?, 
           contract_value=?, contract_date=?, commencement_date=?, completion_date=?, 
           extended_completion_date=?, advance_percentage=?, advance_amount=?, advance_received_date=?, 
           retention_percentage=?, retention_amount=?, total_billed=?, total_received=?, 
           outstanding_amount=?, status=?, completion_percentage=?, work_order_path=?, 
           agreement_path=?, notes=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`,
        [d.tender_id, d.firm_id, d.project_name, d.contract_number, d.contract_value, d.contract_date,
         d.commencement_date, d.completion_date, d.extended_completion_date, d.advance_percentage,
         d.advance_amount, d.advance_received_date, d.retention_percentage, d.retention_amount,
         d.total_billed, d.total_received, d.outstanding_amount, d.status, d.completion_percentage,
         d.work_order_path, d.agreement_path, d.notes, d.id]);
      res.json({ ok: true, id: d.id });
    } else {
      const info = run(`INSERT INTO projects (tender_id, firm_id, project_name, contract_number, 
                        contract_value, contract_date, commencement_date, completion_date, 
                        extended_completion_date, advance_percentage, advance_amount, advance_received_date, 
                        retention_percentage, retention_amount, total_billed, total_received, 
                        outstanding_amount, status, completion_percentage, work_order_path, 
                        agreement_path, notes) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [d.tender_id, d.firm_id, d.project_name||'', d.contract_number||'', d.contract_value||0, 
         d.contract_date||'', d.commencement_date||'', d.completion_date||'', 
         d.extended_completion_date||'', d.advance_percentage||0, d.advance_amount||0, 
         d.advance_received_date||'', d.retention_percentage||10, d.retention_amount||0, 
         d.total_billed||0, d.total_received||0, d.outstanding_amount||0, d.status||'ongoing', 
         d.completion_percentage||0, d.work_order_path||'', d.agreement_path||'', d.notes||'']);
      res.json({ ok: true, id: info.lastInsertRowid });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'DB error' });
  }
});

app.delete('/api/projects/:id', authenticate, authorize('admin', 'manager'), (req, res) => {
  try {
    run('DELETE FROM projects WHERE id = ?', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'DB error' });
  }
});

// ============================================
// ALERTS
// ============================================

app.get('/api/alerts', authenticate, (req, res) => {
  try {
    const status = req.query.status || 'pending';
    const firmId = req.query.firm_id;
    
    let sql = `SELECT a.*, f.name as firm_name FROM alerts a 
               LEFT JOIN firms f ON a.firm_id = f.id 
               WHERE a.status = ?`;
    const params = [status];
    
    if (firmId) {
      sql += ' AND a.firm_id = ?';
      params.push(firmId);
    }
    
    sql += ' ORDER BY a.priority DESC, a.alert_date';
    res.json(rows(sql, params));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'DB error' });
  }
});

app.post('/api/alerts/:id/acknowledge', authenticate, (req, res) => {
  try {
    run('UPDATE alerts SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', 
        [req.body.status || 'acknowledged', req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'DB error' });
  }
});

// ============================================
// DASHBOARD & ANALYTICS
// ============================================

app.get('/api/dashboard/stats', authenticate, (req, res) => {
  try {
    const firmId = req.query.firm_id;
    const whereClause = firmId ? `WHERE firm_id = ${firmId}` : '';
    const tenderWhere = firmId ? `WHERE assigned_firm_id = ${firmId}` : '';
    
    const stats = {
      firms: row(`SELECT COUNT(*) as count FROM firms ${whereClause}`),
      tenders: {
        total: row(`SELECT COUNT(*) as count FROM tenders ${tenderWhere}`),
        discovered: row(`SELECT COUNT(*) as count FROM tenders ${tenderWhere} ${tenderWhere ? 'AND' : 'WHERE'} status = 'discovered'`),
        preparing: row(`SELECT COUNT(*) as count FROM tenders ${tenderWhere} ${tenderWhere ? 'AND' : 'WHERE'} status = 'preparing'`),
        submitted: row(`SELECT COUNT(*) as count FROM tenders ${tenderWhere} ${tenderWhere ? 'AND' : 'WHERE'} status = 'submitted'`),
        won: row(`SELECT COUNT(*) as count FROM tenders ${tenderWhere} ${tenderWhere ? 'AND' : 'WHERE'} status = 'won'`),
      },
      projects: {
        total: row(`SELECT COUNT(*) as count FROM projects ${whereClause}`),
        ongoing: row(`SELECT COUNT(*) as count FROM projects ${whereClause} ${whereClause ? 'AND' : 'WHERE'} status = 'ongoing'`),
      },
      alerts: {
        high: row(`SELECT COUNT(*) as count FROM alerts ${whereClause} ${whereClause ? 'AND' : 'WHERE'} priority = 'high' AND status = 'pending'`),
        medium: row(`SELECT COUNT(*) as count FROM alerts ${whereClause} ${whereClause ? 'AND' : 'WHERE'} priority = 'medium' AND status = 'pending'`),
      },
      bankGuarantees: {
        active: row(`SELECT COUNT(*) as count, SUM(amount) as total FROM bank_guarantees ${whereClause} ${whereClause ? 'AND' : 'WHERE'} status = 'active'`),
      },
      licenses: {
        expiring: row(`SELECT COUNT(*) as count FROM licenses ${whereClause} ${whereClause ? 'AND' : 'WHERE'} status = 'active' AND expiry_date <= date('now', '+30 days')`),
      },
      team_members: {
        total: row(`SELECT COUNT(*) as count FROM team_members WHERE status = 'active'`),
        on_leave: row(`SELECT COUNT(*) as count FROM team_members WHERE status = 'on_leave'`),
      },
      tasks: {
        total: row(`SELECT COUNT(*) as count FROM tasks WHERE status NOT IN ('completed', 'cancelled')`),
        overdue: row(`SELECT COUNT(*) as count FROM tasks WHERE date(due_date) < date('now') AND status NOT IN ('completed', 'cancelled')`),
        high_priority: row(`SELECT COUNT(*) as count FROM tasks WHERE priority = 'high' AND status NOT IN ('completed', 'cancelled')`),
        pending: row(`SELECT COUNT(*) as count FROM tasks WHERE status = 'pending'`),
      },
    };
    
    res.json(stats);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'DB error' });
  }
});

// ============================================
// CONTACTS
// ============================================

app.get('/api/contacts', authenticate, (req, res) => {
  try {
    const firmId = req.query.firm_id;
    let sql = `SELECT c.*, f.name as firm_name FROM contacts c 
               LEFT JOIN firms f ON c.firm_id = f.id`;
    const params = [];
    
    if (firmId) {
      sql += ' WHERE c.firm_id = ?';
      params.push(firmId);
    }
    
    sql += ' ORDER BY c.name';
    res.json(rows(sql, params));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'DB error' });
  }
});

app.post('/api/contacts', authenticate, (req, res) => {
  try {
    const d = req.body;
    
    if (d.id) {
      run(`UPDATE contacts SET firm_id=?, contact_type=?, name=?, designation=?, department=?, 
           email=?, phone=?, mobile=?, nid=?, address=?, authority_type=?, notes=?, 
           updated_at=CURRENT_TIMESTAMP WHERE id=?`,
        [d.firm_id, d.contact_type, d.name, d.designation, d.department, d.email, d.phone, 
         d.mobile, d.nid, d.address, d.authority_type, d.notes, d.id]);
      res.json({ ok: true, id: d.id });
    } else {
      const info = run(`INSERT INTO contacts (firm_id, contact_type, name, designation, department, 
                        email, phone, mobile, nid, address, authority_type, notes)
                        VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
        [d.firm_id||null, d.contact_type||'', d.name||'', d.designation||'', d.department||'', 
         d.email||'', d.phone||'', d.mobile||'', d.nid||'', d.address||'', d.authority_type||'', 
         d.notes||'']);
      res.json({ ok: true, id: info.lastInsertRowid });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'DB error' });
  }
});

app.delete('/api/contacts/:id', authenticate, authorize('admin', 'manager'), (req, res) => {
  try {
    run('DELETE FROM contacts WHERE id = ?', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'DB error' });
  }
});

// ============================================
// TEAM MEMBERS
// ============================================

// Get all team members
app.get('/api/team-members', authenticate, (req, res) => {
  try {
    const { status } = req.query;
    let query = 'SELECT * FROM team_members';
    let params = [];
    
    if (status) {
      query += ' WHERE status = ?';
      params.push(status);
    }
    
    query += ' ORDER BY name';
    const members = rows(query, params);
    res.json(members);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'DB error' });
  }
});

// Get single team member
app.get('/api/team-members/:id', authenticate, (req, res) => {
  try {
    const member = row('SELECT * FROM team_members WHERE id = ?', [req.params.id]);
    if (!member) return res.status(404).json({ error: 'Member not found' });
    
    // Get member's task statistics
    const stats = row(`
      SELECT 
        COUNT(*) as total_tasks,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed_tasks,
        SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END) as active_tasks,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending_tasks
      FROM tasks 
      WHERE assigned_to = ?
    `, [req.params.id]);
    
    res.json({ ...member, task_stats: stats });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'DB error' });
  }
});

// Add new team member
app.post('/api/team-members', authenticate, authorize('admin', 'manager'), (req, res) => {
  try {
    const { name, designation, department, email, mobile, role, status, joining_date, photo_url, notes } = req.body;
    
    const result = run(`
      INSERT INTO team_members (name, designation, department, email, mobile, role, status, joining_date, photo_url, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [name, designation, department, email, mobile, role, status || 'active', joining_date, photo_url, notes]);
    
    res.json({ ok: true, id: result.lastInsertRowid });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'DB error' });
  }
});

// Update team member
app.put('/api/team-members/:id', authenticate, authorize('admin', 'manager'), (req, res) => {
  try {
    const { name, designation, department, email, mobile, role, status, joining_date, photo_url, notes } = req.body;
    
    run(`
      UPDATE team_members 
      SET name = ?, designation = ?, department = ?, email = ?, mobile = ?, 
          role = ?, status = ?, joining_date = ?, photo_url = ?, notes = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [name, designation, department, email, mobile, role, status, joining_date, photo_url, notes, req.params.id]);
    
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'DB error' });
  }
});

// Delete team member
app.delete('/api/team-members/:id', authenticate, authorize('admin', 'manager'), (req, res) => {
  try {
    run('DELETE FROM team_members WHERE id = ?', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'DB error' });
  }
});

// ============================================
// OFFICERS DIRECTORY (Phase 3-5)
// ============================================

// Get all officers with filters (authenticated users only - internal system)
app.get('/api/officers', authenticate, (req, res) => {
  try {
    const { 
      search, designation_id, office_id, status, 
      gender, district, division, position_id,
      joining_date_from, joining_date_to,
      sort_by, sort_order,
      page, limit 
    } = req.query;
    
    let query = `
      SELECT 
        o.id, o.full_name, o.name_bangla, o.employee_id,
        o.personal_mobile, o.official_mobile, o.personal_email, o.official_email,
        o.designation_id, o.office_id, o.employment_status, o.photo_url,
        o.current_grade, o.joining_date, o.department, o.gender, o.district, o.division,
        o.date_of_birth, o.nid_number, o.blood_group,
        d.title as designation_title, d.title_bangla as designation_title_bangla,
        of.office_name, of.office_code, of.district as office_district,
        p.title as position_title
      FROM officers o
      LEFT JOIN designations d ON o.designation_id = d.id
      LEFT JOIN offices of ON o.office_id = of.id
      LEFT JOIN positions p ON o.position_id = p.id
      WHERE 1=1
    `;
    const params = [];
    
    // Search filter - search across multiple fields
    if (search) {
      query += ` AND (
        o.full_name LIKE ? OR 
        o.name_bangla LIKE ? OR 
        o.employee_id LIKE ? OR 
        o.personal_mobile LIKE ? OR
        o.official_mobile LIKE ? OR
        o.personal_email LIKE ? OR
        o.nid_number LIKE ? OR
        d.title LIKE ? OR
        of.office_name LIKE ? OR
        p.title LIKE ? OR
        o.department LIKE ?
      )`;
      const searchPattern = `%${search}%`;
      params.push(searchPattern, searchPattern, searchPattern, searchPattern, searchPattern, searchPattern, searchPattern, searchPattern, searchPattern, searchPattern, searchPattern);
    }
    
    // Designation filter
    if (designation_id) {
      query += ' AND o.designation_id = ?';
      params.push(designation_id);
    }
    
    // Office filter
    if (office_id) {
      query += ' AND o.office_id = ?';
      params.push(office_id);
    }
    
    // Position filter
    if (position_id) {
      query += ' AND o.position_id = ?';
      params.push(position_id);
    }
    
    // Status filter
    if (status) {
      query += ' AND o.employment_status = ?';
      params.push(status);
    } else {
      // Default: only show active officers
      query += ' AND o.employment_status = ?';
      params.push('active');
    }
    
    // Gender filter
    if (gender) {
      query += ' AND o.gender = ?';
      params.push(gender);
    }
    
    // District filter
    if (district) {
      query += ' AND o.district = ?';
      params.push(district);
    }
    
    // Division filter
    if (division) {
      query += ' AND o.division = ?';
      params.push(division);
    }
    
    // Date range filters
    if (joining_date_from) {
      query += ' AND o.joining_date >= ?';
      params.push(joining_date_from);
    }
    
    if (joining_date_to) {
      query += ' AND o.joining_date <= ?';
      params.push(joining_date_to);
    }
    
    // Sorting
    const validSortFields = ['full_name', 'employee_id', 'joining_date', 'current_grade', 'designation_title', 'office_name'];
    const sortField = validSortFields.includes(sort_by) ? sort_by : 'full_name';
    const sortDirection = sort_order === 'desc' ? 'DESC' : 'ASC';
    
    if (sortField === 'designation_title') {
      query += ` ORDER BY d.title ${sortDirection}`;
    } else if (sortField === 'office_name') {
      query += ` ORDER BY of.office_name ${sortDirection}`;
    } else {
      query += ` ORDER BY o.${sortField} ${sortDirection}`;
    }
    
    // Pagination
    const pageNum = parseInt(page) || 1;
    const pageLimit = parseInt(limit) || 50;
    const offset = (pageNum - 1) * pageLimit;
    
    // Get total count
    const countQuery = query.replace(/SELECT.*FROM/s, 'SELECT COUNT(*) as total FROM').replace(/ORDER BY.*$/s, '');
    const { total } = row(countQuery, params);
    
    // Get paginated results
    query += ' LIMIT ? OFFSET ?';
    params.push(pageLimit, offset);
    
    const officers = rows(query, params);
    
    // Apply field-level security based on user role and visibility settings
    const filteredOfficers = filterOfficersListByPermissions(officers, req.user, {
      includeMaskedFields: true,
      recordAudit: false // Don't audit list views, only detail views
    });
    
    res.json({
      officers: filteredOfficers,
      pagination: {
        page: pageNum,
        limit: pageLimit,
        total: filteredOfficers.length,
        pages: Math.ceil(filteredOfficers.length / pageLimit)
      }
    });
  } catch (err) {
    console.error('Get officers error:', err);
    res.status(500).json({ error: 'DB error' });
  }
});

// Get single officer with full details
app.get('/api/officers/:id', authenticate, (req, res) => {
  try {
    // Get officer basic info
    const officer = row(`
      SELECT 
        o.*,
        d.title as designation_title, d.title_bangla as designation_title_bangla, d.grade_level,
        p.title as position_title, p.department as position_department,
        of.office_name, of.office_name_bangla, of.office_code, of.office_type,
        of.address as office_address, of.district as office_district, of.division as office_division
      FROM officers o
      LEFT JOIN designations d ON o.designation_id = d.id
      LEFT JOIN positions p ON o.position_id = p.id
      LEFT JOIN offices of ON o.office_id = of.id
      WHERE o.id = ?
    `, [req.params.id]);
    
    if (!officer) {
      return res.status(404).json({ error: 'Officer not found' });
    }
    
    // Log access to sensitive fields for audit trail
    logFieldAccess(
      db, 
      req.user?.id, 
      officer.id, 
      ['nid_number', 'personal_mobile', 'personal_email', 'basic_salary'],
      req.ip
    );
    
    // Apply comprehensive field-level security with masking and audit
    const filteredOfficer = filterOfficerByPermissions(officer, req.user, {
      includeMaskedFields: true,
      recordAudit: true,
      requestId: req.id || req.headers['x-request-id'],
      ipAddress: req.ip,
      userAgent: req.get('user-agent')
    });
    
    if (!filteredOfficer) {
      return res.status(403).json({ error: 'Officer profile not available' });
    }
    
    // Get transfer history
    const transfers = rows(`
      SELECT 
        th.*,
        of1.office_name as from_office_name, of1.office_code as from_office_code,
        of2.office_name as to_office_name, of2.office_code as to_office_code,
        d1.title as from_designation_title,
        d2.title as to_designation_title
      FROM transfer_history th
      LEFT JOIN offices of1 ON th.from_office_id = of1.id
      LEFT JOIN offices of2 ON th.to_office_id = of2.id
      LEFT JOIN designations d1 ON th.from_designation_id = d1.id
      LEFT JOIN designations d2 ON th.to_designation_id = d2.id
      WHERE th.officer_id = ?
      ORDER BY th.transfer_date DESC
    `, [req.params.id]);
    
    // Get promotion history
    const promotions = rows(`
      SELECT 
        ph.*,
        d1.title as from_designation_title,
        d2.title as to_designation_title
      FROM promotion_history ph
      LEFT JOIN designations d1 ON ph.from_designation_id = d1.id
      LEFT JOIN designations d2 ON ph.to_designation_id = d2.id
      WHERE ph.officer_id = ?
      ORDER BY ph.promotion_date DESC
    `, [req.params.id]);
    
    // Get documents
    const documents = rows(`
      SELECT * FROM officer_documents
      WHERE officer_id = ?
      ORDER BY uploaded_at DESC
    `, [req.params.id]);
    
    // Get related tenders
    const relatedTenders = rows(`
      SELECT id, tender_id, procuring_entity, briefDesc, status, 
             lastSubmission, opening, tender_value, created_at
      FROM tenders
      WHERE officer_id = ?
      ORDER BY created_at DESC
      LIMIT 10
    `, [req.params.id]);
    
    // Get related projects
    const relatedProjects = rows(`
      SELECT id, project_name, contract_number, status, commencement_date, completion_date, contract_value
      FROM projects
      WHERE coordinator_id = ?
      ORDER BY commencement_date DESC
      LIMIT 10
    `, [req.params.id]);
    
    // Combine transfer and promotion into timeline
    const timeline = [
      ...transfers.map(t => ({
        type: 'transfer',
        date: t.transfer_date,
        ...t
      })),
      ...promotions.map(p => ({
        type: 'promotion',
        date: p.promotion_date,
        ...p
      }))
    ].sort((a, b) => new Date(b.date) - new Date(a.date));
    
    res.json({
      officer: filteredOfficer,
      timeline,
      transfers,
      promotions,
      documents,
      relatedTenders,
      relatedProjects
    });
  } catch (err) {
    console.error('Get officer details error:', err);
    res.status(500).json({ error: 'DB error' });
  }
});

// Mount officers unmask routes
const officersUnmaskRouter = require('./routes/officersUnmask');
app.use('/api/officers', authenticate, officersUnmaskRouter);
app.use('/api/unmask-requests', authenticate, officersUnmaskRouter);

// Get designations list (for filters)
app.get('/api/designations', authenticate, (req, res) => {
  try {
    const designations = rows(`
      SELECT * FROM designations 
      WHERE is_active = 1 
      ORDER BY grade_level, title
    `);
    res.json(designations);
  } catch (err) {
    console.error('Get designations error:', err);
    res.status(500).json({ error: 'DB error' });
  }
});

// Get offices list (for filters)
app.get('/api/offices', authenticate, (req, res) => {
  try {
    const offices = rows(`
      SELECT * FROM offices 
      WHERE is_active = 1 
      ORDER BY office_type, office_name
    `);
    res.json(offices);
  } catch (err) {
    console.error('Get offices error:', err);
    res.status(500).json({ error: 'DB error' });
  }
});

// Get positions list (for dropdowns)
app.get('/api/positions', authenticate, (req, res) => {
  try {
    const positions = rows(`
      SELECT * FROM positions 
      WHERE is_active = 1 
      ORDER BY title
    `);
    res.json(positions);
  } catch (err) {
    console.error('Get positions error:', err);
    res.status(500).json({ error: 'DB error' });
  }
});

// Get officers statistics
app.get('/api/officers/stats', authenticate, (req, res) => {
  try {
    const stats = {
      total: row('SELECT COUNT(*) as count FROM officers').count,
      active: row('SELECT COUNT(*) as count FROM officers WHERE employment_status = ?', ['active']).count,
      inactive: row('SELECT COUNT(*) as count FROM officers WHERE employment_status = ?', ['inactive']).count,
      retired: row('SELECT COUNT(*) as count FROM officers WHERE employment_status = ?', ['retired']).count,
      
      byGender: rows('SELECT gender, COUNT(*) as count FROM officers GROUP BY gender'),
      byDesignation: rows(`
        SELECT d.title as designation, COUNT(o.id) as count 
        FROM officers o 
        LEFT JOIN designations d ON o.designation_id = d.id 
        GROUP BY o.designation_id 
        ORDER BY count DESC 
        LIMIT 10
      `),
      byOffice: rows(`
        SELECT of.office_name as office, COUNT(o.id) as count 
        FROM officers o 
        LEFT JOIN offices of ON o.office_id = of.id 
        GROUP BY o.office_id 
        ORDER BY count DESC 
        LIMIT 10
      `),
      byDistrict: rows('SELECT district, COUNT(*) as count FROM officers WHERE district IS NOT NULL GROUP BY district ORDER BY count DESC'),
      
      recentJoinings: rows(`
        SELECT full_name, designation_title, joining_date 
        FROM (
          SELECT o.full_name, d.title as designation_title, o.joining_date
          FROM officers o
          LEFT JOIN designations d ON o.designation_id = d.id
          WHERE o.joining_date IS NOT NULL
          ORDER BY o.joining_date DESC
          LIMIT 5
        )
      `)
    };
    
    res.json(stats);
  } catch (err) {
    console.error('Get officers stats error:', err);
    res.status(500).json({ error: 'DB error' });
  }
});

// Export officers to Excel
app.get('/api/officers/export/excel', authenticate, authorize('admin', 'hr'), async (req, res) => {
  try {
    const ExcelJS = require('exceljs');
    const { search, designation_id, office_id, status } = req.query;
    
    // Build query (same filters as list endpoint)
    let query = `
      SELECT 
        o.employee_id, o.full_name, o.name_bangla,
        o.gender, o.date_of_birth, o.nid_number,
        o.personal_mobile, o.official_mobile,
        o.personal_email, o.official_email,
        o.present_address, o.district, o.division,
        o.joining_date, o.employment_status, o.current_grade,
        o.basic_salary, o.education_qualification,
        d.title as designation, of.office_name as office,
        p.title as position
      FROM officers o
      LEFT JOIN designations d ON o.designation_id = d.id
      LEFT JOIN offices of ON o.office_id = of.id
      LEFT JOIN positions p ON o.position_id = p.id
      WHERE 1=1
    `;
    const params = [];
    
    if (search) {
      query += ` AND (o.full_name LIKE ? OR o.employee_id LIKE ?)`;
      params.push(`%${search}%`, `%${search}%`);
    }
    if (designation_id) {
      query += ' AND o.designation_id = ?';
      params.push(designation_id);
    }
    if (office_id) {
      query += ' AND o.office_id = ?';
      params.push(office_id);
    }
    if (status) {
      query += ' AND o.employment_status = ?';
      params.push(status);
    }
    
    query += ' ORDER BY o.full_name';
    
    const officers = rows(query, params);
    
    // Create workbook
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Officers Directory');
    
    // Define columns
    worksheet.columns = [
      { header: 'Employee ID', key: 'employee_id', width: 15 },
      { header: 'Full Name', key: 'full_name', width: 25 },
      { header: 'Name (Bangla)', key: 'name_bangla', width: 25 },
      { header: 'Designation', key: 'designation', width: 25 },
      { header: 'Office', key: 'office', width: 30 },
      { header: 'Position', key: 'position', width: 20 },
      { header: 'Gender', key: 'gender', width: 10 },
      { header: 'Date of Birth', key: 'date_of_birth', width: 15 },
      { header: 'NID', key: 'nid_number', width: 18 },
      { header: 'Personal Mobile', key: 'personal_mobile', width: 15 },
      { header: 'Official Mobile', key: 'official_mobile', width: 15 },
      { header: 'Personal Email', key: 'personal_email', width: 25 },
      { header: 'Official Email', key: 'official_email', width: 25 },
      { header: 'Address', key: 'present_address', width: 35 },
      { header: 'District', key: 'district', width: 15 },
      { header: 'Division', key: 'division', width: 15 },
      { header: 'Joining Date', key: 'joining_date', width: 15 },
      { header: 'Status', key: 'employment_status', width: 12 },
      { header: 'Grade', key: 'current_grade', width: 10 },
      { header: 'Basic Salary', key: 'basic_salary', width: 15 },
      { header: 'Education', key: 'education_qualification', width: 30 }
    ];
    
    // Style header row
    worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    worksheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF2c7a3a' }
    };
    worksheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };
    
    // Add data
    officers.forEach(officer => {
      worksheet.addRow(officer);
    });
    
    // Auto-filter
    worksheet.autoFilter = {
      from: 'A1',
      to: 'U1'
    };
    
    // Log activity
    logActivity(req.user.id, 'officers_exported', null, null, 
      `Exported ${officers.length} officers to Excel`, req.ip);
    
    // Send file
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=officers-${Date.now()}.xlsx`);
    
    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error('Export officers error:', err);
    res.status(500).json({ error: 'Export failed' });
  }
});

// Create new officer
app.post('/api/officers', authenticate, authorize('admin', 'hr'), uploadOfficerPhoto.single('photo'), async (req, res) => {
  try {
    const officerId = 'officer-' + Date.now();
    const userId = req.user.id;
    
    // Extract form data
    const {
      full_name, name_bangla, father_name, mother_name, date_of_birth, gender,
      blood_group, religion, marital_status, nid_number, passport_number,
      personal_mobile, official_mobile, personal_email, official_email,
      emergency_contact_name, emergency_contact_phone,
      present_address, permanent_address, district, division, post_code,
      employee_id, joining_date, designation_id, position_id, office_id,
      department, current_grade, current_salary, employment_status,
      highest_degree, institution, passing_year, cgpa,
      phone_visibility, email_visibility, nid_visibility, 
      profile_published, verification_status, consent_record
    } = req.body;
    
    // Validation
    if (!full_name || !date_of_birth || !gender || !nid_number || 
        !personal_mobile || !personal_email || !present_address ||
        !employee_id || !joining_date || !designation_id || !office_id ||
        !employment_status || !highest_degree) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    // Check for duplicates
    const duplicateCheck = row(`
      SELECT id FROM officers 
      WHERE employee_id = ? OR nid_number = ? OR personal_email = ? OR personal_mobile = ?
    `, [employee_id, nid_number, personal_email, personal_mobile]);
    
    if (duplicateCheck) {
      return res.status(409).json({ error: 'Officer with same employee ID, NID, email, or mobile already exists' });
    }
    
    // Handle photo upload
    let photoUrl = null;
    if (req.file) {
      photoUrl = `/uploads/officers/${req.file.filename}`;
    }
    
    // Insert officer
    run(`
      INSERT INTO officers (
        id, full_name, name_bangla, father_name, mother_name, date_of_birth, gender,
        blood_group, religion, marital_status, nid_number, passport_number,
        personal_mobile, official_mobile, personal_email, official_email,
        emergency_contact_name, emergency_contact_phone,
        present_address, permanent_address, district, division, post_code,
        employee_id, joining_date, designation_id, position_id, office_id,
        department, current_grade, current_salary, employment_status,
        highest_degree, institution, passing_year, cgpa,
        photo_url, 
        phone_visibility, email_visibility, nid_visibility, 
        profile_published, verification_status, consent_record,
        created_by, updated_by, created_at, updated_at
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?,
        ?, ?, ?,
        ?, ?, ?,
        ?, ?, datetime('now'), datetime('now')
      )
    `, [
      officerId, full_name, name_bangla, father_name, mother_name, date_of_birth, gender,
      blood_group, religion, marital_status, nid_number, passport_number,
      personal_mobile, official_mobile, personal_email, official_email,
      emergency_contact_name, emergency_contact_phone,
      present_address, permanent_address, district, division, post_code,
      employee_id, joining_date, designation_id, position_id || null, office_id,
      department, current_grade || null, current_salary || null, employment_status,
      highest_degree, institution, passing_year || null, cgpa,
      photoUrl,
      phone_visibility || 'internal', email_visibility || 'internal', nid_visibility || 'restricted',
      profile_published == '1' ? 1 : 0, verification_status || 'pending', consent_record || null,
      userId, userId
    ]);
    
    // Log activity
    logActivity(userId, 'officer_created', null, null, 
      `Created officer: ${full_name} (${employee_id})`, req.ip);
    
    // Get created officer
    const officer = row(`
      SELECT o.*, d.title as designation_title, of.office_name
      FROM officers o
      LEFT JOIN designations d ON o.designation_id = d.id
      LEFT JOIN offices of ON o.office_id = of.id
      WHERE o.id = ?
    `, [officerId]);
    
    res.status(201).json({ 
      success: true,
      message: 'Officer created successfully',
      officer 
    });
  } catch (err) {
    console.error('Create officer error:', err);
    res.status(500).json({ error: err.message || 'Failed to create officer' });
  }
});

// Update officer
app.put('/api/officers/:id', authenticate, authorize('admin', 'hr'), uploadOfficerPhoto.single('photo'), async (req, res) => {
  try {
    const officerId = req.params.id;
    const userId = req.user.id;
    
    // Check if officer exists
    const existing = row('SELECT * FROM officers WHERE id = ?', [officerId]);
    if (!existing) {
      return res.status(404).json({ error: 'Officer not found' });
    }
    
    // Extract form data
    const {
      full_name, name_bangla, father_name, mother_name, date_of_birth, gender,
      blood_group, religion, marital_status, nid_number, passport_number,
      personal_mobile, official_mobile, personal_email, official_email,
      emergency_contact_name, emergency_contact_phone,
      present_address, permanent_address, district, division, post_code,
      employee_id, joining_date, designation_id, position_id, office_id,
      department, current_grade, current_salary, employment_status,
      highest_degree, institution, passing_year, cgpa,
      phone_visibility, email_visibility, nid_visibility, 
      profile_published, verification_status, consent_record
    } = req.body;
    
    // Check for duplicates (excluding current officer)
    const duplicateCheck = row(`
      SELECT id FROM officers 
      WHERE id != ? AND (employee_id = ? OR nid_number = ? OR personal_email = ? OR personal_mobile = ?)
    `, [officerId, employee_id, nid_number, personal_email, personal_mobile]);
    
    if (duplicateCheck) {
      return res.status(409).json({ error: 'Another officer with same employee ID, NID, email, or mobile already exists' });
    }
    
    // Handle photo upload
    let photoUrl = existing.photo_url;
    if (req.file) {
      photoUrl = `/uploads/officers/${req.file.filename}`;
      
      // Delete old photo if exists
      if (existing.photo_url) {
        const oldPhotoPath = path.join(__dirname, existing.photo_url);
        if (fs.existsSync(oldPhotoPath)) {
          fs.unlinkSync(oldPhotoPath);
        }
      }
    }
    
    // Update officer
    run(`
      UPDATE officers SET
        full_name = ?, name_bangla = ?, father_name = ?, mother_name = ?,
        date_of_birth = ?, gender = ?, blood_group = ?, religion = ?,
        marital_status = ?, nid_number = ?, passport_number = ?,
        personal_mobile = ?, official_mobile = ?, personal_email = ?, official_email = ?,
        emergency_contact_name = ?, emergency_contact_phone = ?,
        present_address = ?, permanent_address = ?, district = ?, division = ?, post_code = ?,
        employee_id = ?, joining_date = ?, designation_id = ?, position_id = ?, office_id = ?,
        department = ?, current_grade = ?, current_salary = ?, employment_status = ?,
        highest_degree = ?, institution = ?, passing_year = ?, cgpa = ?,
        photo_url = ?,
        phone_visibility = ?, email_visibility = ?, nid_visibility = ?,
        profile_published = ?, verification_status = ?, consent_record = ?,
        updated_by = ?, updated_at = datetime('now')
      WHERE id = ?
    `, [
      full_name, name_bangla, father_name, mother_name,
      date_of_birth, gender, blood_group, religion,
      marital_status, nid_number, passport_number,
      personal_mobile, official_mobile, personal_email, official_email,
      emergency_contact_name, emergency_contact_phone,
      present_address, permanent_address, district, division, post_code,
      employee_id, joining_date, designation_id, position_id || null, office_id,
      department, current_grade || null, current_salary || null, employment_status,
      highest_degree, institution, passing_year || null, cgpa,
      photoUrl,
      phone_visibility || 'internal', email_visibility || 'internal', nid_visibility || 'restricted',
      profile_published == '1' ? 1 : 0, verification_status || 'pending', consent_record || null,
      userId, officerId
    ]);
    
    // Log activity
    logActivity(userId, 'officer_updated', null, null,
      `Updated officer: ${full_name} (${employee_id})`, req.ip);
    
    // Get updated officer
    const officer = row(`
      SELECT o.*, d.title as designation_title, of.office_name
      FROM officers o
      LEFT JOIN designations d ON o.designation_id = d.id
      LEFT JOIN offices of ON o.office_id = of.id
      WHERE o.id = ?
    `, [officerId]);
    
    res.json({
      success: true,
      message: 'Officer updated successfully',
      officer
    });
  } catch (err) {
    console.error('Update officer error:', err);
    res.status(500).json({ error: err.message || 'Failed to update officer' });
  }
});

// Delete officer
app.delete('/api/officers/:id', authenticate, authorize('admin'), async (req, res) => {
  try {
    const officerId = req.params.id;
    const userId = req.user.id;
    
    // Check if officer exists
    const existing = row('SELECT * FROM officers WHERE id = ?', [officerId]);
    if (!existing) {
      return res.status(404).json({ error: 'Officer not found' });
    }
    
    // Check for dependencies before deleting
    const dependencies = {
      transfers: row('SELECT COUNT(*) as count FROM transfer_history WHERE officer_id = ?', [officerId])?.count || 0,
      promotions: row('SELECT COUNT(*) as count FROM promotion_history WHERE officer_id = ?', [officerId])?.count || 0,
      documents: row('SELECT COUNT(*) as count FROM officer_documents WHERE officer_id = ?', [officerId])?.count || 0,
      tenders: row('SELECT COUNT(*) as count FROM tenders WHERE officer_id = ?', [officerId])?.count || 0,
      projects: row('SELECT COUNT(*) as count FROM projects WHERE coordinator_id = ?', [officerId])?.count || 0
    };
    
    const totalDependencies = Object.values(dependencies).reduce((sum, count) => sum + count, 0);
    
    if (totalDependencies > 0) {
      return res.status(409).json({ 
        error: 'Cannot delete officer with existing records',
        details: 'This officer has associated transfers, promotions, documents, tenders, or projects. Please remove or reassign these records first.',
        dependencies
      });
    }
    
    // Delete photo file if exists
    if (existing.photo_url) {
      const photoPath = path.join(__dirname, existing.photo_url);
      if (fs.existsSync(photoPath)) {
        try {
          fs.unlinkSync(photoPath);
        } catch (err) {
          console.error('Failed to delete photo file:', err);
        }
      }
    }
    
    // Delete officer record
    run('DELETE FROM officers WHERE id = ?', [officerId]);
    
    // Log activity
    logActivity(userId, 'officer_deleted', null, null,
      `Deleted officer: ${existing.full_name} (${existing.employee_id})`, req.ip);
    
    res.json({
      success: true,
      message: 'Officer deleted successfully'
    });
  } catch (err) {
    console.error('Delete officer error:', err);
    res.status(500).json({ error: err.message || 'Failed to delete officer' });
  }
});

// ============================================
// OFFICER DEEDS (Good/Bad Deed Tracking)
// ============================================

// Get deed categories
app.get('/api/deed-categories', authenticate, (req, res) => {
  try {
    const { type } = req.query;
    let query = 'SELECT * FROM deed_categories WHERE is_active = 1';
    const params = [];
    
    if (type) {
      query += ' AND type = ?';
      params.push(type);
    }
    
    query += ' ORDER BY name';
    const categories = rows(query, params);
    res.json(categories);
  } catch (err) {
    console.error('Get deed categories error:', err);
    res.status(500).json({ error: 'DB error' });
  }
});

// Get officer deeds
app.get('/api/officers/:id/deeds', authenticate, (req, res) => {
  try {
    const { deed_type, verification_status } = req.query;
    
    let query = 'SELECT * FROM officer_deeds WHERE officer_id = ?';
    const params = [req.params.id];
    
    if (deed_type) {
      query += ' AND deed_type = ?';
      params.push(deed_type);
    }
    
    if (verification_status) {
      query += ' AND verification_status = ?';
      params.push(verification_status);
    }
    
    query += ' ORDER BY deed_date DESC, created_at DESC';
    const deeds = rows(query, params);
    
    res.json({ deeds });
  } catch (err) {
    console.error('Get officer deeds error:', err);
    res.status(500).json({ error: 'DB error' });
  }
});

// Create officer deed
// Create officer deed with optional attachments
app.post('/api/officers/:id/deeds', authenticate, authorize('admin', 'hr', 'manager'), uploadDeedAttachment.array('attachments', 5), (req, res) => {
  try {
    const {
      deed_type, title, description, deed_date, severity,
      points, category, remarks, is_confidential
    } = req.body;
    
    if (!deed_type || !title || !deed_date) {
      return res.status(400).json({ error: 'Deed type, title, and date are required' });
    }
    
    if (!['good', 'bad'].includes(deed_type)) {
      return res.status(400).json({ error: 'Deed type must be "good" or "bad"' });
    }
    
    const deedId = `deed-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    // Handle file attachments
    let attachmentData = null;
    if (req.files && req.files.length > 0) {
      attachmentData = JSON.stringify(req.files.map(file => ({
        filename: file.filename,
        originalName: file.originalname,
        path: `/uploads/deed_attachments/${file.filename}`,
        size: file.size,
        mimetype: file.mimetype,
        uploadedAt: new Date().toISOString()
      })));
    }
    
    run(`
      INSERT INTO officer_deeds (
        id, officer_id, deed_type, title, description, deed_date,
        severity, points, category, reported_by, verification_status,
        remarks, is_confidential, attachments
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)
    `, [
      deedId, req.params.id, deed_type, title, description, deed_date,
      severity, points || 0, category, req.user.username, remarks, is_confidential || 0,
      attachmentData
    ]);
    
    // Log activity
    logger.info('Officer deed recorded', {
      deedId, officerId: req.params.id, deedType: deed_type,
      userId: req.user.id, username: req.user.username,
      hasAttachments: req.files && req.files.length > 0
    });
    
    const deed = row('SELECT * FROM officer_deeds WHERE id = ?', [deedId]);
    res.status(201).json(deed);
  } catch (err) {
    console.error('Create officer deed error:', err);
    res.status(500).json({ error: 'DB error' });
  }
});

// Update officer deed
app.put('/api/officers/:officerId/deeds/:deedId', authenticate, authorize('admin', 'hr'), (req, res) => {
  try {
    const {
      title, description, deed_date, severity, points,
      category, remarks, verification_status
    } = req.body;
    
    const updates = [];
    const params = [];
    
    if (title !== undefined) { updates.push('title = ?'); params.push(title); }
    if (description !== undefined) { updates.push('description = ?'); params.push(description); }
    if (deed_date !== undefined) { updates.push('deed_date = ?'); params.push(deed_date); }
    if (severity !== undefined) { updates.push('severity = ?'); params.push(severity); }
    if (points !== undefined) { updates.push('points = ?'); params.push(points); }
    if (category !== undefined) { updates.push('category = ?'); params.push(category); }
    if (remarks !== undefined) { updates.push('remarks = ?'); params.push(remarks); }
    
    if (verification_status !== undefined) {
      if (!['pending', 'verified', 'rejected'].includes(verification_status)) {
        return res.status(400).json({ error: 'Invalid verification status' });
      }
      updates.push('verification_status = ?');
      params.push(verification_status);
      updates.push('verified_by = ?');
      params.push(req.user.username);
      updates.push('verification_date = CURRENT_DATE');
    }
    
    updates.push('updated_at = CURRENT_TIMESTAMP');
    params.push(req.params.deedId);
    
    run(`UPDATE officer_deeds SET ${updates.join(', ')} WHERE id = ?`, params);
    
    // Update officer deed counts and points
    updateOfficerDeedStats(req.params.officerId);
    
    const deed = row('SELECT * FROM officer_deeds WHERE id = ?', [req.params.deedId]);
    res.json(deed);
  } catch (err) {
    console.error('Update officer deed error:', err);
    res.status(500).json({ error: 'DB error' });
  }
});

// Delete officer deed
app.delete('/api/officers/:officerId/deeds/:deedId', authenticate, authorize('admin'), (req, res) => {
  try {
    run('DELETE FROM officer_deeds WHERE id = ?', [req.params.deedId]);
    
    // Update officer deed counts and points
    updateOfficerDeedStats(req.params.officerId);
    
    logger.info('Officer deed deleted', {
      deedId: req.params.deedId, officerId: req.params.officerId,
      userId: req.user.id, username: req.user.username
    });
    
    res.json({ ok: true });
  } catch (err) {
    console.error('Delete officer deed error:', err);
    res.status(500).json({ error: 'DB error' });
  }
});

// Export officer performance report as PDF
app.get('/api/officers/:id/deeds/export/pdf', authenticate, (req, res) => {
  try {
    const officerId = req.params.id;
    
    // Get officer details
    const officer = row(`
      SELECT o.*, d.title as designation_title, off.name as office_name
      FROM officers o
      LEFT JOIN designations d ON o.designation_id = d.id
      LEFT JOIN offices off ON o.office_id = off.id
      WHERE o.id = ?
    `, [officerId]);
    
    if (!officer) {
      return res.status(404).json({ error: 'Officer not found' });
    }
    
    // Get deeds with filter
    const filter = req.query.filter || 'all';
    let deedQuery = 'SELECT * FROM officer_deeds WHERE officer_id = ?';
    const deedParams = [officerId];
    
    if (filter === 'good') {
      deedQuery += ' AND deed_type = "good"';
    } else if (filter === 'bad') {
      deedQuery += ' AND deed_type = "bad"';
    } else if (filter === 'pending') {
      deedQuery += ' AND verification_status = "pending"';
    } else if (filter === 'verified') {
      deedQuery += ' AND verification_status = "verified"';
    }
    
    deedQuery += ' ORDER BY deed_date DESC, created_at DESC';
    const deeds = all(deedQuery, deedParams);
    
    // Calculate statistics
    const verifiedDeeds = deeds.filter(d => d.verification_status === 'verified');
    const goodCount = verifiedDeeds.filter(d => d.deed_type === 'good').length;
    const badCount = verifiedDeeds.filter(d => d.deed_type === 'bad').length;
    const totalPoints = verifiedDeeds.reduce((sum, d) => sum + (d.points || 0), 0);
    
    // Create PDF
    const PDFDocument = require('pdfkit');
    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    
    // Set response headers
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="officer-${officer.employee_id}-performance-report.pdf"`);
    
    doc.pipe(res);
    
    // Header
    doc.fontSize(20).font('Helvetica-Bold').text('Officer Performance Report', { align: 'center' });
    doc.moveDown();
    doc.fontSize(10).font('Helvetica').text(`Generated: ${new Date().toLocaleString()}`, { align: 'center' });
    doc.moveDown(2);
    
    // Officer Information
    doc.fontSize(14).font('Helvetica-Bold').text('Officer Information');
    doc.moveDown(0.5);
    doc.fontSize(10).font('Helvetica');
    doc.text(`Name: ${officer.full_name}`);
    doc.text(`Employee ID: ${officer.employee_id}`);
    doc.text(`Designation: ${officer.designation_title || 'N/A'}`);
    doc.text(`Office: ${officer.office_name || 'N/A'}`);
    doc.text(`Mobile: ${officer.personal_mobile || 'N/A'}`);
    doc.text(`Email: ${officer.personal_email || 'N/A'}`);
    doc.moveDown(1.5);
    
    // Performance Summary
    doc.fontSize(14).font('Helvetica-Bold').text('Performance Summary');
    doc.moveDown(0.5);
    doc.fontSize(10).font('Helvetica');
    doc.text(`Total Deeds: ${deeds.length}`);
    doc.text(`Good Deeds: ${goodCount}`);
    doc.text(`Incidents/Bad Deeds: ${badCount}`);
    doc.text(`Total Points: ${totalPoints}`);
    doc.text(`Performance Rating: ${(officer.performance_rating || 'average').toUpperCase()}`);
    doc.moveDown(1.5);
    
    // Deed History
    doc.fontSize(14).font('Helvetica-Bold').text('Deed History');
    doc.moveDown(0.5);
    
    if (deeds.length === 0) {
      doc.fontSize(10).font('Helvetica-Oblique').text('No deeds recorded yet.', { align: 'center' });
    } else {
      deeds.forEach((deed, index) => {
        // Check for page break
        if (doc.y > 700) {
          doc.addPage();
        }
        
        // Deed card
        const bgColor = deed.deed_type === 'good' ? '#e8f5e9' : '#ffebee';
        doc.fontSize(10).font('Helvetica-Bold')
           .fillColor(deed.deed_type === 'good' ? '#2e7d32' : '#c62828')
           .text(`${index + 1}. ${deed.title}`, { continued: false });
        
        doc.fontSize(9).font('Helvetica').fillColor('#000000');
        doc.text(`   Date: ${deed.deed_date} | Type: ${deed.deed_type.toUpperCase()} | Status: ${deed.verification_status.toUpperCase()}`);
        
        if (deed.category) {
          doc.text(`   Category: ${deed.category}`);
        }
        
        if (deed.points) {
          doc.text(`   Points: ${deed.points > 0 ? '+' : ''}${deed.points}`);
        }
        
        if (deed.description) {
          doc.text(`   Description: ${deed.description}`);
        }
        
        if (deed.remarks) {
          doc.text(`   Remarks: ${deed.remarks}`);
        }
        
        doc.text(`   Reported by: ${deed.reported_by || 'N/A'}`);
        
        if (deed.verified_by) {
          doc.text(`   Verified by: ${deed.verified_by} on ${deed.verification_date}`);
        }
        
        doc.moveDown(0.5);
      });
    }
    
    // Footer
    doc.fontSize(8).font('Helvetica-Oblique').fillColor('#999999')
       .text('This is a system-generated report from Big Office Management System', 50, doc.page.height - 50, { align: 'center' });
    
    doc.end();
    
    logger.info('PDF report generated', { officerId, filter, userId: req.user.id });
    
  } catch (err) {
    console.error('PDF export error:', err);
    res.status(500).json({ error: 'Failed to generate PDF report' });
  }
});

// Export officer deeds as Excel
app.get('/api/officers/:id/deeds/export/excel', authenticate, (req, res) => {
  try {
    const officerId = req.params.id;
    
    // Get officer details
    const officer = row(`
      SELECT o.*, d.title as designation_title, off.name as office_name
      FROM officers o
      LEFT JOIN designations d ON o.designation_id = d.id
      LEFT JOIN offices off ON o.office_id = off.id
      WHERE o.id = ?
    `, [officerId]);
    
    if (!officer) {
      return res.status(404).json({ error: 'Officer not found' });
    }
    
    // Get deeds with filter
    const filter = req.query.filter || 'all';
    let deedQuery = 'SELECT * FROM officer_deeds WHERE officer_id = ?';
    const deedParams = [officerId];
    
    if (filter === 'good') {
      deedQuery += ' AND deed_type = "good"';
    } else if (filter === 'bad') {
      deedQuery += ' AND deed_type = "bad"';
    } else if (filter === 'pending') {
      deedQuery += ' AND verification_status = "pending"';
    } else if (filter === 'verified') {
      deedQuery += ' AND verification_status = "verified"';
    }
    
    deedQuery += ' ORDER BY deed_date DESC, created_at DESC';
    const deeds = all(deedQuery, deedParams);
    
    // Create Excel workbook
    const ExcelJS = require('exceljs');
    const workbook = new ExcelJS.Workbook();
    
    // Officer Info Sheet
    const infoSheet = workbook.addWorksheet('Officer Information');
    infoSheet.columns = [
      { header: 'Field', key: 'field', width: 25 },
      { header: 'Value', key: 'value', width: 50 }
    ];
    
    infoSheet.addRows([
      { field: 'Full Name', value: officer.full_name },
      { field: 'Employee ID', value: officer.employee_id },
      { field: 'Designation', value: officer.designation_title || 'N/A' },
      { field: 'Office', value: officer.office_name || 'N/A' },
      { field: 'Mobile', value: officer.personal_mobile || 'N/A' },
      { field: 'Email', value: officer.personal_email || 'N/A' },
      { field: 'Good Deeds Count', value: officer.good_deeds_count || 0 },
      { field: 'Bad Deeds Count', value: officer.bad_deeds_count || 0 },
      { field: 'Total Points', value: officer.deed_points_total || 0 },
      { field: 'Performance Rating', value: (officer.performance_rating || 'average').toUpperCase() },
      { field: 'Report Generated', value: new Date().toLocaleString() }
    ]);
    
    // Style header row
    infoSheet.getRow(1).font = { bold: true };
    infoSheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF4CAF50' }
    };
    
    // Deeds Sheet
    const deedsSheet = workbook.addWorksheet('Deed History');
    deedsSheet.columns = [
      { header: 'Date', key: 'deed_date', width: 12 },
      { header: 'Type', key: 'deed_type', width: 10 },
      { header: 'Title', key: 'title', width: 30 },
      { header: 'Category', key: 'category', width: 20 },
      { header: 'Severity', key: 'severity', width: 12 },
      { header: 'Points', key: 'points', width: 10 },
      { header: 'Description', key: 'description', width: 40 },
      { header: 'Status', key: 'verification_status', width: 12 },
      { header: 'Reported By', key: 'reported_by', width: 20 },
      { header: 'Verified By', key: 'verified_by', width: 20 },
      { header: 'Verification Date', key: 'verification_date', width: 15 },
      { header: 'Remarks', key: 'remarks', width: 30 }
    ];
    
    // Add deed data
    deeds.forEach(deed => {
      deedsSheet.addRow({
        deed_date: deed.deed_date,
        deed_type: deed.deed_type.toUpperCase(),
        title: deed.title,
        category: deed.category || '',
        severity: deed.severity || '',
        points: deed.points || 0,
        description: deed.description || '',
        verification_status: deed.verification_status.toUpperCase(),
        reported_by: deed.reported_by || 'N/A',
        verified_by: deed.verified_by || '',
        verification_date: deed.verification_date || '',
        remarks: deed.remarks || ''
      });
    });
    
    // Style header row
    deedsSheet.getRow(1).font = { bold: true };
    deedsSheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF2196F3' }
    };
    
    // Color code deed types
    deedsSheet.eachRow((row, rowNumber) => {
      if (rowNumber > 1) { // Skip header
        const deedType = row.getCell(2).value;
        if (deedType === 'GOOD') {
          row.getCell(2).fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFE8F5E9' }
          };
          row.getCell(2).font = { color: { argb: 'FF2E7D32' }, bold: true };
        } else if (deedType === 'BAD') {
          row.getCell(2).fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFFFEBEE' }
          };
          row.getCell(2).font = { color: { argb: 'FFC62828' }, bold: true };
        }
      }
    });
    
    // Set response headers
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="officer-${officer.employee_id}-deeds-${new Date().toISOString().split('T')[0]}.xlsx"`);
    
    // Write to response
    workbook.xlsx.write(res).then(() => {
      res.end();
      logger.info('Excel report generated', { officerId, filter, userId: req.user.id });
    });
    
  } catch (err) {
    console.error('Excel export error:', err);
    res.status(500).json({ error: 'Failed to generate Excel report' });
  }
});

// Helper function to update officer deed statistics
function updateOfficerDeedStats(officerId) {
  try {
    const stats = row(`
      SELECT 
        SUM(CASE WHEN deed_type = 'good' AND verification_status = 'verified' THEN 1 ELSE 0 END) as good_count,
        SUM(CASE WHEN deed_type = 'bad' AND verification_status = 'verified' THEN 1 ELSE 0 END) as bad_count,
        SUM(CASE WHEN verification_status = 'verified' THEN points ELSE 0 END) as total_points
      FROM officer_deeds
      WHERE officer_id = ?
    `, [officerId]);
    
    const goodCount = stats.good_count || 0;
    const badCount = stats.bad_count || 0;
    const totalPoints = stats.total_points || 0;
    
    // Calculate performance rating
    let rating = 'average';
    if (totalPoints >= 100) rating = 'exceptional';
    else if (totalPoints >= 50) rating = 'excellent';
    else if (totalPoints >= 20) rating = 'good';
    else if (totalPoints >= 0) rating = 'average';
    else if (totalPoints >= -20) rating = 'below_average';
    else rating = 'poor';
    
    run(`
      UPDATE officers 
      SET good_deeds_count = ?, bad_deeds_count = ?, deed_points_total = ?, performance_rating = ?
      WHERE id = ?
    `, [goodCount, badCount, totalPoints, rating, officerId]);
    
  } catch (err) {
    console.error('Update officer deed stats error:', err);
  }
}

// Serve officer creation page
app.get('/officers/new', authenticate, authorize('admin', 'hr'), (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'officers-new.html'));
});

// Serve officer edit page
app.get('/officers/:id/edit', authenticate, authorize('admin', 'hr'), (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'officers-edit.html'));
});

// Record officer transfer
app.post('/api/officers/:id/transfers', authenticate, authorize('admin', 'hr'), async (req, res) => {
  const requestId = `transfer-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  
  try {
    const officerId = req.params.id;
    const userId = req.user.id;
    const {
      transfer_date,
      from_office_id,
      to_office_id,
      from_designation_id,
      to_designation_id,
      order_number,
      order_date,
      effective_date,
      remarks
    } = req.body;
    
    // Validation
    if (!transfer_date || !to_office_id || !effective_date) {
      return res.status(400).json({ error: 'Transfer date, to office, and effective date are required' });
    }
    
    // Check if officer exists
    const officer = row('SELECT * FROM officers WHERE id = ?', [officerId]);
    if (!officer) {
      return res.status(404).json({ error: 'Officer not found' });
    }
    
    // Validate dates
    const transferDateObj = new Date(transfer_date);
    const effectiveDateObj = new Date(effective_date);
    const today = new Date();
    
    if (effectiveDateObj > today) {
      return res.status(400).json({ error: 'Effective date cannot be in the future' });
    }
    
    // Validate offices are different
    if (from_office_id === to_office_id) {
      return res.status(400).json({ error: 'Cannot transfer to the same office' });
    }
    
    const transferId = 'transfer-' + Date.now();
    
    // Wrap multi-table writes in transaction
    await withTransaction(async (db) => {
      // Insert transfer record
      run(`
        INSERT INTO transfer_history (
          id, officer_id, transfer_date, from_office_id, to_office_id,
          from_designation_id, to_designation_id, order_number, order_date,
          effective_date, remarks, created_by, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      `, [
        transferId, officerId, transfer_date, from_office_id || officer.office_id,
        to_office_id, from_designation_id || officer.designation_id,
        to_designation_id || officer.designation_id, order_number, order_date,
        effective_date, remarks, userId
      ]);
      
      // Update officer's current office if effective date is today or past
      if (effectiveDateObj <= today) {
        run(`
          UPDATE officers 
          SET office_id = ?, 
              designation_id = ?,
              updated_by = ?, 
              updated_at = datetime('now')
          WHERE id = ?
        `, [to_office_id, to_designation_id || officer.designation_id, userId, officerId]);
      }
      
      // Log activity
      logActivity(userId, 'officer_transferred', null, null,
        `Transferred officer ${officer.full_name} from office ${from_office_id} to ${to_office_id}`, req.ip);
    }, { requestId, operation: 'officer-transfer' });
    
    // Get updated officer with timeline
    const updatedOfficer = row(`
      SELECT o.*, d.title as designation_title, of.office_name
      FROM officers o
      LEFT JOIN designations d ON o.designation_id = d.id
      LEFT JOIN offices of ON o.office_id = of.id
      WHERE o.id = ?
    `, [officerId]);
    
    const transfers = rows(`
      SELECT th.*,
        of1.office_name as from_office_name, of1.office_code as from_office_code,
        of2.office_name as to_office_name, of2.office_code as to_office_code,
        d1.title as from_designation_title,
        d2.title as to_designation_title
      FROM transfer_history th
      LEFT JOIN offices of1 ON th.from_office_id = of1.id
      LEFT JOIN offices of2 ON th.to_office_id = of2.id
      LEFT JOIN designations d1 ON th.from_designation_id = d1.id
      LEFT JOIN designations d2 ON th.to_designation_id = d2.id
      WHERE th.officer_id = ?
      ORDER BY th.transfer_date DESC
    `, [officerId]);
    
    res.status(201).json({
      success: true,
      message: 'Transfer recorded successfully',
      officer: updatedOfficer,
      transfers
    });
  } catch (err) {
    console.error('Record transfer error:', err);
    res.status(500).json({ error: err.message || 'Failed to record transfer' });
  }
});

// Record officer promotion
app.post('/api/officers/:id/promotions', authenticate, authorize('admin', 'hr'), async (req, res) => {
  const requestId = `promotion-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  
  try {
    const officerId = req.params.id;
    const userId = req.user.id;
    const {
      promotion_date,
      from_designation_id,
      to_designation_id,
      from_grade,
      to_grade,
      new_salary,
      order_number,
      order_date,
      effective_date,
      remarks
    } = req.body;
    
    // Validation
    if (!promotion_date || !to_designation_id || !effective_date) {
      return res.status(400).json({ error: 'Promotion date, to designation, and effective date are required' });
    }
    
    // Check if officer exists
    const officer = row('SELECT * FROM officers WHERE id = ?', [officerId]);
    if (!officer) {
      return res.status(404).json({ error: 'Officer not found' });
    }
    
    // Validate dates
    const promotionDateObj = new Date(promotion_date);
    const effectiveDateObj = new Date(effective_date);
    const today = new Date();
    
    if (effectiveDateObj > today) {
      return res.status(400).json({ error: 'Effective date cannot be in the future' });
    }
    
    // Get designation details to validate promotion
    const fromDesignation = row('SELECT * FROM designations WHERE id = ?', [from_designation_id || officer.designation_id]);
    const toDesignation = row('SELECT * FROM designations WHERE id = ?', [to_designation_id]);
    
    // Validate it's actually a promotion (higher grade)
    if (toDesignation.grade_level >= fromDesignation.grade_level) {
      return res.status(400).json({ error: 'To designation must be of higher grade than current designation' });
    }
    
    // Validate grades if provided
    if (to_grade && from_grade && parseInt(to_grade) <= parseInt(from_grade)) {
      return res.status(400).json({ error: 'New grade must be higher than current grade' });
    }
    
    const promotionId = 'promotion-' + Date.now();
    
    // Wrap multi-table writes in transaction
    await withTransaction(async (db) => {
      // Insert promotion record
      run(`
        INSERT INTO promotion_history (
          id, officer_id, promotion_date, from_designation_id, to_designation_id,
          from_grade, to_grade, new_salary, order_number, order_date,
          effective_date, remarks, created_by, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      `, [
        promotionId, officerId, promotion_date, from_designation_id || officer.designation_id,
        to_designation_id, from_grade || officer.current_grade, to_grade,
        new_salary, order_number, order_date, effective_date, remarks, userId
      ]);
      
      // Update officer's current designation and salary if effective date is today or past
      if (effectiveDateObj <= today) {
        const updates = {
          designation_id: to_designation_id,
          updated_by: userId
        };
        
        if (to_grade) updates.current_grade = to_grade;
        if (new_salary) updates.current_salary = new_salary;
        
        const updateFields = Object.keys(updates).map(k => `${k} = ?`).join(', ');
        const updateValues = Object.values(updates);
        
        run(`
          UPDATE officers 
          SET ${updateFields}, updated_at = datetime('now')
          WHERE id = ?
        `, [...updateValues, officerId]);
      }
      
      // Log activity
      logActivity(userId, 'officer_promoted', null, null,
        `Promoted officer ${officer.full_name} from ${fromDesignation.title} to ${toDesignation.title}`, req.ip);
    }, { requestId, operation: 'officer-promotion' });
    
    // Log activity
    logActivity(userId, 'officer_promoted', null, null,
      `Promoted officer ${officer.full_name} from ${fromDesignation.title} to ${toDesignation.title}`, req.ip);
    
    // Get updated officer with timeline
    const updatedOfficer = row(`
      SELECT o.*, d.title as designation_title, of.office_name
      FROM officers o
      LEFT JOIN designations d ON o.designation_id = d.id
      LEFT JOIN offices of ON o.office_id = of.id
      WHERE o.id = ?
    `, [officerId]);
    
    const promotions = rows(`
      SELECT ph.*,
        d1.title as from_designation_title,
        d2.title as to_designation_title
      FROM promotion_history ph
      LEFT JOIN designations d1 ON ph.from_designation_id = d1.id
      LEFT JOIN designations d2 ON ph.to_designation_id = d2.id
      WHERE ph.officer_id = ?
      ORDER BY ph.promotion_date DESC
    `, [officerId]);
    
    res.status(201).json({
      success: true,
      message: 'Promotion recorded successfully',
      officer: updatedOfficer,
      promotions
    });
  } catch (err) {
    console.error('Record promotion error:', err);
    res.status(500).json({ error: err.message || 'Failed to record promotion' });
  }
});

// Upload officer document
app.post('/api/officers/:id/documents', authenticate, authorize('admin', 'hr'), uploadOfficerDoc.single('document'), async (req, res) => {
  try {
    const officerId = req.params.id;
    const userId = req.user.id;
    const { document_title, document_type, issue_date, expiry_date, issued_by, remarks } = req.body;
    
    // Validation
    if (!document_title || !document_type) {
      return res.status(400).json({ error: 'Document title and type are required' });
    }
    
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    
    // Check if officer exists
    const officer = row('SELECT * FROM officers WHERE id = ?', [officerId]);
    if (!officer) {
      return res.status(404).json({ error: 'Officer not found' });
    }
    
    const documentId = 'doc-' + Date.now();
    const filePath = `officer_documents/${officerId}/${req.file.filename}`;
    
    // Insert document record
    run(`
      INSERT INTO officer_documents (
        id, officer_id, document_title, document_type, file_path, file_type,
        file_size, issue_date, expiry_date, issued_by, remarks,
        uploaded_by, uploaded_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `, [
      documentId, officerId, document_title, document_type, filePath,
      req.file.mimetype, req.file.size, issue_date || null, expiry_date || null,
      issued_by || null, remarks || null, userId
    ]);
    
    // Log activity
    logActivity(userId, 'document_uploaded', null, null,
      `Uploaded document ${document_title} for officer ${officer.full_name}`, req.ip);
    
    // Get all documents for this officer
    const documents = rows(`
      SELECT od.*, u.username as uploaded_by_name
      FROM officer_documents od
      LEFT JOIN users u ON od.uploaded_by = u.id
      WHERE od.officer_id = ?
      ORDER BY od.uploaded_at DESC
    `, [officerId]);
    
    res.status(201).json({
      success: true,
      message: 'Document uploaded successfully',
      documents
    });
  } catch (err) {
    console.error('Upload document error:', err);
    res.status(500).json({ error: err.message || 'Failed to upload document' });
  }
});

// Delete officer document
app.delete('/api/officers/documents/:id', authenticate, authorize('admin', 'hr'), async (req, res) => {
  const requestId = `delete-doc-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  
  try {
    const documentId = req.params.id;
    const userId = req.user.id;
    
    // Get document details
    const document = row('SELECT * FROM officer_documents WHERE id = ?', [documentId]);
    if (!document) {
      return res.status(404).json({ error: 'Document not found' });
    }
    
    // Get officer details for logging
    const officer = row('SELECT full_name FROM officers WHERE id = ?', [document.officer_id]);
    
    // Wrap file deletion and DB delete in transaction
    await withTransaction(async (db) => {
      // Delete from database first
      run('DELETE FROM officer_documents WHERE id = ?', [documentId]);
      
      // Delete file from filesystem
      const fs = require('fs');
      const filePath = path.join(__dirname, 'uploads', document.file_path);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
      
      // Log activity
      logActivity(userId, 'document_deleted', null, null,
        `Deleted document ${document.document_title} for officer ${officer.full_name}`, req.ip);
    }, { requestId, operation: 'document-deletion' });
    
    // Get remaining documents for this officer
    const documents = rows(`
      SELECT od.*, u.username as uploaded_by_name
      FROM officer_documents od
      LEFT JOIN users u ON od.uploaded_by = u.id
      WHERE od.officer_id = ?
      ORDER BY od.uploaded_at DESC
    `, [document.officer_id]);
    
    res.json({
      success: true,
      message: 'Document deleted successfully',
      documents
    });
  } catch (err) {
    console.error('Delete document error:', err);
    res.status(500).json({ error: err.message || 'Failed to delete document' });
  }
});

// ============================================
// TASKS
// ============================================

// Get all tasks
app.get('/api/tasks', authenticate, (req, res) => {
  try {
    const { status, assigned_to, priority, firm_id, tender_id, project_id } = req.query;
    let query = `
      SELECT t.*, 
        tm.name as assigned_to_name,
        f.name as firm_name,
        tn.tender_id as tender_no,
        p.project_name as project_name
      FROM tasks t
      LEFT JOIN team_members tm ON t.assigned_to = tm.id
      LEFT JOIN firms f ON t.firm_id = f.id
      LEFT JOIN tenders tn ON t.tender_id = tn.id
      LEFT JOIN projects p ON t.project_id = p.id
      WHERE 1=1
    `;
    const params = [];
    
    if (status) {
      query += ' AND t.status = ?';
      params.push(status);
    }
    if (assigned_to) {
      query += ' AND t.assigned_to = ?';
      params.push(assigned_to);
    }
    if (priority) {
      query += ' AND t.priority = ?';
      params.push(priority);
    }
    if (firm_id) {
      query += ' AND t.firm_id = ?';
      params.push(firm_id);
    }
    if (tender_id) {
      query += ' AND t.tender_id = ?';
      params.push(tender_id);
    }
    if (project_id) {
      query += ' AND t.project_id = ?';
      params.push(project_id);
    }
    
    query += ' ORDER BY t.due_date, t.priority DESC';
    const tasks = rows(query, params);
    res.json(tasks);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'DB error' });
  }
});

// Get single task with comments
app.get('/api/tasks/:id', authenticate, (req, res) => {
  try {
    const task = row(`
      SELECT t.*, 
        tm.name as assigned_to_name,
        tb.name as assigned_by_name,
        f.name as firm_name,
        tn.tender_id as tender_no,
        p.project_name as project_name
      FROM tasks t
      LEFT JOIN team_members tm ON t.assigned_to = tm.id
      LEFT JOIN team_members tb ON t.assigned_by = tb.id
      LEFT JOIN firms f ON t.firm_id = f.id
      LEFT JOIN tenders tn ON t.tender_id = tn.id
      LEFT JOIN projects p ON t.project_id = p.id
      WHERE t.id = ?
    `, [req.params.id]);
    
    if (!task) return res.status(404).json({ error: 'Task not found' });
    
    // Get comments
    const comments = rows(`
      SELECT tc.*, tm.name as member_name, tm.designation
      FROM task_comments tc
      JOIN team_members tm ON tc.member_id = tm.id
      WHERE tc.task_id = ?
      ORDER BY tc.created_at DESC
    `, [req.params.id]);
    
    res.json({ ...task, comments });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'DB error' });
  }
});

// Add new task
app.post('/api/tasks', authenticate, (req, res) => {
  try {
    const { 
      title, description, task_type, priority, status, 
      assigned_to, assigned_by, firm_id, tender_id, project_id,
      due_date, estimated_hours, notes 
    } = req.body;
    
    const result = run(`
      INSERT INTO tasks (
        title, description, task_type, priority, status,
        assigned_to, assigned_by, firm_id, tender_id, project_id,
        due_date, estimated_hours, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      title, description, task_type, priority || 'medium', status || 'pending',
      assigned_to, assigned_by, firm_id, tender_id, project_id,
      due_date, estimated_hours, notes
    ]);
    
    res.json({ ok: true, id: result.lastInsertRowid });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'DB error' });
  }
});

// Update task
app.put('/api/tasks/:id', authenticate, (req, res) => {
  try {
    const { 
      title, description, task_type, priority, status, 
      assigned_to, firm_id, tender_id, project_id,
      due_date, completed_date, estimated_hours, actual_hours, notes 
    } = req.body;
    
    run(`
      UPDATE tasks 
      SET title = ?, description = ?, task_type = ?, priority = ?, status = ?,
          assigned_to = ?, firm_id = ?, tender_id = ?, project_id = ?,
          due_date = ?, completed_date = ?, estimated_hours = ?, actual_hours = ?, notes = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [
      title, description, task_type, priority, status,
      assigned_to, firm_id, tender_id, project_id,
      due_date, completed_date, estimated_hours, actual_hours, notes,
      req.params.id
    ]);
    
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'DB error' });
  }
});

// Delete task
app.delete('/api/tasks/:id', authenticate, (req, res) => {
  try {
    run('DELETE FROM tasks WHERE id = ?', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'DB error' });
  }
});

// Add comment to task
app.post('/api/tasks/:id/comments', authenticate, (req, res) => {
  try {
    const { member_id, comment } = req.body;
    
    const result = run(`
      INSERT INTO task_comments (task_id, member_id, comment)
      VALUES (?, ?, ?)
    `, [req.params.id, member_id, comment]);
    
    res.json({ ok: true, id: result.lastInsertRowid });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'DB error' });
  }
});

// Get task statistics
app.get('/api/tasks/stats/overview', authenticate, (req, res) => {
  try {
    const stats = row(`
      SELECT 
        COUNT(*) as total_tasks,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END) as in_progress,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
        SUM(CASE WHEN status = 'on_hold' THEN 1 ELSE 0 END) as on_hold,
        SUM(CASE WHEN priority = 'high' AND status NOT IN ('completed', 'cancelled') THEN 1 ELSE 0 END) as high_priority,
        SUM(CASE WHEN date(due_date) < date('now') AND status NOT IN ('completed', 'cancelled') THEN 1 ELSE 0 END) as overdue
      FROM tasks
    `);
    
    res.json(stats);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'DB error' });
  }
});

// ============================================
// SUPPLIERS
// ============================================

// Get all suppliers
app.get('/api/suppliers', authenticate, (req, res) => {
  try {
    const { supplier_type, status } = req.query;
    let query = 'SELECT * FROM suppliers WHERE 1=1';
    const params = [];
    
    if (supplier_type) {
      query += ' AND supplier_type = ?';
      params.push(supplier_type);
    }
    if (status) {
      query += ' AND status = ?';
      params.push(status);
    }
    
    query += ' ORDER BY name';
    const suppliers = rows(query, params);
    res.json(suppliers);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'DB error' });
  }
});

// Get single supplier
app.get('/api/suppliers/:id', authenticate, (req, res) => {
  try {
    const supplier = row('SELECT * FROM suppliers WHERE id = ?', [req.params.id]);
    if (!supplier) return res.status(404).json({ error: 'Supplier not found' });
    
    // Get transaction history
    const transactions = rows(`
      SELECT st.*, p.project_name as project_name
      FROM supplier_transactions st
      LEFT JOIN projects p ON st.project_id = p.id
      WHERE st.supplier_id = ?
      ORDER BY st.transaction_date DESC
      LIMIT 50
    `, [req.params.id]);
    
    res.json({ ...supplier, transactions });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'DB error' });
  }
});

// Add supplier
app.post('/api/suppliers', authenticate, authorize('admin', 'manager'), (req, res) => {
  try {
    const { 
      name, company_name, supplier_type, category, tin, trade_license,
      contact_person, designation, mobile, email, address, city,
      bank_name, account_number, payment_terms, credit_limit, rating, status, notes
    } = req.body;
    
    const result = run(`
      INSERT INTO suppliers (
        name, company_name, supplier_type, category, tin, trade_license,
        contact_person, designation, mobile, email, address, city,
        bank_name, account_number, payment_terms, credit_limit, rating, status, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      name, company_name, supplier_type, category, tin, trade_license,
      contact_person, designation, mobile, email, address, city,
      bank_name, account_number, payment_terms, credit_limit, rating, status || 'active', notes
    ]);
    
    res.json({ ok: true, id: result.lastInsertRowid });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'DB error' });
  }
});

// Update supplier
app.put('/api/suppliers/:id', authenticate, authorize('admin', 'manager'), (req, res) => {
  try {
    const { 
      name, company_name, supplier_type, category, tin, trade_license,
      contact_person, designation, mobile, email, address, city,
      bank_name, account_number, payment_terms, credit_limit, current_due, rating, status, notes
    } = req.body;
    
    run(`
      UPDATE suppliers 
      SET name = ?, company_name = ?, supplier_type = ?, category = ?, tin = ?, trade_license = ?,
          contact_person = ?, designation = ?, mobile = ?, email = ?, address = ?, city = ?,
          bank_name = ?, account_number = ?, payment_terms = ?, credit_limit = ?, current_due = ?,
          rating = ?, status = ?, notes = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [
      name, company_name, supplier_type, category, tin, trade_license,
      contact_person, designation, mobile, email, address, city,
      bank_name, account_number, payment_terms, credit_limit, current_due,
      rating, status, notes, req.params.id
    ]);
    
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'DB error' });
  }
});

// Delete supplier
app.delete('/api/suppliers/:id', authenticate, authorize('admin', 'manager'), (req, res) => {
  try {
    run('DELETE FROM suppliers WHERE id = ?', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'DB error' });
  }
});

// Add supplier transaction
app.post('/api/suppliers/:id/transactions', authenticate, (req, res) => {
  try {
    const { project_id, transaction_type, transaction_date, amount, payment_method, reference_number, description, created_by } = req.body;
    
    const result = run(`
      INSERT INTO supplier_transactions (
        supplier_id, project_id, transaction_type, transaction_date, amount,
        payment_method, reference_number, description, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [req.params.id, project_id, transaction_type, transaction_date, amount, payment_method, reference_number, description, created_by]);
    
    // Update supplier current_due
    if (transaction_type === 'purchase') {
      run('UPDATE suppliers SET current_due = current_due + ? WHERE id = ?', [amount, req.params.id]);
    } else if (transaction_type === 'payment') {
      run('UPDATE suppliers SET current_due = current_due - ? WHERE id = ?', [amount, req.params.id]);
    }
    
    res.json({ ok: true, id: result.lastInsertRowid });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'DB error' });
  }
});

// ============================================
// CLIENTS
// ============================================

// Get all clients
app.get('/api/clients', authenticate, (req, res) => {
  try {
    const { organization_type, region } = req.query;
    let query = 'SELECT * FROM clients WHERE 1=1';
    const params = [];
    
    if (organization_type) {
      query += ' AND organization_type = ?';
      params.push(organization_type);
    }
    if (region) {
      query += ' AND region = ?';
      params.push(region);
    }
    
    query += ' ORDER BY name';
    const clients = rows(query, params);
    res.json(clients);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'DB error' });
  }
});

// Get single client
app.get('/api/clients/:id', authenticate, (req, res) => {
  try {
    const client = row('SELECT * FROM clients WHERE id = ?', [req.params.id]);
    if (!client) return res.status(404).json({ error: 'Client not found' });
    
    // Get contacts
    const contacts = rows('SELECT * FROM client_contacts WHERE client_id = ? ORDER BY is_primary DESC, name', [req.params.id]);
    
    // Get related tenders
    const tenders = rows('SELECT * FROM tenders WHERE procuring_entity LIKE ? ORDER BY created_at DESC LIMIT 20', [`%${client.name}%`]);
    
    res.json({ ...client, contacts, tenders });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'DB error' });
  }
});

// Add client
app.post('/api/clients', authenticate, authorize('admin', 'manager'), (req, res) => {
  try {
    const { 
      name, organization_type, department, contact_person, designation,
      mobile, email, office_address, city, region, postal_code, website,
      payment_reputation, average_payment_days, notes
    } = req.body;
    
    const result = run(`
      INSERT INTO clients (
        name, organization_type, department, contact_person, designation,
        mobile, email, office_address, city, region, postal_code, website,
        payment_reputation, average_payment_days, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      name, organization_type, department, contact_person, designation,
      mobile, email, office_address, city, region, postal_code, website,
      payment_reputation, average_payment_days, notes
    ]);
    
    res.json({ ok: true, id: result.lastInsertRowid });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'DB error' });
  }
});

// Update client
app.put('/api/clients/:id', authenticate, authorize('admin', 'manager'), (req, res) => {
  try {
    const { 
      name, organization_type, department, contact_person, designation,
      mobile, email, office_address, city, region, postal_code, website,
      payment_reputation, average_payment_days, notes
    } = req.body;
    
    run(`
      UPDATE clients 
      SET name = ?, organization_type = ?, department = ?, contact_person = ?, designation = ?,
          mobile = ?, email = ?, office_address = ?, city = ?, region = ?, postal_code = ?, website = ?,
          payment_reputation = ?, average_payment_days = ?, notes = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [
      name, organization_type, department, contact_person, designation,
      mobile, email, office_address, city, region, postal_code, website,
      payment_reputation, average_payment_days, notes, req.params.id
    ]);
    
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'DB error' });
  }
});

// Delete client
app.delete('/api/clients/:id', authenticate, authorize('admin', 'manager'), (req, res) => {
  try {
    run('DELETE FROM clients WHERE id = ?', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'DB error' });
  }
});

// Add client contact
app.post('/api/clients/:id/contacts', authenticate, (req, res) => {
  try {
    const { name, designation, department, mobile, email, is_primary, notes } = req.body;
    
    // If setting as primary, unset others
    if (is_primary) {
      run('UPDATE client_contacts SET is_primary = 0 WHERE client_id = ?', [req.params.id]);
    }
    
    const result = run(`
      INSERT INTO client_contacts (client_id, name, designation, department, mobile, email, is_primary, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [req.params.id, name, designation, department, mobile, email, is_primary || 0, notes]);
    
    res.json({ ok: true, id: result.lastInsertRowid });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'DB error' });
  }
});

// ============================================
// USERS & ADMIN
// ============================================

// Login endpoint with rate limiting
app.post('/api/login', loginLimiter, validate(schemas.login), async (req, res) => {
  try {
    const { username, password } = req.body;
    
    if (!username || !password) {
      logger.security('Login attempt without credentials', { ip: req.ip });
      return res.status(400).json({ ok: false, error: 'Username and password required' });
    }
    
    // Get user
    const user = row('SELECT * FROM users WHERE username = ?', [username]);
    
    if (!user) {
      logger.security('Login attempt with non-existent user', { username, ip: req.ip });
      return res.status(401).json({ ok: false, error: 'Invalid username or password' });
    }
    
    // Check account status
    if (user.status !== 'active') {
      logger.security('Login attempt on inactive account', { username, status: user.status, ip: req.ip });
      return res.status(403).json({ ok: false, error: 'Account is inactive or suspended' });
    }
    
    // Check account lockout
    const maxAttempts = parseInt(process.env.MAX_LOGIN_ATTEMPTS) || 5;
    const lockoutDuration = parseInt(process.env.LOCKOUT_DURATION) || 15; // minutes
    
    if (user.login_attempts >= maxAttempts) {
      const lastAttempt = new Date(user.updated_at);
      const lockoutEnd = new Date(lastAttempt.getTime() + lockoutDuration * 60000);
      
      if (new Date() < lockoutEnd) {
        logger.security('Login attempt on locked account', { username, attempts: user.login_attempts, ip: req.ip });
        return res.status(429).json({ 
          ok: false, 
          error: `Account locked. Try again after ${Math.ceil((lockoutEnd - new Date()) / 60000)} minutes` 
        });
      } else {
        // Reset attempts after lockout period
        run('UPDATE users SET login_attempts = 0 WHERE id = ?', [user.id]);
        user.login_attempts = 0;
      }
    }
    
    // Verify password
    const isValidPassword = await comparePassword(password, user.password);
    
    if (!isValidPassword) {
      // Increment failed attempts
      run('UPDATE users SET login_attempts = login_attempts + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [user.id]);
      
      // Audit failed login
      auditAuth(false)(req, res, () => {});
      
      const attemptsLeft = maxAttempts - (user.login_attempts + 1);
      logger.security('Failed login attempt', { 
        username, 
        attempts: user.login_attempts + 1, 
        attemptsLeft,
        ip: req.ip 
      });
      
      return res.status(401).json({ 
        ok: false, 
        error: `Invalid username or password. ${attemptsLeft > 0 ? `${attemptsLeft} attempts remaining` : 'Account will be locked'}` 
      });
    }
    
    // Successful login - reset attempts and generate tokens
    run('UPDATE users SET login_attempts = 0, last_login = CURRENT_TIMESTAMP WHERE id = ?', [user.id]);
    
    // Generate JWT tokens
    const tokens = generateTokenPair(user);
    
    // Log successful login
    logger.auth('Successful login', { username, userId: user.id, ip: req.ip });
    logActivity(user.id, 'login', 'user', user.id, 'User logged in', req.ip);
    
    // Return user info (excluding password) and tokens
    const { password: _, login_attempts: __, ...userInfo } = user;
    
    res.json({ 
      ok: true, 
      user: userInfo,
      ...tokens
    });
  } catch (err) {
    logger.error('Login error', { error: err.message, stack: err.stack });
    res.status(500).json({ ok: false, error: 'Server error' });
  }
});

// Refresh token endpoint
app.post('/api/refresh-token', async (req, res) => {
  try {
    const { refreshToken } = req.body;
    
    if (!refreshToken) {
      return res.status(400).json({ error: 'Refresh token required' });
    }
    
    // Verify refresh token
    const decoded = verifyRefreshToken(refreshToken);
    
    // Get user
    const user = row('SELECT * FROM users WHERE id = ? AND status = ?', [decoded.userId, 'active']);
    
    if (!user) {
      return res.status(401).json({ error: 'User not found or inactive' });
    }
    
    // Generate new token pair
    const tokens = generateTokenPair(user);
    
    logger.auth('Token refreshed', { username: user.username, userId: user.id });
    
    res.json({ ok: true, ...tokens });
  } catch (err) {
    logger.error('Token refresh error', { error: err.message });
    res.status(401).json({ error: 'Invalid refresh token' });
  }
});

// Logout endpoint
app.post('/api/logout', authenticate, (req, res) => {
  try {
    logActivity(req.user.id, 'logout', 'user', req.user.id, 'User logged out', req.ip);
    logger.auth('User logged out', { username: req.user.username, userId: req.user.id });
    res.json({ ok: true, message: 'Logged out successfully' });
  } catch (err) {
    logger.error('Logout error', { error: err.message });
    res.status(500).json({ error: 'Server error' });
  }
});

// Get all users (admin only)
app.get('/api/users', authenticate, authorize('admin'), (req, res) => {
  try {
    const users = rows('SELECT id, username, full_name, email, mobile, role, department, designation, status, last_login, created_at FROM users ORDER BY full_name');
    res.json(users);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'DB error' });
  }
});

// Get single user (admin or self)
app.get('/api/users/:id', authenticate, (req, res) => {
  try {
    // Users can only view their own profile unless admin
    if (req.user.role !== 'admin' && req.user.id !== parseInt(req.params.id)) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const user = row('SELECT id, username, full_name, email, mobile, role, permissions, firm_access, department, designation, photo_url, status, last_login, notes, created_at FROM users WHERE id = ?', [req.params.id]);
    if (!user) return res.status(404).json({ error: 'User not found' });
    
    // Get activity log
    const activity = rows(`
      SELECT * FROM activity_log 
      WHERE user_id = ? 
      ORDER BY created_at DESC 
      LIMIT 50
    `, [req.params.id]);
    
    res.json({ ...user, activity });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'DB error' });
  }
});

// Add user (admin only) with password hashing
app.post('/api/users', authenticate, authorize('admin'), async (req, res) => {
  try {
    const { username, password, full_name, email, mobile, role, permissions, firm_access, department, designation, photo_url, notes } = req.body;
    
    // Validate password strength
    const passwordValidation = validatePasswordStrength(password);
    if (!passwordValidation.valid) {
      return res.status(400).json({ 
        error: 'Password does not meet requirements',
        details: passwordValidation.errors 
      });
    }
    
    // Hash password
    const hashedPassword = await hashPassword(password);
    
    const result = run(`
      INSERT INTO users (
        username, password, full_name, email, mobile, role, permissions,
        firm_access, department, designation, photo_url, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [username, hashedPassword, full_name, email, mobile, role || 'user', permissions, firm_access, department, designation, photo_url, notes]);
    
    logActivity(req.user.id, 'user_created', 'user', result.lastInsertRowid, `Created user: ${username}`, req.ip);
    logger.info('User created', { createdBy: req.user.username, newUser: username });
    
    res.json({ ok: true, id: result.lastInsertRowid });
  } catch (err) {
    logger.error('User creation error', { error: err.message });
    res.status(500).json({ error: 'DB error', message: err.message });
  }
});

// Update user
app.put('/api/users/:id', authenticate, authorize('admin'), (req, res) => {
  try {
    const { full_name, email, mobile, role, permissions, firm_access, department, designation, photo_url, status, notes } = req.body;
    
    run(`
      UPDATE users 
      SET full_name = ?, email = ?, mobile = ?, role = ?, permissions = ?,
          firm_access = ?, department = ?, designation = ?, photo_url = ?, status = ?,
          notes = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [full_name, email, mobile, role, permissions, firm_access, department, designation, photo_url, status, notes, req.params.id]);
    
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'DB error' });
  }
});

// Delete user
app.delete('/api/users/:id', authenticate, authorize('admin'), (req, res) => {
  try {
    run('DELETE FROM users WHERE id = ?', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'DB error' });
  }
});

// ============================================
// TENDER SUMMARY BUILDER
// ============================================

// Get all tender summaries
app.get('/api/tender-summaries', authenticate, (req, res) => {
  try {
    const { tender_id, firm_id } = req.query;
    let query = `
      SELECT ts.*, t.tender_id as tender_no, f.name as firm_name
      FROM tender_summaries ts
      LEFT JOIN tenders t ON ts.tender_id = t.id
      LEFT JOIN firms f ON ts.firm_id = f.id
      WHERE 1=1
    `;
    const params = [];
    
    if (tender_id) {
      query += ' AND ts.tender_id = ?';
      params.push(tender_id);
    }
    if (firm_id) {
      query += ' AND ts.firm_id = ?';
      params.push(firm_id);
    }
    
    query += ' ORDER BY ts.created_at DESC';
    const summaries = rows(query, params);
    res.json(summaries);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'DB error' });
  }
});

// Get single tender summary with items and requirements
app.get('/api/tender-summaries/:id', authenticate, (req, res) => {
  try {
    const summary = row(`
      SELECT ts.*, t.tender_id as tender_no, f.name as firm_name, u.full_name as created_by_name
      FROM tender_summaries ts
      LEFT JOIN tenders t ON ts.tender_id = t.id
      LEFT JOIN firms f ON ts.firm_id = f.id
      LEFT JOIN users u ON ts.created_by = u.id
      WHERE ts.id = ?
    `, [req.params.id]);
    
    if (!summary) return res.status(404).json({ error: 'Summary not found' });
    
    // Get items
    const items = rows('SELECT * FROM tender_summary_items WHERE summary_id = ? ORDER BY item_no', [req.params.id]);
    summary.items = items;
    
    // Get preparation requirements
    const requirements = rows('SELECT * FROM tender_preparation_requirements WHERE summary_id = ? ORDER BY requirement_no', [req.params.id]);
    summary.requirements = requirements;
    
    res.json(summary);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'DB error' });
  }
});

// Create tender summary
app.post('/api/tender-summaries', authenticate, (req, res) => {
  try {
    const {
      egp_tender_id, procuring_entity, official_inviting_tender, brief_description,
      invitation_reference, invitation_date, document_price, document_purchase_deadline,
      submission_deadline, tender_opening_date, procurement_type, procurement_method,
      tender_security_amount, tender_security_in_favour_of, liquid_asset_requirement,
      liquid_asset_in_favour_of, inspection_type, inspection_milestone, inspection_place,
      inspection_procedure, estimated_tender_value, our_estimated_cost, profit_margin,
      manpower_required, equipment_needed, materials_cost, labor_cost, overhead_cost,
      preparation_days, execution_days, risk_level, risks, mitigation_plans,
      executive_summary, recommendation, confidence_level, notes,
      firm_id, tender_id, created_by, items, requirements
    } = req.body;
    
    const result = run(`
      INSERT INTO tender_summaries (
        egp_tender_id, procuring_entity, official_inviting_tender, brief_description,
        invitation_reference, invitation_date, document_price, document_purchase_deadline,
        submission_deadline, tender_opening_date, procurement_type, procurement_method,
        tender_security_amount, tender_security_in_favour_of, liquid_asset_requirement,
        liquid_asset_in_favour_of, inspection_type, inspection_milestone, inspection_place,
        inspection_procedure, estimated_tender_value, our_estimated_cost, profit_margin,
        manpower_required, equipment_needed, materials_cost, labor_cost, overhead_cost,
        preparation_days, execution_days, risk_level, risks, mitigation_plans,
        executive_summary, recommendation, confidence_level, notes,
        firm_id, tender_id, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      egp_tender_id, procuring_entity, official_inviting_tender, brief_description,
      invitation_reference, invitation_date, document_price, document_purchase_deadline,
      submission_deadline, tender_opening_date, procurement_type, procurement_method,
      tender_security_amount, tender_security_in_favour_of, liquid_asset_requirement,
      liquid_asset_in_favour_of, inspection_type, inspection_milestone, inspection_place,
      inspection_procedure, estimated_tender_value, our_estimated_cost, profit_margin,
      manpower_required, equipment_needed, materials_cost, labor_cost, overhead_cost,
      preparation_days, execution_days, risk_level, risks, mitigation_plans,
      executive_summary, recommendation, confidence_level, notes,
      firm_id, tender_id, created_by
    ]);
    
    const summaryId = result.lastInsertRowid;
    
    // Insert items
    if (items && items.length > 0) {
      for (const item of items) {
        run(`
          INSERT INTO tender_summary_items (
            summary_id, item_no, description, technical_specification,
            quantity, unit, point_of_delivery, delivery_period,
            unit_rate, total_amount, notes
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          summaryId, item.item_no, item.description, item.technical_specification,
          item.quantity, item.unit, item.point_of_delivery, item.delivery_period,
          item.unit_rate, item.total_amount, item.notes
        ]);
      }
    }
    
    // Insert requirements
    if (requirements && requirements.length > 0) {
      for (const req of requirements) {
        run(`
          INSERT INTO tender_preparation_requirements (
            summary_id, requirement_no, requirement_text, is_fulfilled, notes, document_path
          ) VALUES (?, ?, ?, ?, ?, ?)
        `, [
          summaryId, req.requirement_no, req.requirement_text, req.is_fulfilled || 0,
          req.notes, req.document_path
        ]);
      }
    }
    
    res.json({ ok: true, id: summaryId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'DB error', message: err.message });
  }
});

// Update tender summary
app.put('/api/tender-summaries/:id', authenticate, (req, res) => {
  try {
    const {
      egp_tender_id, procuring_entity, official_inviting_tender, brief_description,
      invitation_reference, invitation_date, document_price, document_purchase_deadline,
      submission_deadline, tender_opening_date, procurement_type, procurement_method,
      tender_security_amount, tender_security_in_favour_of, liquid_asset_requirement,
      liquid_asset_in_favour_of, inspection_type, inspection_milestone, inspection_place,
      inspection_procedure, estimated_tender_value, our_estimated_cost, profit_margin,
      manpower_required, equipment_needed, materials_cost, labor_cost, overhead_cost,
      preparation_days, execution_days, risk_level, risks, mitigation_plans,
      executive_summary, recommendation, confidence_level, notes,
      items, requirements
    } = req.body;
    
    run(`
      UPDATE tender_summaries 
      SET egp_tender_id = ?, procuring_entity = ?, official_inviting_tender = ?, brief_description = ?,
          invitation_reference = ?, invitation_date = ?, document_price = ?, document_purchase_deadline = ?,
          submission_deadline = ?, tender_opening_date = ?, procurement_type = ?, procurement_method = ?,
          tender_security_amount = ?, tender_security_in_favour_of = ?, liquid_asset_requirement = ?,
          liquid_asset_in_favour_of = ?, inspection_type = ?, inspection_milestone = ?, inspection_place = ?,
          inspection_procedure = ?, estimated_tender_value = ?, our_estimated_cost = ?, profit_margin = ?,
          manpower_required = ?, equipment_needed = ?, materials_cost = ?, labor_cost = ?, overhead_cost = ?,
          preparation_days = ?, execution_days = ?, risk_level = ?, risks = ?, mitigation_plans = ?,
          executive_summary = ?, recommendation = ?, confidence_level = ?, notes = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [
      egp_tender_id, procuring_entity, official_inviting_tender, brief_description,
      invitation_reference, invitation_date, document_price, document_purchase_deadline,
      submission_deadline, tender_opening_date, procurement_type, procurement_method,
      tender_security_amount, tender_security_in_favour_of, liquid_asset_requirement,
      liquid_asset_in_favour_of, inspection_type, inspection_milestone, inspection_place,
      inspection_procedure, estimated_tender_value, our_estimated_cost, profit_margin,
      manpower_required, equipment_needed, materials_cost, labor_cost, overhead_cost,
      preparation_days, execution_days, risk_level, risks, mitigation_plans,
      executive_summary, recommendation, confidence_level, notes,
      req.params.id
    ]);
    
    // Delete and re-insert items
    if (items) {
      run('DELETE FROM tender_summary_items WHERE summary_id = ?', [req.params.id]);
      for (const item of items) {
        run(`
          INSERT INTO tender_summary_items (
            summary_id, item_no, description, technical_specification,
            quantity, unit, point_of_delivery, delivery_period,
            unit_rate, total_amount, notes
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          req.params.id, item.item_no, item.description, item.technical_specification,
          item.quantity, item.unit, item.point_of_delivery, item.delivery_period,
          item.unit_rate, item.total_amount, item.notes
        ]);
      }
    }
    
    // Delete and re-insert requirements
    if (requirements) {
      run('DELETE FROM tender_preparation_requirements WHERE summary_id = ?', [req.params.id]);
      for (const requirement of requirements) {
        run(`
          INSERT INTO tender_preparation_requirements (
            summary_id, requirement_no, requirement_text, is_fulfilled, notes, document_path
          ) VALUES (?, ?, ?, ?, ?, ?)
        `, [
          req.params.id, requirement.requirement_no, requirement.requirement_text,
          requirement.is_fulfilled || 0, requirement.notes, requirement.document_path
        ]);
      }
    }
    
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'DB error', message: err.message });
  }
});

// Delete tender summary (cascade will delete items and requirements)
app.delete('/api/tender-summaries/:id', authenticate, authorize('admin', 'manager'), (req, res) => {
  try {
    run('DELETE FROM tender_summaries WHERE id = ?', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'DB error' });
  }
});

// ============================================
// ALERT SYSTEM
// ============================================

// Manual trigger for alert generation
app.post('/api/alerts/generate', authenticate, authorize('admin'), (req, res) => {
  try {
    alertGenerator.generateAllAlerts();
    const report = alertGenerator.generateReport();
    res.json({ ok: true, report });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Alert generation error' });
  }
});

// Get alert statistics
app.get('/api/alerts/stats', authenticate, (req, res) => {
  try {
    const stats = {
      pending: {
        high: row("SELECT COUNT(*) as count FROM alerts WHERE priority = 'high' AND status = 'pending'"),
        medium: row("SELECT COUNT(*) as count FROM alerts WHERE priority = 'medium' AND status = 'pending'"),
        low: row("SELECT COUNT(*) as count FROM alerts WHERE priority = 'low' AND status = 'pending'"),
        total: row("SELECT COUNT(*) as count FROM alerts WHERE status = 'pending'")
      },
      byType: rows(`
        SELECT alert_type, COUNT(*) as count 
        FROM alerts 
        WHERE status = 'pending' 
        GROUP BY alert_type
      `),
      recent: rows(`
        SELECT a.*, f.name as firm_name 
        FROM alerts a
        LEFT JOIN firms f ON a.firm_id = f.id
        WHERE a.status = 'pending'
        ORDER BY a.priority DESC, a.alert_date
        LIMIT 10
      `)
    };
    res.json(stats);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'DB error' });
  }
});

// ============================================
// Fallback: serve index.html for any other route (SPA)
// ============================================
// LETTER HUB API
// ============================================

// Letter Categories
app.get('/api/letter-categories', authenticate, (req, res) => {
  const rows = all('SELECT * FROM letter_categories ORDER BY name');
  res.json(rows);
});

app.post('/api/letter-categories', authenticate, authorize('admin', 'manager'), (req, res) => {
  const { name, description, icon } = req.body;
  const result = run(
    'INSERT INTO letter_categories (name, description, icon) VALUES (?, ?, ?)',
    [name, description, icon]
  );
  res.json({ id: result.lastInsertRowid, name, description, icon });
});

app.put('/api/letter-categories/:id', authenticate, authorize('admin', 'manager'), (req, res) => {
  const { name, description, icon } = req.body;
  run(
    'UPDATE letter_categories SET name = ?, description = ?, icon = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
    [name, description, icon, req.params.id]
  );
  res.json({ success: true });
});

app.delete('/api/letter-categories/:id', authenticate, authorize('admin'), (req, res) => {
  run('DELETE FROM letter_categories WHERE id = ?', [req.params.id]);
  res.json({ success: true });
});

// Letter Templates
app.get('/api/letter-templates', authenticate, (req, res) => {
  const rows = all(`
    SELECT lt.*, lc.name as category_name, u.username as created_by_name
    FROM letter_templates lt
    LEFT JOIN letter_categories lc ON lt.category_id = lc.id
    LEFT JOIN users u ON lt.created_by = u.id
    ORDER BY lt.created_at DESC
  `);
  res.json(rows);
});

app.get('/api/letter-templates/:id', authenticate, (req, res) => {
  const template = row('SELECT * FROM letter_templates WHERE id = ?', [req.params.id]);
  if (!template) return res.status(404).json({ error: 'Template not found' });
  res.json(template);
});

app.post('/api/letter-templates', authenticate, (req, res) => {
  const { category_id, title, subject, content, tags, language, is_official, notes, created_by } = req.body;
  const result = run(
    `INSERT INTO letter_templates (category_id, title, subject, content, tags, language, is_official, notes, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [category_id, title, subject, content, tags, language || 'en', is_official !== false ? 1 : 0, notes, created_by]
  );
  res.json({ id: result.lastInsertRowid });
});

app.put('/api/letter-templates/:id', authenticate, (req, res) => {
  const { category_id, title, subject, content, tags, language, is_official, status, notes } = req.body;
  run(
    `UPDATE letter_templates SET category_id = ?, title = ?, subject = ?, content = ?, tags = ?, 
     language = ?, is_official = ?, status = ?, notes = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    [category_id, title, subject, content, tags, language, is_official, status, notes, req.params.id]
  );
  run('UPDATE letter_templates SET usage_count = usage_count + 1 WHERE id = ?', [req.params.id]);
  res.json({ success: true });
});

app.delete('/api/letter-templates/:id', authenticate, authorize('admin', 'manager'), (req, res) => {
  run('DELETE FROM letter_templates WHERE id = ?', [req.params.id]);
  res.json({ success: true });
});

// Generated Letters
app.get('/api/generated-letters', authenticate, (req, res) => {
  const rows = all(`
    SELECT gl.*, f.name as firm_name, p.project_name as project_name, u.username as generated_by_name
    FROM generated_letters gl
    LEFT JOIN firms f ON gl.firm_id = f.id
    LEFT JOIN projects p ON gl.project_id = p.id
    LEFT JOIN users u ON gl.generated_by = u.id
    ORDER BY gl.created_at DESC
  `);
  res.json(rows);
});

app.get('/api/generated-letters/:id', authenticate, (req, res) => {
  const letter = row('SELECT * FROM generated_letters WHERE id = ?', [req.params.id]);
  if (!letter) return res.status(404).json({ error: 'Letter not found' });
  res.json(letter);
});

app.post('/api/generated-letters', authenticate, (req, res) => {
  const { template_id, firm_id, project_id, reference_number, recipient_name, recipient_designation,
          recipient_organization, recipient_address, subject, content, letter_date, status, notes, generated_by } = req.body;
  const result = run(
    `INSERT INTO generated_letters (template_id, firm_id, project_id, reference_number, recipient_name,
     recipient_designation, recipient_organization, recipient_address, subject, content, letter_date, status, notes, generated_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [template_id, firm_id, project_id, reference_number, recipient_name, recipient_designation,
     recipient_organization, recipient_address, subject, content, letter_date, status || 'draft', notes, generated_by]
  );
  res.json({ id: result.lastInsertRowid });
});

app.put('/api/generated-letters/:id', authenticate, (req, res) => {
  const { recipient_name, recipient_designation, recipient_organization, recipient_address,
          subject, content, letter_date, sent_date, status, notes } = req.body;
  run(
    `UPDATE generated_letters SET recipient_name = ?, recipient_designation = ?, recipient_organization = ?,
     recipient_address = ?, subject = ?, content = ?, letter_date = ?, sent_date = ?, status = ?, notes = ?,
     updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    [recipient_name, recipient_designation, recipient_organization, recipient_address,
     subject, content, letter_date, sent_date, status, notes, req.params.id]
  );
  res.json({ success: true });
});

app.delete('/api/generated-letters/:id', authenticate, authorize('admin', 'manager'), (req, res) => {
  run('DELETE FROM generated_letters WHERE id = ?', [req.params.id]);
  res.json({ success: true });
});

// ============================================
// FIRM DOCUMENTS MANAGEMENT
// ============================================

// Get all documents for a firm
app.get('/api/firms/:firmId/documents', authenticate, checkFirmAccess, (req, res) => {
  try {
    const documents = rows(
      'SELECT * FROM firm_documents WHERE firm_id = ? ORDER BY created_at DESC',
      [req.params.firmId]
    );
    res.json(documents);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'DB error' });
  }
});

// Get firm dashboard data
app.get('/api/firms/:firmId/dashboard', authenticate, checkFirmAccess, (req, res) => {
  try {
    const firmId = req.params.firmId;
    
    // Get firm details
    const firm = row('SELECT * FROM firms WHERE id = ?', [firmId]);
    if (!firm) return res.status(404).json({ error: 'Firm not found' });
    
    // Get document statistics
    const totalDocs = row('SELECT COUNT(*) as count FROM firm_documents WHERE firm_id = ?', [firmId]).count;
    const expiredDocs = row(
      "SELECT COUNT(*) as count FROM firm_documents WHERE firm_id = ? AND has_expiry = 1 AND expiry_date < date('now') AND status = 'active'",
      [firmId]
    ).count;
    const expiringDocs = row(
      "SELECT COUNT(*) as count FROM firm_documents WHERE firm_id = ? AND has_expiry = 1 AND expiry_date BETWEEN date('now') AND date('now', '+30 days') AND status = 'active'",
      [firmId]
    ).count;
    
    // Get documents by type
    const docsByType = rows(
      'SELECT document_type, COUNT(*) as count FROM firm_documents WHERE firm_id = ? GROUP BY document_type',
      [firmId]
    );
    
    // Get expiring documents
    const expiringDocuments = rows(
      "SELECT * FROM firm_documents WHERE firm_id = ? AND has_expiry = 1 AND expiry_date BETWEEN date('now') AND date('now', '+60 days') AND status = 'active' ORDER BY expiry_date",
      [firmId]
    );
    
    // Get recent documents
    const recentDocuments = rows(
      'SELECT * FROM firm_documents WHERE firm_id = ? ORDER BY created_at DESC LIMIT 10',
      [firmId]
    );
    
    // Get licenses
    const licenses = rows('SELECT * FROM licenses WHERE firm_id = ? ORDER BY expiry_date', [firmId]);
    
    // Get enlistments
    const enlistments = rows('SELECT * FROM enlistments WHERE firm_id = ? ORDER BY expiry_date', [firmId]);
    
    // Get bank accounts
    const bankAccounts = rows('SELECT * FROM bank_accounts WHERE firm_id = ?', [firmId]);
    
    // Get bank guarantees
    const bankGuarantees = rows('SELECT * FROM bank_guarantees WHERE firm_id = ? ORDER BY expiry_date', [firmId]);
    
    // Get active tenders
    const activeTenders = rows(
      "SELECT * FROM tenders WHERE assigned_firm_id = ? AND status IN ('open', 'submitted', 'under_evaluation') ORDER BY lastSubmission",
      [firmId]
    );
    
    // Get active projects
    const activeProjects = rows(
      "SELECT * FROM projects WHERE firm_id = ? AND status IN ('ongoing', 'suspended') ORDER BY commencement_date DESC",
      [firmId]
    );
    
    res.json({
      firm,
      stats: {
        totalDocs,
        expiredDocs,
        expiringDocs,
        docsByType
      },
      expiringDocuments,
      recentDocuments,
      licenses,
      enlistments,
      bankAccounts,
      bankGuarantees,
      activeTenders,
      activeProjects
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'DB error' });
  }
});

// Add new document with file upload
app.post('/api/firms/:firmId/documents', authenticate, checkFirmAccess, uploadDocument.single('document_file'), (req, res) => {
  try {
    const { firmId } = req.params;
    const {
      document_type, document_name, document_number, description,
      issue_date, expiry_date, issuing_authority,
      has_expiry, reminder_days, notes
    } = req.body;
    
    // Get file info from multer
    let file_path = null;
    let file_type = null;
    let file_size = null;
    let original_filename = null;
    
    if (req.file) {
      file_path = req.file.path;
      file_type = path.extname(req.file.originalname).substring(1).toLowerCase();
      file_size = req.file.size;
      original_filename = req.file.originalname;
    }
    
    const result = run(
      `INSERT INTO firm_documents (
        firm_id, document_type, document_name, document_number, description,
        issue_date, expiry_date, issuing_authority, file_path, file_type,
        file_size, has_expiry, reminder_days, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        firmId, document_type, document_name, document_number, description,
        issue_date, expiry_date, issuing_authority, file_path, file_type,
        file_size, has_expiry || 0, reminder_days || 30, notes
      ]
    );
    
    res.json({ 
      id: result.lastInsertRowid, 
      success: true,
      file_uploaded: !!req.file,
      original_filename: original_filename
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'DB error', message: err.message });
  }
});

// Get single document details
app.get('/api/firms/:firmId/documents/:id', authenticate, (req, res) => {
  try {
    const doc = row('SELECT * FROM firm_documents WHERE id = ?', [req.params.id]);
    if (!doc) {
      return res.status(404).json({ error: 'Document not found' });
    }
    res.json(doc);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'DB error' });
  }
});

// Update document
app.put('/api/firms/:firmId/documents/:id', authenticate, checkFirmAccess, uploadDocument.single('document_file'), (req, res) => {
  try {
    const { id } = req.params;
    const {
      document_type, document_name, document_number, description,
      issue_date, expiry_date, issuing_authority,
      status, has_expiry, reminder_days, notes
    } = req.body;
    
    // Get existing document to check for old file
    const existingDoc = row('SELECT file_path FROM firm_documents WHERE id = ?', [id]);
    
    // Handle file upload
    let file_path = existingDoc?.file_path || null;
    let file_type = null;
    let file_size = null;
    
    if (req.file) {
      // Delete old file if exists
      if (existingDoc?.file_path && fs.existsSync(existingDoc.file_path)) {
        fs.unlinkSync(existingDoc.file_path);
      }
      file_path = req.file.path;
      file_type = path.extname(req.file.originalname).substring(1).toLowerCase();
      file_size = req.file.size;
    }
    
    run(
      `UPDATE firm_documents SET
        document_type = ?, document_name = ?, document_number = ?, description = ?,
        issue_date = ?, expiry_date = ?, issuing_authority = ?, file_path = ?,
        file_type = ?, file_size = ?, status = ?, has_expiry = ?, reminder_days = ?,
        notes = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?`,
      [
        document_type, document_name, document_number, description,
        issue_date || null, expiry_date || null, issuing_authority || null, file_path,
        file_type, file_size, status || 'active', has_expiry || 0, reminder_days || 30,
        notes || null, id
      ]
    );
    
    res.json({ 
      success: true, 
      file_uploaded: req.file ? true : false,
      original_filename: req.file ? req.file.originalname : null
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'DB error' });
  }
});

// Delete document
app.delete('/api/firms/:firmId/documents/:id', authenticate, checkFirmAccess, auditLog('delete', 'document'), (req, res) => {
  try {
    const doc = row('SELECT file_path FROM firm_documents WHERE id = ?', [req.params.id]);
    
    // Delete physical file if exists
    if (doc && doc.file_path && fs.existsSync(doc.file_path)) {
      fs.unlinkSync(doc.file_path);
    }
    
    run('DELETE FROM firm_documents WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'DB error' });
  }
});

// View/Preview document file
app.get('/api/documents/:id/view', authenticate, (req, res) => {
  try {
    const docId = req.params.id;
    const doc = row('SELECT * FROM firm_documents WHERE id = ?', [docId]);
    
    if (!doc) {
      return res.status(404).json({ error: 'Document not found' });
    }
    
    if (!doc.file_path) {
      return res.status(404).json({ error: 'No file attached to this document' });
    }
    
    const filePath = doc.file_path;
    
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found on disk' });
    }
    
    // Set appropriate content type
    const contentTypes = {
      'pdf': 'application/pdf',
      'jpg': 'image/jpeg',
      'jpeg': 'image/jpeg',
      'png': 'image/png',
      'doc': 'application/msword',
      'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'xls': 'application/vnd.ms-excel'
    };
    
    const contentType = contentTypes[doc.file_type] || 'application/octet-stream';
    
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `inline; filename="${doc.document_name}.${doc.file_type}"`);
    
    const fileStream = fs.createReadStream(filePath);
    fileStream.pipe(res);
    
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Download document file
app.get('/api/documents/:id/download', authenticate, (req, res) => {
  try {
    const docId = req.params.id;
    const doc = row('SELECT * FROM firm_documents WHERE id = ?', [docId]);
    
    if (!doc) {
      return res.status(404).json({ error: 'Document not found' });
    }
    
    if (!doc.file_path) {
      return res.status(404).json({ error: 'No file attached to this document' });
    }
    
    const filePath = doc.file_path;
    
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found on disk' });
    }
    
    // Force download with proper filename
    res.download(filePath, `${doc.document_name}.${doc.file_type}`, (err) => {
      if (err) {
        console.error('Download error:', err);
        if (!res.headersSent) {
          res.status(500).json({ error: 'Download failed' });
        }
      }
    });
    
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ============================================
// EXPENSE MANAGER API
// ============================================

// Expense Categories
app.get('/api/expense-categories', authenticate, (req, res) => {
  const rows = all('SELECT * FROM expense_categories WHERE is_active = 1 ORDER BY name');
  res.json(rows);
});

app.post('/api/expense-categories', authenticate, authorize('admin', 'manager'), (req, res) => {
  const { name, parent_id, description, budget_limit, icon } = req.body;
  const result = run(
    'INSERT INTO expense_categories (name, parent_id, description, budget_limit, icon) VALUES (?, ?, ?, ?, ?)',
    [name, parent_id, description, budget_limit, icon]
  );
  res.json({ id: result.lastInsertRowid });
});

app.put('/api/expense-categories/:id', authenticate, authorize('admin', 'manager'), (req, res) => {
  const { name, description, budget_limit, icon, is_active } = req.body;
  run(
    'UPDATE expense_categories SET name = ?, description = ?, budget_limit = ?, icon = ?, is_active = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
    [name, description, budget_limit, icon, is_active, req.params.id]
  );
  res.json({ success: true });
});

app.delete('/api/expense-categories/:id', authenticate, authorize('admin'), (req, res) => {
  run('UPDATE expense_categories SET is_active = 0 WHERE id = ?', [req.params.id]);
  res.json({ success: true });
});

// Expenses
app.get('/api/expenses', (req, res) => {
  const { status, firm_id, project_id, start_date, end_date } = req.query;
  let sql = `
    SELECT e.*, ec.name as category_name, ec.icon as category_icon,
           f.name as firm_name, p.project_name as project_name, u.username as created_by_name
    FROM expenses e
    LEFT JOIN expense_categories ec ON e.category_id = ec.id
    LEFT JOIN firms f ON e.firm_id = f.id
    LEFT JOIN projects p ON e.project_id = p.id
    LEFT JOIN users u ON e.created_by = u.id
    WHERE 1=1
  `;
  const params = [];
  
  if (status) {
    sql += ' AND e.status = ?';
    params.push(status);
  }
  if (firm_id) {
    sql += ' AND e.firm_id = ?';
    params.push(firm_id);
  }
  if (project_id) {
    sql += ' AND e.project_id = ?';
    params.push(project_id);
  }
  if (start_date) {
    sql += ' AND e.expense_date >= ?';
    params.push(start_date);
  }
  if (end_date) {
    sql += ' AND e.expense_date <= ?';
    params.push(end_date);
  }
  
  sql += ' ORDER BY e.expense_date DESC, e.created_at DESC';
  
  const rows = all(sql, params);
  res.json(rows);
});

app.get('/api/expenses/:id', (req, res) => {
  const expense = row('SELECT * FROM expenses WHERE id = ?', [req.params.id]);
  if (!expense) return res.status(404).json({ error: 'Expense not found' });
  res.json(expense);
});

app.post('/api/expenses', (req, res) => {
  const { category_id, firm_id, project_id, expense_date, amount, payment_method, payment_reference,
          vendor_name, vendor_contact, description, receipt_number, is_billable, is_reimbursable,
          status, notes, created_by } = req.body;
  const result = run(
    `INSERT INTO expenses (category_id, firm_id, project_id, expense_date, amount, payment_method,
     payment_reference, vendor_name, vendor_contact, description, receipt_number, is_billable,
     is_reimbursable, status, notes, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [category_id, firm_id, project_id, expense_date, amount, payment_method, payment_reference,
     vendor_name, vendor_contact, description, receipt_number, is_billable || 0, is_reimbursable || 0,
     status || 'pending', notes, created_by]
  );
  res.json({ id: result.lastInsertRowid });
});

app.put('/api/expenses/:id', (req, res) => {
  const { category_id, firm_id, project_id, expense_date, amount, payment_method, payment_reference,
          vendor_name, vendor_contact, description, receipt_number, is_billable, is_reimbursable,
          reimbursed, reimbursement_date, approved_by, approval_date, status, notes } = req.body;
  run(
    `UPDATE expenses SET category_id = ?, firm_id = ?, project_id = ?, expense_date = ?, amount = ?,
     payment_method = ?, payment_reference = ?, vendor_name = ?, vendor_contact = ?, description = ?,
     receipt_number = ?, is_billable = ?, is_reimbursable = ?, reimbursed = ?, reimbursement_date = ?,
     approved_by = ?, approval_date = ?, status = ?, notes = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    [category_id, firm_id, project_id, expense_date, amount, payment_method, payment_reference,
     vendor_name, vendor_contact, description, receipt_number, is_billable, is_reimbursable,
     reimbursed, reimbursement_date, approved_by, approval_date, status, notes, req.params.id]
  );
  res.json({ success: true });
});

app.delete('/api/expenses/:id', (req, res) => {
  run('DELETE FROM expenses WHERE id = ?', [req.params.id]);
  res.json({ success: true });
});

// Expense Statistics
app.get('/api/expenses/stats/summary', (req, res) => {
  const { start_date, end_date } = req.query;
  let sql = `
    SELECT 
      COUNT(*) as total_count,
      SUM(amount) as total_amount,
      SUM(CASE WHEN status = 'pending' THEN amount ELSE 0 END) as pending_amount,
      SUM(CASE WHEN status = 'approved' THEN amount ELSE 0 END) as approved_amount,
      SUM(CASE WHEN status = 'paid' THEN amount ELSE 0 END) as paid_amount,
      SUM(CASE WHEN is_billable = 1 THEN amount ELSE 0 END) as billable_amount,
      SUM(CASE WHEN is_reimbursable = 1 AND reimbursed = 0 THEN amount ELSE 0 END) as pending_reimbursement
    FROM expenses WHERE 1=1
  `;
  const params = [];
  
  if (start_date) {
    sql += ' AND expense_date >= ?';
    params.push(start_date);
  }
  if (end_date) {
    sql += ' AND expense_date <= ?';
    params.push(end_date);
  }
  
  const stats = row(sql, params);
  res.json(stats);
});

app.get('/api/expenses/stats/by-category', (req, res) => {
  const { start_date, end_date } = req.query;
  let sql = `
    SELECT ec.name, ec.icon, ec.budget_limit,
           SUM(e.amount) as total_spent,
           COUNT(e.id) as expense_count
    FROM expense_categories ec
    LEFT JOIN expenses e ON ec.id = e.category_id
  `;
  const params = [];
  
  if (start_date || end_date) {
    sql += ' WHERE 1=1';
    if (start_date) {
      sql += ' AND e.expense_date >= ?';
      params.push(start_date);
    }
    if (end_date) {
      sql += ' AND e.expense_date <= ?';
      params.push(end_date);
    }
  }
  
  sql += ' GROUP BY ec.id ORDER BY total_spent DESC';
  
  const stats = all(sql, params);
  res.json(stats);
});

// Expense Budgets
app.get('/api/expense-budgets', (req, res) => {
  const rows = all(`
    SELECT eb.*, ec.name as category_name, p.project_name as project_name
    FROM expense_budgets eb
    LEFT JOIN expense_categories ec ON eb.category_id = ec.id
    LEFT JOIN projects p ON eb.project_id = p.id
    ORDER BY eb.period_start DESC
  `);
  res.json(rows);
});

app.post('/api/expense-budgets', (req, res) => {
  const { category_id, project_id, budget_amount, period_type, period_start, period_end, notes } = req.body;
  const result = run(
    'INSERT INTO expense_budgets (category_id, project_id, budget_amount, period_type, period_start, period_end, notes) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [category_id, project_id, budget_amount, period_type, period_start, period_end, notes]
  );
  res.json({ id: result.lastInsertRowid });
});

app.put('/api/expense-budgets/:id', (req, res) => {
  const { budget_amount, spent_amount, notes } = req.body;
  run(
    'UPDATE expense_budgets SET budget_amount = ?, spent_amount = ?, notes = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
    [budget_amount, spent_amount, notes, req.params.id]
  );
  res.json({ success: true });
});

app.delete('/api/expense-budgets/:id', (req, res) => {
  run('DELETE FROM expense_budgets WHERE id = ?', [req.params.id]);
  res.json({ success: true });
});

// ============================================
// REPORT EXPORT ENDPOINTS
// ============================================

const reportGenerator = new ReportGenerator(db);

// Export Firms Report
app.get('/api/reports/firms/:format', authenticate, async (req, res) => {
  try {
    const format = req.params.format; // pdf or excel
    const firmId = req.query.firm_id;
    
    let query = 'SELECT * FROM firms';
    let params = [];
    
    if (firmId) {
      query += ' WHERE id = ?';
      params.push(firmId);
    }
    
    const firms = rows(query, params);
    
    if (format === 'pdf') {
      const pdfBuffer = await reportGenerator.generatePDF('firms', firms, {
        firmName: firmId ? firms[0]?.name : 'All Firms'
      });
      res.contentType('application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="firms-report-${Date.now()}.pdf"`);
      res.send(pdfBuffer);
    } else if (format === 'excel') {
      const excelBuffer = await reportGenerator.generateExcel('firms', firms);
      res.contentType('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="firms-report-${Date.now()}.xlsx"`);
      res.send(excelBuffer);
    } else {
      res.status(400).json({ error: 'Invalid format. Use pdf or excel' });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to generate report' });
  }
});

// Export Tenders Report
app.get('/api/reports/tenders/:format', authenticate, async (req, res) => {
  try {
    const format = req.params.format;
    const status = req.query.status;
    const firmId = req.query.firm_id;
    
    let query = `
      SELECT t.*, f.name as firm_name
      FROM tenders t
      LEFT JOIN firms f ON t.firm_id = f.id
      WHERE 1=1
    `;
    const params = [];
    
    if (status) {
      query += ' AND t.status = ?';
      params.push(status);
    }
    
    if (firmId) {
      query += ' AND t.firm_id = ?';
      params.push(firmId);
    }
    
    query += ' ORDER BY t.created_at DESC';
    
    const tenders = rows(query, params);
    
    if (format === 'pdf') {
      const pdfBuffer = await reportGenerator.generatePDF('tenders', tenders);
      res.contentType('application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="tenders-report-${Date.now()}.pdf"`);
      res.send(pdfBuffer);
    } else if (format === 'excel') {
      const excelBuffer = await reportGenerator.generateExcel('tenders', tenders);
      res.contentType('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="tenders-report-${Date.now()}.xlsx"`);
      res.send(excelBuffer);
    } else {
      res.status(400).json({ error: 'Invalid format' });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to generate report' });
  }
});

// Export Tender Summary Report
app.get('/api/reports/tender-summary/:id/:format', authenticate, async (req, res) => {
  try {
    const format = req.params.format;
    const summaryId = req.params.id;
    
    const summary = row('SELECT * FROM tender_summaries WHERE id = ?', [summaryId]);
    if (!summary) {
      return res.status(404).json({ error: 'Tender summary not found' });
    }
    
    // Get items
    summary.items = rows('SELECT * FROM tender_summary_items WHERE summary_id = ? ORDER BY item_no', [summaryId]);
    
    // Get requirements
    summary.requirements = rows('SELECT * FROM tender_preparation_requirements WHERE summary_id = ?', [summaryId]);
    
    if (format === 'pdf') {
      const pdfBuffer = await reportGenerator.generatePDF('tender-summary', summary);
      res.contentType('application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="tender-summary-${summaryId}-${Date.now()}.pdf"`);
      res.send(pdfBuffer);
    } else if (format === 'excel') {
      const excelBuffer = await reportGenerator.generateExcel('tender-summary', summary);
      res.contentType('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="tender-summary-${summaryId}-${Date.now()}.xlsx"`);
      res.send(excelBuffer);
    } else {
      res.status(400).json({ error: 'Invalid format' });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to generate report' });
  }
});

// Export Projects Report
app.get('/api/reports/projects/:format', authenticate, async (req, res) => {
  try {
    const format = req.params.format;
    const status = req.query.status;
    const firmId = req.query.firm_id;
    
    let query = `
      SELECT p.*, f.name as firm_name
      FROM projects p
      LEFT JOIN firms f ON p.firm_id = f.id
      WHERE 1=1
    `;
    const params = [];
    
    if (status) {
      query += ' AND p.status = ?';
      params.push(status);
    }
    
    if (firmId) {
      query += ' AND p.firm_id = ?';
      params.push(firmId);
    }
    
    query += ' ORDER BY p.created_at DESC';
    
    const projects = rows(query, params);
    
    if (format === 'pdf') {
      const pdfBuffer = await reportGenerator.generatePDF('projects', projects);
      res.contentType('application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="projects-report-${Date.now()}.pdf"`);
      res.send(pdfBuffer);
    } else if (format === 'excel') {
      const excelBuffer = await reportGenerator.generateExcel('projects', projects);
      res.contentType('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="projects-report-${Date.now()}.xlsx"`);
      res.send(excelBuffer);
    } else {
      res.status(400).json({ error: 'Invalid format' });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to generate report' });
  }
});

// Export Financial Report
app.get('/api/reports/financial/:format', authenticate, async (req, res) => {
  try {
    const format = req.params.format;
    const firmId = req.query.firm_id;
    
    const data = {};
    
    // Bank Accounts
    let query = 'SELECT * FROM bank_accounts';
    let params = [];
    if (firmId) {
      query += ' WHERE firm_id = ?';
      params.push(firmId);
    }
    data.bankAccounts = rows(query, params);
    
    // Loans
    query = 'SELECT * FROM loans';
    params = [];
    if (firmId) {
      query += ' WHERE firm_id = ?';
      params.push(firmId);
    }
    data.loans = rows(query, params);
    
    // Bank Guarantees
    query = 'SELECT * FROM bank_guarantees';
    params = [];
    if (firmId) {
      query += ' WHERE firm_id = ?';
      params.push(firmId);
    }
    data.guarantees = rows(query, params);
    
    if (format === 'pdf') {
      const pdfBuffer = await reportGenerator.generatePDF('financial', data);
      res.contentType('application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="financial-report-${Date.now()}.pdf"`);
      res.send(pdfBuffer);
    } else if (format === 'excel') {
      const excelBuffer = await reportGenerator.generateExcel('financial', data);
      res.contentType('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="financial-report-${Date.now()}.xlsx"`);
      res.send(excelBuffer);
    } else {
      res.status(400).json({ error: 'Invalid format' });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to generate report' });
  }
});

// Export Expenses Report
app.get('/api/reports/expenses/:format', authenticate, async (req, res) => {
  try {
    const format = req.params.format;
    const startDate = req.query.start_date;
    const endDate = req.query.end_date;
    const categoryId = req.query.category_id;
    
    let query = `
      SELECT e.*, ec.name as category_name, f.name as firm_name
      FROM expenses e
      LEFT JOIN expense_categories ec ON e.category_id = ec.id
      LEFT JOIN firms f ON e.firm_id = f.id
      WHERE 1=1
    `;
    const params = [];
    
    if (startDate) {
      query += ' AND e.expense_date >= ?';
      params.push(startDate);
    }
    
    if (endDate) {
      query += ' AND e.expense_date <= ?';
      params.push(endDate);
    }
    
    if (categoryId) {
      query += ' AND e.category_id = ?';
      params.push(categoryId);
    }
    
    query += ' ORDER BY e.expense_date DESC';
    
    const expenses = rows(query, params);
    
    if (format === 'pdf') {
      const pdfBuffer = await reportGenerator.generatePDF('expenses', expenses);
      res.contentType('application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="expenses-report-${Date.now()}.pdf"`);
      res.send(pdfBuffer);
    } else if (format === 'excel') {
      const excelBuffer = await reportGenerator.generateExcel('expenses', expenses);
      res.contentType('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="expenses-report-${Date.now()}.xlsx"`);
      res.send(excelBuffer);
    } else {
      res.status(400).json({ error: 'Invalid format' });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to generate report' });
  }
});

// Export Team Report
app.get('/api/reports/team/:format', authenticate, async (req, res) => {
  try {
    const format = req.params.format;
    const firmId = req.query.firm_id;
    
    let query = 'SELECT * FROM team_members';
    let params = [];
    
    if (firmId) {
      query += ' WHERE firm_id = ?';
      params.push(firmId);
    }
    
    query += ' ORDER BY name';
    
    const team = rows(query, params);
    
    if (format === 'pdf') {
      const pdfBuffer = await reportGenerator.generatePDF('team', team);
      res.contentType('application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="team-report-${Date.now()}.pdf"`);
      res.send(pdfBuffer);
    } else if (format === 'excel') {
      const excelBuffer = await reportGenerator.generateExcel('team', team);
      res.contentType('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="team-report-${Date.now()}.xlsx"`);
      res.send(excelBuffer);
    } else {
      res.status(400).json({ error: 'Invalid format' });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to generate report' });
  }
});

// Export Contacts Report
app.get('/api/reports/contacts/:format', authenticate, async (req, res) => {
  try {
    const format = req.params.format;
    const contactType = req.query.contact_type;
    const firmId = req.query.firm_id;
    
    let query = 'SELECT * FROM contacts WHERE 1=1';
    const params = [];
    
    if (contactType) {
      query += ' AND contact_type = ?';
      params.push(contactType);
    }
    
    if (firmId) {
      query += ' AND firm_id = ?';
      params.push(firmId);
    }
    
    query += ' ORDER BY name';
    
    const contacts = rows(query, params);
    
    if (format === 'pdf') {
      const pdfBuffer = await reportGenerator.generatePDF('contacts', contacts);
      res.contentType('application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="contacts-report-${Date.now()}.pdf"`);
      res.send(pdfBuffer);
    } else if (format === 'excel') {
      const excelBuffer = await reportGenerator.generateExcel('contacts', contacts);
      res.contentType('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="contacts-report-${Date.now()}.xlsx"`);
      res.send(excelBuffer);
    } else {
      res.status(400).json({ error: 'Invalid format' });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to generate report' });
  }
});

// Export Licenses Report
app.get('/api/reports/licenses/:format', authenticate, async (req, res) => {
  try {
    const format = req.params.format;
    const firmId = req.query.firm_id;
    
    let query = 'SELECT * FROM licenses';
    let params = [];
    
    if (firmId) {
      query += ' WHERE firm_id = ?';
      params.push(firmId);
    }
    
    query += ' ORDER BY expiry_date DESC';
    
    const licenses = rows(query, params);
    
    if (format === 'pdf') {
      const pdfBuffer = await reportGenerator.generatePDF('licenses', licenses);
      res.contentType('application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="licenses-report-${Date.now()}.pdf"`);
      res.send(pdfBuffer);
    } else if (format === 'excel') {
      const excelBuffer = await reportGenerator.generateExcel('licenses', licenses);
      res.contentType('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="licenses-report-${Date.now()}.xlsx"`);
      res.send(excelBuffer);
    } else {
      res.status(400).json({ error: 'Invalid format' });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to generate report' });
  }
});

// Export Comprehensive Report (All data)
app.get('/api/reports/comprehensive/:format', authenticate, authorize('admin'), async (req, res) => {
  try {
    const format = req.params.format;
    
    const data = {
      stats: {
        totalFirms: row('SELECT COUNT(*) as count FROM firms')?.count || 0,
        activeTenders: row('SELECT COUNT(*) as count FROM tenders WHERE status = ?', ['active'])?.count || 0,
        ongoingProjects: row('SELECT COUNT(*) as count FROM projects WHERE status = ?', ['ongoing'])?.count || 0,
        totalTeam: row('SELECT COUNT(*) as count FROM team_members WHERE status = ?', ['active'])?.count || 0
      },
      firms: rows('SELECT * FROM firms LIMIT 50'),
      tenders: rows('SELECT * FROM tenders WHERE status = ? LIMIT 50', ['active']),
      projects: rows('SELECT * FROM projects WHERE status = ? LIMIT 50', ['ongoing']),
      financial: {
        bankAccounts: rows('SELECT * FROM bank_accounts LIMIT 20'),
        loans: rows('SELECT * FROM loans WHERE status = ? LIMIT 20', ['active']),
        guarantees: rows('SELECT * FROM bank_guarantees WHERE status = ? LIMIT 20', ['active'])
      }
    };
    
    if (format === 'pdf') {
      const pdfBuffer = await reportGenerator.generatePDF('comprehensive', data);
      res.contentType('application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="comprehensive-report-${Date.now()}.pdf"`);
      res.send(pdfBuffer);
    } else if (format === 'excel') {
      const excelBuffer = await reportGenerator.generateExcel('comprehensive', data);
      res.contentType('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="comprehensive-report-${Date.now()}.xlsx"`);
      res.send(excelBuffer);
    } else {
      res.status(400).json({ error: 'Invalid format' });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to generate report' });
  }
});

// ============================================
// NOTIFICATION & ALERT SYSTEM
// ============================================

// GET /api/notifications - Get all notifications for current user
app.get('/api/notifications', authenticate, (req, res) => {
  try {
    const { limit = 50, offset = 0, is_read, type, priority } = req.query;
    const userId = req.user.id;

    let query = `
      SELECT * FROM notifications 
      WHERE user_id = ? AND is_deleted = 0
    `;
    const params = [userId];

    if (is_read !== undefined) {
      query += ` AND is_read = ?`;
      params.push(is_read === 'true' ? 1 : 0);
    }

    if (type) {
      query += ` AND type = ?`;
      params.push(type);
    }

    if (priority) {
      query += ` AND priority = ?`;
      params.push(priority);
    }

    query += ` ORDER BY created_at DESC LIMIT ? OFFSET ?`;
    params.push(parseInt(limit), parseInt(offset));

    const notifications = db.prepare(query).all(...params);
    res.json(notifications);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch notifications' });
  }
});

// GET /api/notifications/unread-count - Get unread notification count
app.get('/api/notifications/unread-count', authenticate, (req, res) => {
  try {
    const result = db.prepare(`
      SELECT COUNT(*) as count FROM notifications 
      WHERE user_id = ? AND is_read = 0 AND is_deleted = 0
    `).get(req.user.id);
    
    res.json({ count: result.count });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch count' });
  }
});

// GET /api/notifications/:id - Get single notification
app.get('/api/notifications/:id', authenticate, (req, res) => {
  try {
    const notification = db.prepare(`
      SELECT * FROM notifications 
      WHERE id = ? AND user_id = ?
    `).get(req.params.id, req.user.id);

    if (!notification) {
      return res.status(404).json({ error: 'Notification not found' });
    }

    res.json(notification);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch notification' });
  }
});

// PUT /api/notifications/:id/read - Mark notification as read
app.put('/api/notifications/:id/read', authenticate, (req, res) => {
  try {
    const result = db.prepare(`
      UPDATE notifications 
      SET is_read = 1, read_at = datetime('now')
      WHERE id = ? AND user_id = ?
    `).run(req.params.id, req.user.id);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Notification not found' });
    }

    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to mark as read' });
  }
});

// PUT /api/notifications/mark-all-read - Mark all notifications as read
app.put('/api/notifications/mark-all-read', authenticate, (req, res) => {
  try {
    db.prepare(`
      UPDATE notifications 
      SET is_read = 1, read_at = datetime('now')
      WHERE user_id = ? AND is_read = 0
    `).run(req.user.id);

    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to mark all as read' });
  }
});

// POST /api/notifications - Create new notification
app.post('/api/notifications', authenticate, authorize('admin', 'manager'), (req, res) => {
  try {
    const {
      user_id, title, message, type = 'info', category, priority = 'medium',
      entity_type, entity_id, action_url, action_label = 'View',
      icon = '🔔', color
    } = req.body;

    if (!user_id || !title || !message) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const id = 'NTF-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);

    db.prepare(`
      INSERT INTO notifications (
        id, user_id, title, message, type, category, priority,
        entity_type, entity_id, action_url, action_label, icon, color
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, user_id, title, message, type, category, priority,
      entity_type, entity_id, action_url, action_label, icon, color
    );

    res.json({ ok: true, id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create notification' });
  }
});

// DELETE /api/notifications/:id - Delete notification
app.delete('/api/notifications/:id', authenticate, (req, res) => {
  try {
    const result = db.prepare(`
      UPDATE notifications 
      SET is_deleted = 1
      WHERE id = ? AND user_id = ?
    `).run(req.params.id, req.user.id);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Notification not found' });
    }

    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete notification' });
  }
});

// GET /api/notifications/preferences - Get user's notification preferences
app.get('/api/notifications/preferences', authenticate, (req, res) => {
  try {
    let prefs = db.prepare(`
      SELECT * FROM notification_preferences WHERE user_id = ?
    `).get(req.user.id);

    // Create default preferences if not exists
    if (!prefs) {
      db.prepare(`
        INSERT INTO notification_preferences (user_id) VALUES (?)
      `).run(req.user.id);
      
      prefs = db.prepare(`
        SELECT * FROM notification_preferences WHERE user_id = ?
      `).get(req.user.id);
    }

    res.json(prefs);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch preferences' });
  }
});

// PUT /api/notifications/preferences - Update user's notification preferences
app.put('/api/notifications/preferences', authenticate, (req, res) => {
  try {
    const {
      email_enabled, email_tender_deadline, email_license_expiry,
      email_guarantee_expiry, email_task_due, email_document_share,
      email_mentions, inapp_enabled, digest_frequency,
      quiet_hours_start, quiet_hours_end
    } = req.body;

    db.prepare(`
      UPDATE notification_preferences
      SET email_enabled = ?,
          email_tender_deadline = ?,
          email_license_expiry = ?,
          email_guarantee_expiry = ?,
          email_task_due = ?,
          email_document_share = ?,
          email_mentions = ?,
          inapp_enabled = ?,
          digest_frequency = ?,
          quiet_hours_start = ?,
          quiet_hours_end = ?,
          updated_at = datetime('now')
      WHERE user_id = ?
    `).run(
      email_enabled, email_tender_deadline, email_license_expiry,
      email_guarantee_expiry, email_task_due, email_document_share,
      email_mentions, inapp_enabled, digest_frequency,
      quiet_hours_start, quiet_hours_end, req.user.id
    );

    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update preferences' });
  }
});

// ============================================
// DOCUMENT MANAGEMENT SYSTEM
// ============================================

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, 'DOC-' + uniqueSuffix + ext);
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 50 * 1024 * 1024 // 50MB limit
  },
  fileFilter: (req, file, cb) => {
    // Allowed file types
    const allowedTypes = /pdf|doc|docx|xls|xlsx|ppt|pptx|jpg|jpeg|png|gif|zip|rar|txt|csv/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (extname && mimetype) {
      return cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only documents, images, and archives are allowed.'));
    }
  }
});

// Upload document
app.post('/api/documents/upload', authenticate, authorize('admin', 'manager'), upload.single('file'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const {
      document_type, title, description, firm_id, tender_id, project_id,
      category, tags, document_date, reference_number, access_level
    } = req.body;

    if (!document_type || !title) {
      // Clean up uploaded file
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: 'Document type and title are required' });
    }

    const documentId = 'DOC-' + Date.now();
    
    run(`
      INSERT INTO documents (
        id, file_name, original_name, file_path, file_size, mime_type, file_extension,
        document_type, title, description, category, tags,
        firm_id, tender_id, project_id,
        document_date, reference_number, access_level,
        uploaded_by, uploaded_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `, [
      documentId,
      req.file.filename,
      req.file.originalname,
      req.file.path,
      req.file.size,
      req.file.mimetype,
      path.extname(req.file.originalname),
      document_type,
      title,
      description || null,
      category || null,
      tags || null,
      firm_id || null,
      tender_id || null,
      project_id || null,
      document_date || null,
      reference_number || null,
      access_level || 'internal',
      req.user.id
    ]);

    res.json({ 
      ok: true, 
      id: documentId,
      filename: req.file.filename,
      originalName: req.file.originalname,
      size: req.file.size
    });
  } catch (err) {
    console.error('Document upload error:', err);
    // Clean up file on error
    if (req.file) {
      try { fs.unlinkSync(req.file.path); } catch (e) {}
    }
    res.status(500).json({ error: 'Failed to upload document' });
  }
});

// Get documents list
app.get('/api/documents', authenticate, (req, res) => {
  try {
    const { 
      document_type, firm_id, tender_id, project_id, 
      status, search, limit = 50, offset = 0 
    } = req.query;

    let sql = `
      SELECT d.*, 
        f.name as firm_name,
        t.tender_id as tender_reference,
        p.project_name,
        u.username as uploaded_by_name
      FROM documents d
      LEFT JOIN firms f ON d.firm_id = f.id
      LEFT JOIN tenders t ON d.tender_id = t.id
      LEFT JOIN projects p ON d.project_id = p.id
      LEFT JOIN users u ON d.uploaded_by = u.id
      WHERE d.is_active = 1
    `;
    const params = [];

    if (document_type) {
      sql += ' AND d.document_type = ?';
      params.push(document_type);
    }
    if (firm_id) {
      sql += ' AND d.firm_id = ?';
      params.push(firm_id);
    }
    if (tender_id) {
      sql += ' AND d.tender_id = ?';
      params.push(tender_id);
    }
    if (project_id) {
      sql += ' AND d.project_id = ?';
      params.push(project_id);
    }
    if (status) {
      sql += ' AND d.status = ?';
      params.push(status);
    }
    if (search) {
      sql += ' AND (d.title LIKE ? OR d.description LIKE ? OR d.original_name LIKE ?)';
      const searchTerm = `%${search}%`;
      params.push(searchTerm, searchTerm, searchTerm);
    }

    sql += ' ORDER BY d.uploaded_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));

    const documents = rows(sql, params);
    
    res.json(documents);
  } catch (err) {
    console.error('Documents list error:', err);
    res.status(500).json({ error: 'Failed to load documents' });
  }
});

// Get all document tags (MUST be before /api/documents/:id to avoid route conflict)
app.get('/api/documents/tags', authenticate, (req, res) => {
  try {
    const tags = rows(`
      SELECT * FROM document_tags
      ORDER BY usage_count DESC, tag_name ASC
    `);
    
    res.json({ success: true, data: tags });
  } catch (err) {
    logger.error('Error fetching tags:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch tags' });
  }
});

// Create document tag
app.post('/api/documents/tags', authenticate, (req, res) => {
  try {
    const { tag_name, tag_color, description } = req.body;
    
    if (!tag_name || tag_name.trim().length === 0) {
      return res.status(400).json({ success: false, error: 'Tag name is required' });
    }
    
    const result = run(`
      INSERT INTO document_tags (tag_name, tag_color, description, created_by)
      VALUES (?, ?, ?, ?)
    `, [tag_name.trim(), tag_color || '#3B82F6', description || null, req.user.id]);
    
    const tag = row('SELECT * FROM document_tags WHERE id = ?', [result.lastInsertRowid]);
    
    res.json({ success: true, data: tag });
  } catch (err) {
    if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return res.status(409).json({ success: false, error: 'Tag already exists' });
    }
    logger.error('Error creating tag:', err);
    res.status(500).json({ success: false, error: 'Failed to create tag' });
  }
});

// Get single document details
app.get('/api/documents/:id', authenticate, (req, res) => {
  try {
    const document = row(`
      SELECT d.*, 
        f.name as firm_name,
        t.tender_id as tender_reference,
        p.project_name,
        u.username as uploaded_by_name
      FROM documents d
      LEFT JOIN firms f ON d.firm_id = f.id
      LEFT JOIN tenders t ON d.tender_id = t.id
      LEFT JOIN projects p ON d.project_id = p.id
      LEFT JOIN users u ON d.uploaded_by = u.id
      WHERE d.id = ?
    `, [req.params.id]);

    if (!document) {
      return res.status(404).json({ error: 'Document not found' });
    }

    res.json(document);
  } catch (err) {
    console.error('Document detail error:', err);
    res.status(500).json({ error: 'Failed to load document' });
  }
});

// Download document
app.get('/api/documents/:id/download', authenticate, (req, res) => {
  try {
    const document = row('SELECT * FROM documents WHERE id = ?', [req.params.id]);
    
    if (!document) {
      return res.status(404).json({ error: 'Document not found' });
    }

    // Update download count
    run(`
      UPDATE documents 
      SET downloaded_count = downloaded_count + 1,
          last_downloaded_at = datetime('now')
      WHERE id = ?
    `, [req.params.id]);

    // Send file
    res.download(document.file_path, document.original_name);
  } catch (err) {
    console.error('Document download error:', err);
    res.status(500).json({ error: 'Failed to download document' });
  }
});

// Update document
app.put('/api/documents/:id', authenticate, authorize('admin', 'manager'), (req, res) => {
  try {
    const {
      title, description, category, tags, document_date,
      reference_number, access_level, status
    } = req.body;

    run(`
      UPDATE documents 
      SET title = ?, description = ?, category = ?, tags = ?,
          document_date = ?, reference_number = ?, access_level = ?,
          status = ?, modified_by = ?, modified_at = datetime('now')
      WHERE id = ?
    `, [
      title, description, category, tags, document_date,
      reference_number, access_level, status,
      req.user.id, req.params.id
    ]);

    res.json({ ok: true });
  } catch (err) {
    console.error('Document update error:', err);
    res.status(500).json({ error: 'Failed to update document' });
  }
});

// Delete document
app.delete('/api/documents/:id', authenticate, authorize('admin'), (req, res) => {
  try {
    const document = row('SELECT * FROM documents WHERE id = ?', [req.params.id]);
    
    if (!document) {
      return res.status(404).json({ error: 'Document not found' });
    }

    // Soft delete
    run('UPDATE documents SET is_active = 0, status = ? WHERE id = ?', ['deleted', req.params.id]);

    // Optionally delete physical file
    // fs.unlinkSync(document.file_path);

    res.json({ ok: true });
  } catch (err) {
    console.error('Document delete error:', err);
    res.status(500).json({ error: 'Failed to delete document' });
  }
});

// Get document folders
app.get('/api/documents/folders', authenticate, (req, res) => {
  try {
    const folders = rows(`
      SELECT * FROM document_folders 
      WHERE is_active = 1 
      ORDER BY path
    `);
    
    res.json(folders);
  } catch (err) {
    console.error('Folders list error:', err);
    res.status(500).json({ error: 'Failed to load folders' });
  }
});

// Get document statistics
app.get('/api/documents/stats', authenticate, (req, res) => {
  try {
    const stats = {
      total: row('SELECT COUNT(*) as count FROM documents WHERE is_active = 1').count,
      byType: rows(`
        SELECT document_type, COUNT(*) as count 
        FROM documents 
        WHERE is_active = 1 
        GROUP BY document_type 
        ORDER BY count DESC
      `),
      totalSize: row('SELECT SUM(file_size) as total FROM documents WHERE is_active = 1').total || 0,
      recentUploads: rows(`
        SELECT * FROM documents 
        WHERE is_active = 1 
        ORDER BY uploaded_at DESC 
        LIMIT 5
      `)
    };

    res.json(stats);
  } catch (err) {
    console.error('Document stats error:', err);
    res.status(500).json({ error: 'Failed to load statistics' });
  }
});

// ============================================
// HEALTH CHECK & MONITORING
// ============================================
// ANALYTICS & REPORTING
// ============================================

// Get analytics export (Excel)
app.get('/api/analytics/export', authenticate, async (req, res) => {
  try {
    const XLSX = require('xlsx');
    
    // Get all competitors with stats
    const competitors = rows(`
      SELECT 
        c.*,
        COUNT(DISTINCT cth.id) as total_participations,
        SUM(CASE WHEN cth.action = 'won' THEN 1 ELSE 0 END) as total_wins,
        SUM(CASE WHEN cth.action = 'lost' THEN 1 ELSE 0 END) as total_losses,
        AVG(cth.quoted_amount) as avg_bid_amount,
        AVG(cth.total_score) as avg_score
      FROM competitors c
      LEFT JOIN competitor_tender_history cth ON c.id = cth.competitor_id
      GROUP BY c.id
      ORDER BY total_wins DESC, total_participations DESC
    `);

    // Get participation history
    const history = rows(`
      SELECT 
        cth.*,
        c.name as competitor_name,
        t.tender_id as tender_reference,
        t.procuring_entity,
        a.name as agency_name
      FROM competitor_tender_history cth
      LEFT JOIN competitors c ON cth.competitor_id = c.id
      LEFT JOIN tenders t ON cth.tender_id = t.id
      LEFT JOIN agencies a ON t.agency_id = a.code
      ORDER BY cth.action_date DESC
      LIMIT 1000
    `);

    // Create workbook
    const wb = XLSX.utils.book_new();

    // Sheet 1: Competitors Summary
    const competitorsSheet = XLSX.utils.json_to_sheet(competitors.map(c => ({
      'ID': c.id,
      'Name': c.name,
      'Registration No': c.registration_no,
      'Type': c.company_type,
      'Rating': c.rating,
      'Reliability Score': c.reliability_score,
      'Total Participations': c.total_participations || 0,
      'Wins': c.total_wins || 0,
      'Losses': c.total_losses || 0,
      'Win Rate (%)': c.total_participations > 0 
        ? ((c.total_wins / c.total_participations) * 100).toFixed(2)
        : 0,
      'Avg Bid Amount': c.avg_bid_amount ? '৳ ' + c.avg_bid_amount.toFixed(2) : 'N/A',
      'Avg Score': c.avg_score ? c.avg_score.toFixed(2) : 'N/A',
      'Active': c.is_active ? 'Yes' : 'No',
      'Blacklisted': c.is_blacklisted ? 'Yes' : 'No'
    })));
    XLSX.utils.book_append_sheet(wb, competitorsSheet, 'Competitors');

    // Sheet 2: Participation History
    const historySheet = XLSX.utils.json_to_sheet(history.map(h => ({
      'Date': h.action_date,
      'Competitor': h.competitor_name,
      'Tender': h.tender_reference,
      'Agency': h.agency_name || 'N/A',
      'Action': h.action,
      'Quoted Amount': h.quoted_amount ? '৳ ' + h.quoted_amount.toLocaleString() : 'N/A',
      'Position': h.bid_position || 'N/A',
      'Technical Score': h.technical_score || 'N/A',
      'Financial Score': h.financial_score || 'N/A',
      'Total Score': h.total_score || 'N/A',
      'Notes': h.notes || ''
    })));
    XLSX.utils.book_append_sheet(wb, historySheet, 'Participation History');

    // Sheet 3: KPIs
    const kpis = {
      'Total Competitors': competitors.length,
      'Active Competitors': competitors.filter(c => c.is_active).length,
      'Total Participations': competitors.reduce((sum, c) => sum + (c.total_participations || 0), 0),
      'Total Wins': competitors.reduce((sum, c) => sum + (c.total_wins || 0), 0),
      'Average Win Rate': competitors.length > 0 
        ? (competitors.reduce((sum, c) => {
            const winRate = c.total_participations > 0 ? (c.total_wins / c.total_participations) * 100 : 0;
            return sum + winRate;
          }, 0) / competitors.length).toFixed(2) + '%'
        : '0%',
      'Average Rating': competitors.length > 0
        ? (competitors.reduce((sum, c) => sum + (c.rating || 0), 0) / competitors.length).toFixed(2)
        : '0'
    };
    const kpiSheet = XLSX.utils.json_to_sheet([kpis]);
    XLSX.utils.book_append_sheet(wb, kpiSheet, 'KPIs');

    // Generate Excel file
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    // Send file
    res.setHeader('Content-Disposition', `attachment; filename=analytics-${new Date().toISOString().split('T')[0]}.xlsx`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buffer);

  } catch (err) {
    console.error('Analytics export error:', err);
    res.status(500).json({ error: 'Failed to generate export' });
  }
});

// Get dashboard analytics data
app.get('/api/analytics/dashboard', authenticate, (req, res) => {
  try {
    // KPIs
    const competitors = rows('SELECT * FROM competitors');
    const totalParticipations = row(`
      SELECT COUNT(*) as count FROM competitor_tender_history
    `);
    const totalWins = row(`
      SELECT COUNT(*) as count FROM competitor_tender_history WHERE action = 'won'
    `);

    // Win rate trend (last 12 months)
    const trendData = rows(`
      SELECT 
        strftime('%Y-%m', action_date) as month,
        COUNT(*) as participations,
        SUM(CASE WHEN action = 'won' THEN 1 ELSE 0 END) as wins
      FROM competitor_tender_history
      WHERE action_date >= date('now', '-12 months')
      GROUP BY month
      ORDER BY month
    `);

    // Performance by agency
    const agencyData = rows(`
      SELECT 
        a.name as agency,
        COUNT(cth.id) as participations,
        SUM(CASE WHEN cth.action = 'won' THEN 1 ELSE 0 END) as wins
      FROM competitor_tender_history cth
      LEFT JOIN tenders t ON cth.tender_id = t.id
      LEFT JOIN agencies a ON t.agency_id = a.code
      WHERE a.name IS NOT NULL
      GROUP BY a.name
      ORDER BY participations DESC
      LIMIT 10
    `);

    // Performance by method
    const methodData = rows(`
      SELECT 
        pm.name as method,
        COUNT(cth.id) as participations,
        SUM(CASE WHEN cth.action = 'won' THEN 1 ELSE 0 END) as wins
      FROM competitor_tender_history cth
      LEFT JOIN tenders t ON cth.tender_id = t.id
      LEFT JOIN procurement_methods pm ON t.procurement_method = pm.code
      WHERE pm.name IS NOT NULL
      GROUP BY pm.name
      ORDER BY participations DESC
    `);

    res.json({
      kpis: {
        totalCompetitors: competitors.length,
        activeCompetitors: competitors.filter(c => c.is_active).length,
        totalParticipations: totalParticipations.count,
        totalWins: totalWins.count,
        avgWinRate: totalParticipations.count > 0 
          ? ((totalWins.count / totalParticipations.count) * 100).toFixed(1)
          : 0,
        avgRating: competitors.length > 0
          ? (competitors.reduce((sum, c) => sum + (c.rating || 0), 0) / competitors.length).toFixed(1)
          : 0
      },
      trends: trendData,
      agencies: agencyData,
      methods: methodData
    });

  } catch (err) {
    console.error('Analytics dashboard error:', err);
    res.status(500).json({ error: 'Failed to load analytics' });
  }
});

// ============================================

// Health check endpoint
app.get('/health', (req, res) => {
  try {
    // Check database connection
    const result = row('SELECT 1 as ok');
    
    // Get system info
    const uptime = process.uptime();
    const memory = process.memoryUsage();
    
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: Math.floor(uptime),
      memory: {
        rss: Math.round(memory.rss / 1024 / 1024) + 'MB',
        heapUsed: Math.round(memory.heapUsed / 1024 / 1024) + 'MB',
        heapTotal: Math.round(memory.heapTotal / 1024 / 1024) + 'MB'
      },
      database: result ? 'connected' : 'error',
      version: '3.0.0'
    });
  } catch (err) {
    res.status(503).json({
      status: 'unhealthy',
      error: 'Database connection failed',
      timestamp: new Date().toISOString()
    });
  }
});

// ============================================
// PHASE 7C: DOCUMENT PREVIEW & MANAGEMENT SYSTEM
// ============================================

// Get document versions
app.get('/api/documents/:id/versions', authenticate, (req, res) => {
  try {
    const { id } = req.params;
    
    const versions = rows(`
      SELECT 
        dv.*,
        u.username as created_by_username
      FROM document_versions dv
      LEFT JOIN users u ON u.id = dv.created_by
      WHERE dv.document_id = ?
      ORDER BY dv.created_at DESC
    `, [id]);
    
    res.json({ success: true, data: versions });
  } catch (err) {
    logger.error('Error fetching document versions:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch versions' });
  }
});

// Create new document version
app.post('/api/documents/:id/versions', authenticate, upload.single('file'), (req, res) => {
  try {
    const { id } = req.params;
    const { version_number, change_description } = req.body;
    
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'File is required' });
    }
    
    const document = row('SELECT * FROM documents WHERE id = ?', [id]);
    if (!document) {
      return res.status(404).json({ success: false, error: 'Document not found' });
    }
    
    // Mark previous version as not current
    run('UPDATE document_versions SET is_current = 0 WHERE document_id = ?', [id]);
    
    // Create new version
    const result = run(`
      INSERT INTO document_versions (
        document_id, version_number, file_name, file_path,
        file_size, mime_type, checksum, change_description,
        created_by, is_current
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
    `, [
      id, version_number, req.file.filename, req.file.path,
      req.file.size, req.file.mimetype, '', change_description || '',
      req.user.id
    ]);
    
    // Update main document record
    run(`
      UPDATE documents 
      SET version = ?, file_name = ?, file_path = ?, 
          file_size = ?, mime_type = ?, modified_by = ?, modified_at = datetime('now')
      WHERE id = ?
    `, [version_number, req.file.filename, req.file.path, req.file.size, req.file.mimetype, req.user.id, id]);
    
    // Log access
    run(`
      INSERT INTO document_access_logs (document_id, user_id, action, ip_address)
      VALUES (?, ?, 'edit', ?)
    `, [id, req.user.id, req.ip]);
    
    res.json({ success: true, data: { id: result.lastInsertRowid } });
  } catch (err) {
    logger.error('Error creating document version:', err);
    res.status(500).json({ success: false, error: 'Failed to create version' });
  }
});

// Get document preview metadata
app.get('/api/documents/:id/preview', authenticate, (req, res) => {
  try {
    const { id } = req.params;
    
    let preview = row('SELECT * FROM document_preview_metadata WHERE document_id = ?', [id]);
    
    // Create metadata if it doesn't exist
    if (!preview) {
      run('INSERT INTO document_preview_metadata (document_id, has_preview) VALUES (?, 0)', [id]);
      preview = row('SELECT * FROM document_preview_metadata WHERE document_id = ?', [id]);
    }
    
    res.json({ success: true, data: preview });
  } catch (err) {
    logger.error('Error fetching preview metadata:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch preview' });
  }
});

// Generate document preview (placeholder - would integrate with actual preview generation)
app.post('/api/documents/:id/preview/generate', authenticate, (req, res) => {
  try {
    const { id } = req.params;
    
    const document = row('SELECT * FROM documents WHERE id = ?', [id]);
    if (!document) {
      return res.status(404).json({ success: false, error: 'Document not found' });
    }
    
    // Update preview metadata (actual preview generation would happen here)
    run(`
      UPDATE document_preview_metadata
      SET preview_generated_at = datetime('now'),
          last_preview_attempt = datetime('now'),
          has_preview = 0,
          preview_error = 'Preview generation not implemented'
      WHERE document_id = ?
    `, [id]);
    
    res.json({ 
      success: true, 
      message: 'Preview generation queued',
      data: { status: 'pending' }
    });
  } catch (err) {
    logger.error('Error generating preview:', err);
    res.status(500).json({ success: false, error: 'Failed to generate preview' });
  }
});

// Share document
app.post('/api/documents/:id/share', authenticate, (req, res) => {
  try {
    const { id } = req.params;
    const { 
      shared_with_email, 
      shared_with_user_id, 
      access_type = 'view',
      expires_at,
      password,
      max_downloads
    } = req.body;
    
    const document = row('SELECT * FROM documents WHERE id = ?', [id]);
    if (!document) {
      return res.status(404).json({ success: false, error: 'Document not found' });
    }
    
    // Generate unique share token
    const share_token = require('crypto').randomBytes(32).toString('hex');
    
    // Hash password if provided
    let password_hash = null;
    if (password) {
      const bcrypt = require('bcrypt');
      password_hash = bcrypt.hashSync(password, 10);
    }
    
    const result = run(`
      INSERT INTO document_shares (
        document_id, share_token, shared_by, shared_with_email,
        shared_with_user_id, access_type, expires_at, password_hash, max_downloads
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      id, share_token, req.user.id, shared_with_email || null,
      shared_with_user_id || null, access_type, expires_at || null,
      password_hash, max_downloads || null
    ]);
    
    // Log access
    run(`
      INSERT INTO document_access_logs (document_id, user_id, action, ip_address)
      VALUES (?, ?, 'share', ?)
    `, [id, req.user.id, req.ip]);
    
    res.json({ 
      success: true, 
      data: { 
        id: result.lastInsertRowid,
        share_token,
        share_url: `${req.protocol}://${req.get('host')}/shared/${share_token}`
      }
    });
  } catch (err) {
    logger.error('Error sharing document:', err);
    res.status(500).json({ success: false, error: 'Failed to share document' });
  }
});

// Get document shares
app.get('/api/documents/:id/shares', authenticate, (req, res) => {
  try {
    const { id } = req.params;
    
    const shares = rows(`
      SELECT 
        ds.*,
        u.username as shared_by_username
      FROM document_shares ds
      LEFT JOIN users u ON u.id = ds.shared_by
      WHERE ds.document_id = ? AND ds.is_active = 1
      ORDER BY ds.created_at DESC
    `, [id]);
    
    res.json({ success: true, data: shares });
  } catch (err) {
    logger.error('Error fetching shares:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch shares' });
  }
});

// Revoke document share
app.delete('/api/documents/shares/:shareId', authenticate, (req, res) => {
  try {
    const { shareId } = req.params;
    
    const share = row('SELECT * FROM document_shares WHERE id = ?', [shareId]);
    if (!share) {
      return res.status(404).json({ success: false, error: 'Share not found' });
    }
    
    // Check permission
    if (share.shared_by !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, error: 'Not authorized' });
    }
    
    run('UPDATE document_shares SET is_active = 0 WHERE id = ?', [shareId]);
    
    res.json({ success: true, message: 'Share revoked' });
  } catch (err) {
    logger.error('Error revoking share:', err);
    res.status(500).json({ success: false, error: 'Failed to revoke share' });
  }
});

// Add document comment
app.post('/api/documents/:id/comments', authenticate, (req, res) => {
  try {
    const { id } = req.params;
    const { comment_text, parent_comment_id, page_number, annotation_data } = req.body;
    
    if (!comment_text || comment_text.trim().length === 0) {
      return res.status(400).json({ success: false, error: 'Comment text is required' });
    }
    
    const result = run(`
      INSERT INTO document_comments (
        document_id, user_id, comment_text, parent_comment_id,
        page_number, annotation_data
      ) VALUES (?, ?, ?, ?, ?, ?)
    `, [id, req.user.id, comment_text.trim(), parent_comment_id || null, page_number || null, annotation_data || null]);
    
    const comment = row('SELECT * FROM document_comments WHERE id = ?', [result.lastInsertRowid]);
    
    res.json({ success: true, data: comment });
  } catch (err) {
    logger.error('Error adding comment:', err);
    res.status(500).json({ success: false, error: 'Failed to add comment' });
  }
});

// Get document comments
app.get('/api/documents/:id/comments', authenticate, (req, res) => {
  try {
    const { id } = req.params;
    const { page_number } = req.query;
    
    let query = `
      SELECT 
        dc.*,
        u.username as user_username,
        u.full_name as user_full_name
      FROM document_comments dc
      LEFT JOIN users u ON u.id = dc.user_id
      WHERE dc.document_id = ?
    `;
    
    const params = [id];
    
    if (page_number) {
      query += ' AND dc.page_number = ?';
      params.push(parseInt(page_number));
    }
    
    query += ' ORDER BY dc.created_at DESC';
    
    const comments = rows(query, params);
    
    res.json({ success: true, data: comments });
  } catch (err) {
    logger.error('Error fetching comments:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch comments' });
  }
});

// Resolve comment
app.put('/api/documents/comments/:commentId/resolve', authenticate, (req, res) => {
  try {
    const { commentId } = req.params;
    const { is_resolved } = req.body;
    
    run(`
      UPDATE document_comments
      SET is_resolved = ?,
          resolved_by = ?,
          resolved_at = CASE WHEN ? = 1 THEN datetime('now') ELSE NULL END
      WHERE id = ?
    `, [is_resolved ? 1 : 0, is_resolved ? req.user.id : null, is_resolved ? 1 : 0, commentId]);
    
    res.json({ success: true, message: 'Comment updated' });
  } catch (err) {
    logger.error('Error resolving comment:', err);
    res.status(500).json({ success: false, error: 'Failed to resolve comment' });
  }
});

// Get document access logs
app.get('/api/documents/:id/access-logs', authenticate, authorize('admin', 'manager'), (req, res) => {
  try {
    const { id } = req.params;
    const { limit = 50, offset = 0 } = req.query;
    
    const logs = rows(`
      SELECT 
        dal.*,
        u.username as user_username
      FROM document_access_logs dal
      LEFT JOIN users u ON u.id = dal.user_id
      WHERE dal.document_id = ?
      ORDER BY dal.created_at DESC
      LIMIT ? OFFSET ?
    `, [id, parseInt(limit), parseInt(offset)]);
    
    const total = row('SELECT COUNT(*) as count FROM document_access_logs WHERE document_id = ?', [id])?.count || 0;
    
    res.json({ 
      success: true, 
      data: logs,
      pagination: { total, limit: parseInt(limit), offset: parseInt(offset) }
    });
  } catch (err) {
    logger.error('Error fetching access logs:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch logs' });
  }
});

// Tag document
app.post('/api/documents/:id/tags', authenticate, (req, res) => {
  try {
    const { id } = req.params;
    const { tag_id } = req.body;
    
    if (!tag_id) {
      return res.status(400).json({ success: false, error: 'Tag ID is required' });
    }
    
    const result = run(`
      INSERT INTO document_tag_mappings (document_id, tag_id, tagged_by)
      VALUES (?, ?, ?)
    `, [id, tag_id, req.user.id]);
    
    // Update tag usage count
    run('UPDATE document_tags SET usage_count = usage_count + 1 WHERE id = ?', [tag_id]);
    
    res.json({ success: true, data: { id: result.lastInsertRowid } });
  } catch (err) {
    if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return res.status(409).json({ success: false, error: 'Document already has this tag' });
    }
    logger.error('Error tagging document:', err);
    res.status(500).json({ success: false, error: 'Failed to tag document' });
  }
});

// Get document tags
app.get('/api/documents/:id/tags', authenticate, (req, res) => {
  try {
    const { id } = req.params;
    
    const tags = rows(`
      SELECT 
        dt.*,
        dtm.tagged_at,
        u.username as tagged_by_username
      FROM document_tag_mappings dtm
      JOIN document_tags dt ON dt.id = dtm.tag_id
      LEFT JOIN users u ON u.id = dtm.tagged_by
      WHERE dtm.document_id = ?
      ORDER BY dtm.tagged_at DESC
    `, [id]);
    
    res.json({ success: true, data: tags });
  } catch (err) {
    logger.error('Error fetching document tags:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch tags' });
  }
});

// Remove tag from document
app.delete('/api/documents/:id/tags/:tagId', authenticate, (req, res) => {
  try {
    const { id, tagId } = req.params;
    
    const result = run('DELETE FROM document_tag_mappings WHERE document_id = ? AND tag_id = ?', [id, tagId]);
    
    if (result.changes === 0) {
      return res.status(404).json({ success: false, error: 'Tag mapping not found' });
    }
    
    // Update tag usage count
    run('UPDATE document_tags SET usage_count = usage_count - 1 WHERE id = ? AND usage_count > 0', [tagId]);
    
    res.json({ success: true, message: 'Tag removed' });
  } catch (err) {
    logger.error('Error removing tag:', err);
    res.status(500).json({ success: false, error: 'Failed to remove tag' });
  }
});

// ============================================
// PHASE 7D: ANALYTICS & REPORTING DASHBOARD
// ============================================

// Get user dashboards
app.get('/api/analytics/dashboards', authenticate, (req, res) => {
  try {
    const dashboards = rows(`
      SELECT 
        dc.*,
        (SELECT COUNT(*) FROM dashboard_widgets WHERE dashboard_id = dc.id) as widget_count
      FROM dashboard_configs dc
      WHERE dc.user_id = ? OR dc.is_shared = 1
      ORDER BY dc.is_default DESC, dc.created_at DESC
    `, [req.user.id]);
    
    res.json({ success: true, data: dashboards });
  } catch (err) {
    logger.error('Error fetching dashboards:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch dashboards' });
  }
});

// Get single dashboard with widgets
app.get('/api/analytics/dashboards/:id', authenticate, (req, res) => {
  try {
    const { id } = req.params;
    
    const dashboard = row(`
      SELECT * FROM dashboard_configs 
      WHERE id = ? AND (user_id = ? OR is_shared = 1)
    `, [id, req.user.id]);
    
    if (!dashboard) {
      return res.status(404).json({ success: false, error: 'Dashboard not found' });
    }
    
    const widgets = rows(`
      SELECT * FROM dashboard_widgets 
      WHERE dashboard_id = ? AND is_visible = 1
      ORDER BY position_y, position_x
    `, [id]);
    
    res.json({ success: true, data: { ...dashboard, widgets } });
  } catch (err) {
    logger.error('Error fetching dashboard:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch dashboard' });
  }
});

// Create dashboard
app.post('/api/analytics/dashboards', authenticate, (req, res) => {
  try {
    const { dashboard_name, description, is_shared, layout_config } = req.body;
    
    if (!dashboard_name || !layout_config) {
      return res.status(400).json({ 
        success: false, 
        error: 'Dashboard name and layout config are required' 
      });
    }
    
    const result = run(`
      INSERT INTO dashboard_configs (
        user_id, dashboard_name, description, is_shared, layout_config
      ) VALUES (?, ?, ?, ?, ?)
    `, [req.user.id, dashboard_name, description || null, is_shared ? 1 : 0, layout_config]);
    
    res.json({ success: true, data: { id: result.lastInsertRowid } });
  } catch (err) {
    logger.error('Error creating dashboard:', err);
    res.status(500).json({ success: false, error: 'Failed to create dashboard' });
  }
});

// Update dashboard
app.put('/api/analytics/dashboards/:id', authenticate, (req, res) => {
  try {
    const { id } = req.params;
    const { dashboard_name, description, is_shared, layout_config, is_default } = req.body;
    
    const dashboard = row('SELECT * FROM dashboard_configs WHERE id = ? AND user_id = ?', [id, req.user.id]);
    if (!dashboard) {
      return res.status(404).json({ success: false, error: 'Dashboard not found' });
    }
    
    // If setting as default, unset other defaults
    if (is_default) {
      run('UPDATE dashboard_configs SET is_default = 0 WHERE user_id = ?', [req.user.id]);
    }
    
    // Build dynamic update query
    const updates = [];
    const values = [];
    
    if (dashboard_name !== undefined) {
      updates.push('dashboard_name = ?');
      values.push(dashboard_name);
    }
    if (description !== undefined) {
      updates.push('description = ?');
      values.push(description);
    }
    if (is_shared !== undefined) {
      updates.push('is_shared = ?');
      values.push(is_shared ? 1 : 0);
    }
    if (layout_config !== undefined) {
      updates.push('layout_config = ?');
      values.push(layout_config);
    }
    if (is_default !== undefined) {
      updates.push('is_default = ?');
      values.push(is_default ? 1 : 0);
    }
    
    if (updates.length > 0) {
      updates.push('updated_at = datetime(\'now\')');
      values.push(id);
      run(`UPDATE dashboard_configs SET ${updates.join(', ')} WHERE id = ?`, values);
    }
    
    res.json({ success: true, message: 'Dashboard updated' });
  } catch (err) {
    logger.error('Error updating dashboard:', err);
    res.status(500).json({ success: false, error: 'Failed to update dashboard' });
  }
});

// Delete dashboard
app.delete('/api/analytics/dashboards/:id', authenticate, (req, res) => {
  try {
    const { id } = req.params;
    
    const dashboard = row('SELECT * FROM dashboard_configs WHERE id = ? AND user_id = ?', [id, req.user.id]);
    if (!dashboard) {
      return res.status(404).json({ success: false, error: 'Dashboard not found' });
    }
    
    run('DELETE FROM dashboard_configs WHERE id = ?', [id]);
    
    res.json({ success: true, message: 'Dashboard deleted' });
  } catch (err) {
    logger.error('Error deleting dashboard:', err);
    res.status(500).json({ success: false, error: 'Failed to delete dashboard' });
  }
});

// Add widget to dashboard
app.post('/api/analytics/dashboards/:id/widgets', authenticate, (req, res) => {
  try {
    const { id } = req.params;
    const { widget_type, widget_title, widget_config, data_source, position_x, position_y, width, height } = req.body;
    
    const dashboard = row('SELECT * FROM dashboard_configs WHERE id = ? AND user_id = ?', [id, req.user.id]);
    if (!dashboard) {
      return res.status(404).json({ success: false, error: 'Dashboard not found' });
    }
    
    const result = run(`
      INSERT INTO dashboard_widgets (
        dashboard_id, widget_type, widget_title, widget_config, data_source,
        position_x, position_y, width, height
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [id, widget_type, widget_title, widget_config, data_source, position_x || 0, position_y || 0, width || 4, height || 3]);
    
    res.json({ success: true, data: { id: result.lastInsertRowid } });
  } catch (err) {
    logger.error('Error adding widget:', err);
    res.status(500).json({ success: false, error: 'Failed to add widget' });
  }
});

// Update widget
app.put('/api/analytics/widgets/:widgetId', authenticate, (req, res) => {
  try {
    const { widgetId } = req.params;
    const updates = req.body;
    
    const widget = row(`
      SELECT dw.* FROM dashboard_widgets dw
      JOIN dashboard_configs dc ON dc.id = dw.dashboard_id
      WHERE dw.id = ? AND dc.user_id = ?
    `, [widgetId, req.user.id]);
    
    if (!widget) {
      return res.status(404).json({ success: false, error: 'Widget not found' });
    }
    
    const fields = [];
    const values = [];
    
    ['widget_title', 'widget_config', 'position_x', 'position_y', 'width', 'height', 'is_visible'].forEach(field => {
      if (updates[field] !== undefined) {
        fields.push(`${field} = ?`);
        values.push(updates[field]);
      }
    });
    
    if (fields.length > 0) {
      values.push(widgetId);
      run(`UPDATE dashboard_widgets SET ${fields.join(', ')}, updated_at = datetime('now') WHERE id = ?`, values);
    }
    
    res.json({ success: true, message: 'Widget updated' });
  } catch (err) {
    logger.error('Error updating widget:', err);
    res.status(500).json({ success: false, error: 'Failed to update widget' });
  }
});

// Delete widget
app.delete('/api/analytics/widgets/:widgetId', authenticate, (req, res) => {
  try {
    const { widgetId } = req.params;
    
    const widget = row(`
      SELECT dw.* FROM dashboard_widgets dw
      JOIN dashboard_configs dc ON dc.id = dw.dashboard_id
      WHERE dw.id = ? AND dc.user_id = ?
    `, [widgetId, req.user.id]);
    
    if (!widget) {
      return res.status(404).json({ success: false, error: 'Widget not found' });
    }
    
    run('DELETE FROM dashboard_widgets WHERE id = ?', [widgetId]);
    
    res.json({ success: true, message: 'Widget deleted' });
  } catch (err) {
    logger.error('Error deleting widget:', err);
    res.status(500).json({ success: false, error: 'Failed to delete widget' });
  }
});

// Get widget data
app.get('/api/analytics/widgets/:widgetId/data', authenticate, (req, res) => {
  try {
    const { widgetId } = req.params;
    
    const widget = row(`
      SELECT dw.*, dc.user_id FROM dashboard_widgets dw
      JOIN dashboard_configs dc ON dc.id = dw.dashboard_id
      WHERE dw.id = ? AND (dc.user_id = ? OR dc.is_shared = 1)
    `, [widgetId, req.user.id]);
    
    if (!widget) {
      return res.status(404).json({ success: false, error: 'Widget not found' });
    }
    
    // Generate data based on widget configuration
    let data = {};
    const config = JSON.parse(widget.widget_config);
    
    switch (widget.data_source) {
      case 'tenders':
        if (widget.widget_type === 'stat_card') {
          const count = row('SELECT COUNT(*) as count FROM tenders')?.count || 0;
          data = { value: count, label: 'Total Tenders', trend: '+5%' };
        } else if (widget.widget_type === 'chart_line') {
          const monthlyData = rows(`
            SELECT strftime('%Y-%m', opening_date) as month, COUNT(*) as count
            FROM tenders
            WHERE opening_date >= date('now', '-6 months')
            GROUP BY month
            ORDER BY month
          `);
          data = { labels: monthlyData.map(d => d.month), values: monthlyData.map(d => d.count) };
        } else if (widget.widget_type === 'chart_pie') {
          const methodData = rows(`
            SELECT method, COUNT(*) as count
            FROM tenders
            GROUP BY method
          `);
          data = { labels: methodData.map(d => d.method), values: methodData.map(d => d.count) };
        }
        break;
        
      case 'projects':
        if (widget.widget_type === 'stat_card') {
          const count = row("SELECT COUNT(*) as count FROM projects WHERE status = 'active'")?.count || 0;
          data = { value: count, label: 'Active Projects', trend: '+2' };
        }
        break;
        
      case 'competitions':
        if (widget.widget_type === 'stat_card') {
          data = { value: '75%', label: 'Win Rate', trend: '+3%' };
        }
        break;
        
      default:
        data = { message: 'Data source not implemented' };
    }
    
    res.json({ success: true, data, widget: { type: widget.widget_type, title: widget.widget_title } });
  } catch (err) {
    logger.error('Error fetching widget data:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch widget data' });
  }
});

// Get report templates
app.get('/api/analytics/report-templates', authenticate, (req, res) => {
  try {
    const { category } = req.query;
    
    let query = 'SELECT * FROM report_templates WHERE 1=1';
    const params = [];
    
    if (category) {
      query += ' AND category = ?';
      params.push(category);
    }
    
    query += ' ORDER BY category, template_name';
    
    const templates = rows(query, params);
    
    res.json({ success: true, data: templates });
  } catch (err) {
    logger.error('Error fetching templates:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch templates' });
  }
});

// Create report template
app.post('/api/analytics/report-templates', authenticate, authorize('admin', 'manager'), (req, res) => {
  try {
    const { template_name, description, category, report_type, query_config, filters, columns } = req.body;
    
    if (!template_name || !category || !report_type || !query_config) {
      return res.status(400).json({ 
        success: false, 
        error: 'Required fields: template_name, category, report_type, query_config' 
      });
    }
    
    const result = run(`
      INSERT INTO report_templates (
        template_name, description, category, report_type,
        query_config, filters, columns, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [template_name, description, category, report_type, query_config, filters, columns, req.user.id]);
    
    res.json({ success: true, data: { id: result.lastInsertRowid } });
  } catch (err) {
    if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return res.status(409).json({ success: false, error: 'Template name already exists' });
    }
    logger.error('Error creating template:', err);
    res.status(500).json({ success: false, error: 'Failed to create template' });
  }
});

// Generate report
app.post('/api/analytics/reports/generate', authenticate, (req, res) => {
  try {
    const { template_id, report_name, parameters, output_format = 'pdf' } = req.body;
    
    if (!template_id || !report_name) {
      return res.status(400).json({ 
        success: false, 
        error: 'Template ID and report name are required' 
      });
    }
    
    const template = row('SELECT * FROM report_templates WHERE id = ?', [template_id]);
    if (!template) {
      return res.status(404).json({ success: false, error: 'Template not found' });
    }
    
    const startTime = Date.now();
    
    // Create report record
    const result = run(`
      INSERT INTO generated_reports (
        template_id, report_name, generated_by, parameters,
        output_format, status
      ) VALUES (?, ?, ?, ?, ?, 'completed')
    `, [template_id, report_name, req.user.id, parameters || null, output_format]);
    
    const executionTime = Date.now() - startTime;
    
    // Update execution time
    run(`
      UPDATE generated_reports
      SET execution_time_ms = ?, row_count = 0
      WHERE id = ?
    `, [executionTime, result.lastInsertRowid]);
    
    res.json({ 
      success: true, 
      data: { 
        id: result.lastInsertRowid, 
        status: 'completed',
        execution_time_ms: executionTime 
      } 
    });
  } catch (err) {
    logger.error('Error generating report:', err);
    res.status(500).json({ success: false, error: 'Failed to generate report' });
  }
});

// Get generated reports
app.get('/api/analytics/reports', authenticate, (req, res) => {
  try {
    const { status, limit = 50, offset = 0 } = req.query;
    
    let query = `
      SELECT 
        gr.*,
        rt.template_name,
        u.username as generated_by_name
      FROM generated_reports gr
      LEFT JOIN report_templates rt ON rt.id = gr.template_id
      LEFT JOIN users u ON u.id = gr.generated_by
      WHERE gr.generated_by = ?
    `;
    const params = [req.user.id];
    
    if (status) {
      query += ' AND gr.status = ?';
      params.push(status);
    }
    
    query += ' ORDER BY gr.generated_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));
    
    const reports = rows(query, params);
    const total = row('SELECT COUNT(*) as count FROM generated_reports WHERE generated_by = ?', [req.user.id])?.count || 0;
    
    res.json({ 
      success: true, 
      data: reports,
      pagination: { total, limit: parseInt(limit), offset: parseInt(offset) }
    });
  } catch (err) {
    logger.error('Error fetching reports:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch reports' });
  }
});

// Get analytics metrics summary
app.get('/api/analytics/metrics/summary', authenticate, (req, res) => {
  try {
    const { period = '30days' } = req.query;
    
    // Calculate date range
    let dateFilter = "date('now', '-30 days')";
    if (period === '7days') dateFilter = "date('now', '-7 days')";
    else if (period === '90days') dateFilter = "date('now', '-90 days')";
    else if (period === '1year') dateFilter = "date('now', '-1 year')";
    
    const metrics = {
      tenders: {
        total: row('SELECT COUNT(*) as count FROM tenders')?.count || 0,
        active: row("SELECT COUNT(*) as count FROM tenders WHERE status = 'active'")?.count || 0,
        recent: row(`SELECT COUNT(*) as count FROM tenders WHERE created_at >= ${dateFilter}`)?.count || 0
      },
      projects: {
        total: row('SELECT COUNT(*) as count FROM projects')?.count || 0,
        active: row("SELECT COUNT(*) as count FROM projects WHERE status = 'active'")?.count || 0
      },
      documents: {
        total: row('SELECT COUNT(*) as count FROM documents')?.count || 0,
        recent: row(`SELECT COUNT(*) as count FROM documents WHERE uploaded_at >= ${dateFilter}`)?.count || 0
      },
      competitors: {
        total: row('SELECT COUNT(*) as count FROM competitors')?.count || 0
      }
    };
    
    res.json({ success: true, data: metrics, period });
  } catch (err) {
    logger.error('Error fetching metrics:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch metrics' });
  }
});

// ============================================
// PHASE 7B: ADVANCED SEARCH & FILTERING SYSTEM
// ============================================

// Global search across all entities
app.get('/api/search/global', authenticate, (req, res) => {
  try {
    const { q, limit = 20, offset = 0 } = req.query;
    
    if (!q || q.trim().length < 2) {
      return res.status(400).json({ 
        success: false, 
        error: 'Search query must be at least 2 characters' 
      });
    }
    
    const searchQuery = q.trim();
    const startTime = Date.now();
    
    // FTS5 MATCH query
    const results = rows(`
      SELECT 
        entity_id,
        entity_type,
        title,
        snippet(global_search_fts, 2, '<mark>', '</mark>', '...', 64) as snippet,
        rank
      FROM global_search_fts
      WHERE global_search_fts MATCH ?
      ORDER BY rank
      LIMIT ? OFFSET ?
    `, [searchQuery, parseInt(limit), parseInt(offset)]);
    
    const totalCount = row(`
      SELECT COUNT(*) as count
      FROM global_search_fts
      WHERE global_search_fts MATCH ?
    `, [searchQuery])?.count || 0;
    
    const executionTime = Date.now() - startTime;
    
    // Log search to history
    run(`
      INSERT INTO search_history (user_id, search_type, query_text, result_count, execution_time_ms)
      VALUES (?, 'global', ?, ?, ?)
    `, [req.user.id, searchQuery, totalCount, executionTime]);
    
    // Update search suggestions
    run(`
      INSERT INTO search_suggestions (search_type, suggestion_text, usage_count, last_used_at)
      VALUES ('global', ?, 1, CURRENT_TIMESTAMP)
      ON CONFLICT(suggestion_text) 
      DO UPDATE SET usage_count = usage_count + 1, last_used_at = CURRENT_TIMESTAMP
    `, [searchQuery]);
    
    res.json({ 
      success: true, 
      data: results,
      pagination: {
        total: totalCount,
        limit: parseInt(limit),
        offset: parseInt(offset),
        hasMore: (parseInt(offset) + results.length) < totalCount
      },
      meta: {
        executionTime,
        query: searchQuery
      }
    });
  } catch (err) {
    logger.error('Error in global search:', err);
    res.status(500).json({ success: false, error: 'Search failed' });
  }
});

// Search tenders
app.get('/api/search/tenders', authenticate, (req, res) => {
  try {
    const { q, limit = 50, offset = 0 } = req.query;
    
    if (!q || q.trim().length < 2) {
      return res.status(400).json({ 
        success: false, 
        error: 'Search query must be at least 2 characters' 
      });
    }
    
    const searchQuery = q.trim();
    const startTime = Date.now();
    
    const results = rows(`
      SELECT 
        fts.tender_id,
        t.briefDesc,
        t.procuring_entity,
        t.method,
        t.tender_value,
        t.status,
        t.lastSubmission,
        snippet(tender_search_fts, 1, '<mark>', '</mark>', '...', 64) as snippet,
        fts.rank
      FROM tender_search_fts fts
      JOIN tenders t ON t.tender_id = fts.tender_id
      WHERE tender_search_fts MATCH ?
      ORDER BY fts.rank
      LIMIT ? OFFSET ?
    `, [searchQuery, parseInt(limit), parseInt(offset)]);
    
    const totalCount = row(`
      SELECT COUNT(*) as count
      FROM tender_search_fts
      WHERE tender_search_fts MATCH ?
    `, [searchQuery])?.count || 0;
    
    const executionTime = Date.now() - startTime;
    
    // Log search
    run(`
      INSERT INTO search_history (user_id, search_type, query_text, result_count, execution_time_ms)
      VALUES (?, 'tender', ?, ?, ?)
    `, [req.user.id, searchQuery, totalCount, executionTime]);
    
    res.json({ 
      success: true, 
      data: results,
      pagination: {
        total: totalCount,
        limit: parseInt(limit),
        offset: parseInt(offset)
      },
      meta: { executionTime, query: searchQuery }
    });
  } catch (err) {
    logger.error('Error searching tenders:', err);
    res.status(500).json({ success: false, error: 'Search failed' });
  }
});

// Search competitors
app.get('/api/search/competitors', authenticate, (req, res) => {
  try {
    const { q, limit = 50, offset = 0 } = req.query;
    
    if (!q || q.trim().length < 2) {
      return res.status(400).json({ 
        success: false, 
        error: 'Search query must be at least 2 characters' 
      });
    }
    
    const searchQuery = q.trim();
    
    const results = rows(`
      SELECT 
        fts.competitor_id,
        c.name,
        c.company_type,
        c.city,
        c.district,
        snippet(competitor_search_fts, 1, '<mark>', '</mark>', '...', 64) as snippet,
        fts.rank
      FROM competitor_search_fts fts
      JOIN competitors c ON c.id = fts.competitor_id
      WHERE competitor_search_fts MATCH ?
      ORDER BY fts.rank
      LIMIT ? OFFSET ?
    `, [searchQuery, parseInt(limit), parseInt(offset)]);
    
    const totalCount = row(`
      SELECT COUNT(*) as count
      FROM competitor_search_fts
      WHERE competitor_search_fts MATCH ?
    `, [searchQuery])?.count || 0;
    
    res.json({ 
      success: true, 
      data: results,
      pagination: { total: totalCount, limit: parseInt(limit), offset: parseInt(offset) }
    });
  } catch (err) {
    logger.error('Error searching competitors:', err);
    res.status(500).json({ success: false, error: 'Search failed' });
  }
});

// Search documents
app.get('/api/search/documents', authenticate, (req, res) => {
  try {
    const { q, limit = 50, offset = 0 } = req.query;
    
    if (!q || q.trim().length < 2) {
      return res.status(400).json({ 
        success: false, 
        error: 'Search query must be at least 2 characters' 
      });
    }
    
    const searchQuery = q.trim();
    
    const results = rows(`
      SELECT 
        fts.document_id,
        d.file_name,
        d.mime_type as file_type,
        d.file_size,
        d.description,
        d.uploaded_at,
        snippet(document_search_fts, 1, '<mark>', '</mark>', '...', 64) as snippet,
        fts.rank
      FROM document_search_fts fts
      JOIN documents d ON d.id = fts.document_id
      WHERE document_search_fts MATCH ?
      ORDER BY fts.rank
      LIMIT ? OFFSET ?
    `, [searchQuery, parseInt(limit), parseInt(offset)]);
    
    const totalCount = row(`
      SELECT COUNT(*) as count
      FROM document_search_fts
      WHERE document_search_fts MATCH ?
    `, [searchQuery])?.count || 0;
    
    res.json({ 
      success: true, 
      data: results,
      pagination: { total: totalCount, limit: parseInt(limit), offset: parseInt(offset) }
    });
  } catch (err) {
    logger.error('Error searching documents:', err);
    res.status(500).json({ success: false, error: 'Search failed' });
  }
});

// Search projects
app.get('/api/search/projects', authenticate, (req, res) => {
  try {
    const { q, limit = 50, offset = 0 } = req.query;
    
    if (!q || q.trim().length < 2) {
      return res.status(400).json({ 
        success: false, 
        error: 'Search query must be at least 2 characters' 
      });
    }
    
    const searchQuery = q.trim();
    
    const results = rows(`
      SELECT 
        fts.project_id,
        p.project_name,
        p.contract_number,
        p.contract_value,
        p.status,
        snippet(project_search_fts, 1, '<mark>', '</mark>', '...', 64) as snippet,
        fts.rank
      FROM project_search_fts fts
      JOIN projects p ON p.id = fts.project_id
      WHERE project_search_fts MATCH ?
      ORDER BY fts.rank
      LIMIT ? OFFSET ?
    `, [searchQuery, parseInt(limit), parseInt(offset)]);
    
    const totalCount = row(`
      SELECT COUNT(*) as count
      FROM project_search_fts
      WHERE project_search_fts MATCH ?
    `, [searchQuery])?.count || 0;
    
    res.json({ 
      success: true, 
      data: results,
      pagination: { total: totalCount, limit: parseInt(limit), offset: parseInt(offset) }
    });
  } catch (err) {
    logger.error('Error searching projects:', err);
    res.status(500).json({ success: false, error: 'Search failed' });
  }
});

// Get search suggestions (autocomplete)
app.get('/api/search/suggestions', authenticate, (req, res) => {
  try {
    const { q, type = 'global', limit = 10 } = req.query;
    
    if (!q || q.trim().length < 1) {
      return res.json({ success: true, data: [] });
    }
    
    const suggestions = rows(`
      SELECT suggestion_text, usage_count
      FROM search_suggestions
      WHERE search_type = ?
      AND suggestion_text LIKE ?
      ORDER BY usage_count DESC, last_used_at DESC
      LIMIT ?
    `, [type, `%${q.trim()}%`, parseInt(limit)]);
    
    res.json({ success: true, data: suggestions });
  } catch (err) {
    logger.error('Error fetching suggestions:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch suggestions' });
  }
});

// Get search history
app.get('/api/search/history', authenticate, (req, res) => {
  try {
    const { limit = 20, type } = req.query;
    
    let query = 'SELECT * FROM search_history WHERE user_id = ?';
    const params = [req.user.id];
    
    if (type) {
      query += ' AND search_type = ?';
      params.push(type);
    }
    
    query += ' ORDER BY created_at DESC LIMIT ?';
    params.push(parseInt(limit));
    
    const history = rows(query, params);
    res.json({ success: true, data: history });
  } catch (err) {
    logger.error('Error fetching search history:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch history' });
  }
});

// Delete search history
app.delete('/api/search/history', authenticate, (req, res) => {
  try {
    run('DELETE FROM search_history WHERE user_id = ?', [req.user.id]);
    res.json({ success: true, message: 'Search history cleared' });
  } catch (err) {
    logger.error('Error deleting search history:', err);
    res.status(500).json({ success: false, error: 'Failed to delete history' });
  }
});

// Save search
app.post('/api/search/saved', authenticate, (req, res) => {
  try {
    const { name, description, search_type, query_params, filters, sort_order, is_alert, alert_frequency } = req.body;
    
    if (!name || !search_type || !query_params) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing required fields: name, search_type, query_params' 
      });
    }
    
    const result = run(`
      INSERT INTO saved_searches (
        user_id, name, description, search_type, query_params, 
        filters, sort_order, is_alert, alert_frequency
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      req.user.id, name, description, search_type,
      JSON.stringify(query_params),
      filters ? JSON.stringify(filters) : null,
      sort_order ? JSON.stringify(sort_order) : null,
      is_alert || 0,
      alert_frequency
    ]);
    
    res.status(201).json({ 
      success: true, 
      message: 'Search saved successfully',
      data: { id: result.lastInsertRowid }
    });
  } catch (err) {
    logger.error('Error saving search:', err);
    res.status(500).json({ success: false, error: 'Failed to save search' });
  }
});

// Get saved searches
app.get('/api/search/saved', authenticate, (req, res) => {
  try {
    const { type, favorite } = req.query;
    
    let query = 'SELECT * FROM saved_searches WHERE user_id = ?';
    const params = [req.user.id];
    
    if (type) {
      query += ' AND search_type = ?';
      params.push(type);
    }
    
    if (favorite === 'true') {
      query += ' AND is_favorite = 1';
    }
    
    query += ' ORDER BY is_favorite DESC, updated_at DESC';
    
    const saved = rows(query, params);
    res.json({ success: true, data: saved });
  } catch (err) {
    logger.error('Error fetching saved searches:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch saved searches' });
  }
});

// Update saved search
app.put('/api/search/saved/:id', authenticate, (req, res) => {
  try {
    const { name, description, is_favorite, is_alert, alert_frequency } = req.body;
    
    const search = row('SELECT id FROM saved_searches WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
    if (!search) {
      return res.status(404).json({ success: false, error: 'Saved search not found' });
    }
    
    run(`
      UPDATE saved_searches 
      SET name = COALESCE(?, name),
          description = COALESCE(?, description),
          is_favorite = COALESCE(?, is_favorite),
          is_alert = COALESCE(?, is_alert),
          alert_frequency = COALESCE(?, alert_frequency),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [name, description, is_favorite, is_alert, alert_frequency, req.params.id]);
    
    res.json({ success: true, message: 'Saved search updated' });
  } catch (err) {
    logger.error('Error updating saved search:', err);
    res.status(500).json({ success: false, error: 'Failed to update saved search' });
  }
});

// Delete saved search
app.delete('/api/search/saved/:id', authenticate, (req, res) => {
  try {
    const search = row('SELECT id FROM saved_searches WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
    if (!search) {
      return res.status(404).json({ success: false, error: 'Saved search not found' });
    }
    
    run('DELETE FROM saved_searches WHERE id = ?', [req.params.id]);
    res.json({ success: true, message: 'Saved search deleted' });
  } catch (err) {
    logger.error('Error deleting saved search:', err);
    res.status(500).json({ success: false, error: 'Failed to delete saved search' });
  }
});

// Execute saved search
app.get('/api/search/saved/:id/execute', authenticate, (req, res) => {
  try {
    const search = row('SELECT * FROM saved_searches WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
    if (!search) {
      return res.status(404).json({ success: false, error: 'Saved search not found' });
    }
    
    const queryParams = JSON.parse(search.query_params);
    const { limit = 50, offset = 0 } = req.query;
    
    // Execute the search based on type
    let results = [];
    let totalCount = 0;
    
    if (search.search_type === 'tender') {
      results = rows(`
        SELECT 
          fts.tender_id,
          t.briefDesc,
          t.procuring_entity,
          t.method,
          t.tender_value,
          t.status
        FROM tender_search_fts fts
        JOIN tenders t ON t.tender_id = fts.tender_id
        WHERE tender_search_fts MATCH ?
        ORDER BY fts.rank
        LIMIT ? OFFSET ?
      `, [queryParams.q || '', parseInt(limit), parseInt(offset)]);
      
      totalCount = row(`
        SELECT COUNT(*) as count
        FROM tender_search_fts
        WHERE tender_search_fts MATCH ?
      `, [queryParams.q || ''])?.count || 0;
    }
    // Add more search types as needed
    
    // Update last run
    run(`
      UPDATE saved_searches 
      SET last_run_at = CURRENT_TIMESTAMP, result_count = ?
      WHERE id = ?
    `, [totalCount, req.params.id]);
    
    res.json({ 
      success: true, 
      data: results,
      pagination: { total: totalCount, limit: parseInt(limit), offset: parseInt(offset) },
      search: {
        name: search.name,
        type: search.search_type
      }
    });
  } catch (err) {
    logger.error('Error executing saved search:', err);
    res.status(500).json({ success: false, error: 'Failed to execute saved search' });
  }
});

// ============================================
// PHASE 7A: EMAIL NOTIFICATION SYSTEM
// ============================================

const emailService = require('./utils/emailService');

// Get email templates
app.get('/api/email/templates', authenticate, authorize('admin', 'manager'), (req, res) => {
  try {
    const { category, is_active } = req.query;
    
    let query = 'SELECT * FROM email_templates WHERE 1=1';
    const params = [];
    
    if (category) {
      query += ' AND category = ?';
      params.push(category);
    }
    
    if (is_active !== undefined) {
      query += ' AND is_active = ?';
      params.push(is_active === 'true' ? 1 : 0);
    }
    
    query += ' ORDER BY category, name';
    
    const templates = rows(query, params);
    res.json({ success: true, data: templates });
  } catch (err) {
    logger.error('Error fetching email templates:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch templates' });
  }
});

// Get single email template
app.get('/api/email/templates/:id', authenticate, authorize('admin', 'manager'), (req, res) => {
  try {
    const template = row('SELECT * FROM email_templates WHERE id = ?', [req.params.id]);
    
    if (!template) {
      return res.status(404).json({ success: false, error: 'Template not found' });
    }
    
    res.json({ success: true, data: template });
  } catch (err) {
    logger.error('Error fetching email template:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch template' });
  }
});

// Create email template
app.post('/api/email/templates', authenticate, authorize('admin'), (req, res) => {
  try {
    const { name, code, subject, body_html, body_text, variables, category, description } = req.body;
    
    // Validate required fields
    if (!name || !code || !subject || !body_html) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing required fields: name, code, subject, body_html' 
      });
    }
    
    // Check if code already exists
    const existing = row('SELECT id FROM email_templates WHERE code = ?', [code]);
    if (existing) {
      return res.status(400).json({ success: false, error: 'Template code already exists' });
    }
    
    const result = run(`
      INSERT INTO email_templates (
        name, code, subject, body_html, body_text, variables, 
        category, description, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      name, code, subject, body_html, body_text,
      variables ? JSON.stringify(variables) : null,
      category, description, req.user.id
    ]);
    
    res.status(201).json({ 
      success: true, 
      message: 'Template created successfully',
      data: { id: result.lastInsertRowid }
    });
  } catch (err) {
    logger.error('Error creating email template:', err);
    res.status(500).json({ success: false, error: 'Failed to create template' });
  }
});

// Update email template
app.put('/api/email/templates/:id', authenticate, authorize('admin'), (req, res) => {
  try {
    const { name, subject, body_html, body_text, variables, category, description, is_active } = req.body;
    
    const template = row('SELECT id FROM email_templates WHERE id = ?', [req.params.id]);
    if (!template) {
      return res.status(404).json({ success: false, error: 'Template not found' });
    }
    
    run(`
      UPDATE email_templates 
      SET name = COALESCE(?, name),
          subject = COALESCE(?, subject),
          body_html = COALESCE(?, body_html),
          body_text = COALESCE(?, body_text),
          variables = COALESCE(?, variables),
          category = COALESCE(?, category),
          description = COALESCE(?, description),
          is_active = COALESCE(?, is_active),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [
      name, subject, body_html, body_text,
      variables ? JSON.stringify(variables) : null,
      category, description, is_active, req.params.id
    ]);
    
    res.json({ success: true, message: 'Template updated successfully' });
  } catch (err) {
    logger.error('Error updating email template:', err);
    res.status(500).json({ success: false, error: 'Failed to update template' });
  }
});

// Delete email template
app.delete('/api/email/templates/:id', authenticate, authorize('admin'), (req, res) => {
  try {
    const template = row('SELECT id, code FROM email_templates WHERE id = ?', [req.params.id]);
    
    if (!template) {
      return res.status(404).json({ success: false, error: 'Template not found' });
    }
    
    // Prevent deletion of system templates
    const systemTemplates = ['TENDER_DEADLINE', 'TASK_ASSIGNED', 'DAILY_DIGEST', 'LICENSE_EXPIRY'];
    if (systemTemplates.includes(template.code)) {
      return res.status(400).json({ 
        success: false, 
        error: 'Cannot delete system templates' 
      });
    }
    
    run('DELETE FROM email_templates WHERE id = ?', [req.params.id]);
    res.json({ success: true, message: 'Template deleted successfully' });
  } catch (err) {
    logger.error('Error deleting email template:', err);
    res.status(500).json({ success: false, error: 'Failed to delete template' });
  }
});

// Get email queue
app.get('/api/email/queue', authenticate, authorize('admin', 'manager'), (req, res) => {
  try {
    const { status, priority, page = 1, limit = 50 } = req.query;
    
    let query = 'SELECT * FROM email_queue WHERE 1=1';
    const params = [];
    
    if (status) {
      query += ' AND status = ?';
      params.push(status);
    }
    
    if (priority) {
      query += ' AND priority = ?';
      params.push(priority);
    }
    
    query += ' ORDER BY priority DESC, created_at DESC';
    
    const result = paginate(query, params, parseInt(page), parseInt(limit));
    res.json({ success: true, ...result });
  } catch (err) {
    logger.error('Error fetching email queue:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch email queue' });
  }
});

// Get email queue item
app.get('/api/email/queue/:id', authenticate, authorize('admin', 'manager'), (req, res) => {
  try {
    const email = row('SELECT * FROM email_queue WHERE id = ?', [req.params.id]);
    
    if (!email) {
      return res.status(404).json({ success: false, error: 'Email not found in queue' });
    }
    
    res.json({ success: true, data: email });
  } catch (err) {
    logger.error('Error fetching email:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch email' });
  }
});

// Send email using template
app.post('/api/email/send', authenticate, (req, res) => {
  try {
    const { template_code, data, to_email, to_name, options = {} } = req.body;
    
    if (!template_code || !data || !to_email) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing required fields: template_code, data, to_email' 
      });
    }
    
    // Add created_by to options
    options.created_by = req.user.id;
    
    emailService.sendTemplateEmail(template_code, data, to_email, to_name, options)
      .then(result => {
        res.json({ 
          success: true, 
          message: 'Email sent successfully',
          data: result
        });
      })
      .catch(err => {
        logger.error('Error sending email:', err);
        res.status(500).json({ success: false, error: err.message });
      });
  } catch (err) {
    logger.error('Error in send email endpoint:', err);
    res.status(500).json({ success: false, error: 'Failed to send email' });
  }
});

// Send email to multiple users
app.post('/api/email/send-bulk', authenticate, authorize('admin', 'manager'), (req, res) => {
  try {
    const { template_code, data, user_ids, category = 'notification_emails' } = req.body;
    
    if (!template_code || !data || !user_ids || !Array.isArray(user_ids)) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing required fields: template_code, data, user_ids (array)' 
      });
    }
    
    emailService.sendNotificationEmails(template_code, data, user_ids, category)
      .then(results => {
        const sent = results.filter(r => r.success).length;
        const failed = results.filter(r => !r.success).length;
        
        res.json({ 
          success: true, 
          message: `Sent ${sent} emails, ${failed} failed`,
          data: { sent, failed, results }
        });
      })
      .catch(err => {
        logger.error('Error sending bulk emails:', err);
        res.status(500).json({ success: false, error: err.message });
      });
  } catch (err) {
    logger.error('Error in bulk send endpoint:', err);
    res.status(500).json({ success: false, error: 'Failed to send bulk emails' });
  }
});

// Retry failed email
app.post('/api/email/queue/:id/retry', authenticate, authorize('admin', 'manager'), (req, res) => {
  try {
    const email = row('SELECT * FROM email_queue WHERE id = ?', [req.params.id]);
    
    if (!email) {
      return res.status(404).json({ success: false, error: 'Email not found in queue' });
    }
    
    if (email.status === 'sent') {
      return res.status(400).json({ success: false, error: 'Email already sent' });
    }
    
    // Reset status to pending
    run(`
      UPDATE email_queue 
      SET status = 'pending', error_message = NULL, updated_at = CURRENT_TIMESTAMP 
      WHERE id = ?
    `, [req.params.id]);
    
    // Try to send immediately
    emailService.sendQueuedEmail(parseInt(req.params.id))
      .then(result => {
        res.json({ 
          success: true, 
          message: 'Email resent successfully',
          data: result
        });
      })
      .catch(err => {
        logger.error('Error retrying email:', err);
        res.status(500).json({ success: false, error: err.message });
      });
  } catch (err) {
    logger.error('Error in retry endpoint:', err);
    res.status(500).json({ success: false, error: 'Failed to retry email' });
  }
});

// Cancel scheduled email
app.post('/api/email/queue/:id/cancel', authenticate, authorize('admin', 'manager'), (req, res) => {
  try {
    const email = row('SELECT * FROM email_queue WHERE id = ?', [req.params.id]);
    
    if (!email) {
      return res.status(404).json({ success: false, error: 'Email not found in queue' });
    }
    
    if (email.status === 'sent') {
      return res.status(400).json({ success: false, error: 'Cannot cancel sent email' });
    }
    
    run(`
      UPDATE email_queue 
      SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP 
      WHERE id = ?
    `, [req.params.id]);
    
    res.json({ success: true, message: 'Email cancelled successfully' });
  } catch (err) {
    logger.error('Error cancelling email:', err);
    res.status(500).json({ success: false, error: 'Failed to cancel email' });
  }
});

// Get email logs
app.get('/api/email/logs', authenticate, authorize('admin', 'manager'), (req, res) => {
  try {
    const { status, to_email, page = 1, limit = 50 } = req.query;
    
    let query = 'SELECT * FROM email_logs WHERE 1=1';
    const params = [];
    
    if (status) {
      query += ' AND status = ?';
      params.push(status);
    }
    
    if (to_email) {
      query += ' AND to_email LIKE ?';
      params.push(`%${to_email}%`);
    }
    
    query += ' ORDER BY created_at DESC';
    
    const result = paginate(query, params, parseInt(page), parseInt(limit));
    res.json({ success: true, ...result });
  } catch (err) {
    logger.error('Error fetching email logs:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch email logs' });
  }
});

// Get email statistics
app.get('/api/email/stats', authenticate, authorize('admin', 'manager'), (req, res) => {
  try {
    const stats = {
      queue: {
        total: row('SELECT COUNT(*) as count FROM email_queue')?.count || 0,
        pending: row('SELECT COUNT(*) as count FROM email_queue WHERE status = "pending"')?.count || 0,
        sent: row('SELECT COUNT(*) as count FROM email_queue WHERE status = "sent"')?.count || 0,
        failed: row('SELECT COUNT(*) as count FROM email_queue WHERE status = "failed"')?.count || 0,
        scheduled: row('SELECT COUNT(*) as count FROM email_queue WHERE status = "pending" AND scheduled_at IS NOT NULL')?.count || 0
      },
      logs: {
        total: row('SELECT COUNT(*) as count FROM email_logs')?.count || 0,
        sent: row('SELECT COUNT(*) as count FROM email_logs WHERE status = "sent"')?.count || 0,
        failed: row('SELECT COUNT(*) as count FROM email_logs WHERE status = "failed"')?.count || 0,
        bounced: row('SELECT COUNT(*) as count FROM email_logs WHERE status = "bounced"')?.count || 0
      },
      templates: {
        total: row('SELECT COUNT(*) as count FROM email_templates')?.count || 0,
        active: row('SELECT COUNT(*) as count FROM email_templates WHERE is_active = 1')?.count || 0
      },
      recent: rows('SELECT DATE(sent_at) as date, COUNT(*) as count FROM email_logs WHERE sent_at >= date("now", "-7 days") GROUP BY DATE(sent_at) ORDER BY date DESC')
    };
    
    res.json({ success: true, data: stats });
  } catch (err) {
    logger.error('Error fetching email stats:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch stats' });
  }
});

// Get user email settings
app.get('/api/email/settings', authenticate, (req, res) => {
  try {
    let settings = row('SELECT * FROM email_settings WHERE user_id = ?', [req.user.id]);
    
    // Create default settings if none exist
    if (!settings) {
      run(`
        INSERT INTO email_settings (user_id, unsubscribe_token)
        VALUES (?, lower(hex(randomblob(16))))
      `, [req.user.id]);
      
      settings = row('SELECT * FROM email_settings WHERE user_id = ?', [req.user.id]);
    }
    
    res.json({ success: true, data: settings });
  } catch (err) {
    logger.error('Error fetching email settings:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch settings' });
  }
});

// Update user email settings
app.put('/api/email/settings', authenticate, (req, res) => {
  try {
    const {
      notification_emails,
      digest_emails,
      digest_frequency,
      alert_emails,
      report_emails,
      task_emails,
      tender_emails
    } = req.body;
    
    // Ensure settings exist
    let settings = row('SELECT id FROM email_settings WHERE user_id = ?', [req.user.id]);
    
    if (!settings) {
      run(`
        INSERT INTO email_settings (user_id, unsubscribe_token)
        VALUES (?, lower(hex(randomblob(16))))
      `, [req.user.id]);
    }
    
    run(`
      UPDATE email_settings 
      SET notification_emails = COALESCE(?, notification_emails),
          digest_emails = COALESCE(?, digest_emails),
          digest_frequency = COALESCE(?, digest_frequency),
          alert_emails = COALESCE(?, alert_emails),
          report_emails = COALESCE(?, report_emails),
          task_emails = COALESCE(?, task_emails),
          tender_emails = COALESCE(?, tender_emails),
          updated_at = CURRENT_TIMESTAMP
      WHERE user_id = ?
    `, [
      notification_emails, digest_emails, digest_frequency,
      alert_emails, report_emails, task_emails, tender_emails,
      req.user.id
    ]);
    
    res.json({ success: true, message: 'Email settings updated successfully' });
  } catch (err) {
    logger.error('Error updating email settings:', err);
    res.status(500).json({ success: false, error: 'Failed to update settings' });
  }
});

// Process pending emails (admin only - for manual trigger)
app.post('/api/email/process-queue', authenticate, authorize('admin'), (req, res) => {
  try {
    const { limit = 50 } = req.body;
    
    emailService.processPendingEmails(limit)
      .then(results => {
        res.json({ 
          success: true, 
          message: `Processed ${results.total} emails`,
          data: results
        });
      })
      .catch(err => {
        logger.error('Error processing queue:', err);
        res.status(500).json({ success: false, error: err.message });
      });
  } catch (err) {
    logger.error('Error in process queue endpoint:', err);
    res.status(500).json({ success: false, error: 'Failed to process queue' });
  }
});

// ============================================
// UPLOAD ERROR HANDLER
// ============================================
// Handle multer upload errors with user-friendly messages
app.use(uploadSafe.handleMulterError);

// ============================================
// CATCH-ALL ROUTE
// ============================================
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;

// Start orphaned file cleanup job
logger.info('Starting file cleanup job...');
startCleanupJob();

app.listen(PORT, () => {
  console.log(`Big Office running on http://localhost:${PORT}`);
  logger.info(`Server started on port ${PORT}`, {
    nodeEnv: process.env.NODE_ENV || 'development',
    maxFileSize: uploadSafe.MAX_FILE_SIZE,
    cleanupInterval: process.env.UPLOAD_CLEANUP_INTERVAL || '3600000'
  });
});
