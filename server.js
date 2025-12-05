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
const { generateTokenPair, verifyRefreshToken } = require('./utils/jwt');
const logger = require('./utils/logger');
const ReportGenerator = require('./utils/reportGenerator');
const { validate, schemas } = require('./middleware/validator');
const { auditLog, auditAuth } = require('./middleware/audit');
const { db, row, rows, run, transaction, paginate } = require('./utils/database');
const { 
  applyFieldSecurity, 
  applyFieldSecurityToList, 
  applyOfficerSecurity,
  logFieldAccess 
} = require('./middleware/fieldSecurity');

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
// MULTER CONFIGURATION FOR FILE UPLOADS
// ============================================

// Configure storage for firm documents
const documentStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    const firmId = req.params.firmId || 'temp';
    const dir = path.join(__dirname, 'uploads', 'firm_documents', `firm_${firmId}`);
    
    // Create directory if doesn't exist
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: function (req, file, cb) {
    // Generate unique filename: timestamp-randomstring-originalname
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const sanitizedName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
    cb(null, uniqueSuffix + '-' + sanitizedName);
  }
});

// File filter for validation
const documentFileFilter = function (req, file, cb) {
  // Accept only specific file types
  const allowedTypes = /pdf|jpg|jpeg|png|doc|docx|xlsx|xls/;
  const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = allowedTypes.test(file.mimetype);
  
  if (mimetype && extname) {
    return cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only PDF, images, and office documents allowed.'));
  }
};

// Configure upload middleware
const uploadDocument = multer({
  storage: documentStorage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
    files: 1 // Single file upload
  },
  fileFilter: documentFileFilter
});

// Storage for letterhead assets (logos, seals, signatures)
const letterheadStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    const firmId = req.params.firmId || 'temp';
    const dir = path.join(__dirname, 'uploads', 'letterheads', `firm_${firmId}`);
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const sanitizedName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
    cb(null, uniqueSuffix + '-' + sanitizedName);
  }
});

const uploadLetterhead = multer({
  storage: letterheadStorage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB for images
  fileFilter: function (req, file, cb) {
    const allowedTypes = /jpeg|jpg|png/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (mimetype && extname) {
      cb(null, true);
    } else {
      cb(new Error('Only JPG and PNG images are allowed for letterhead assets.'));
    }
  }
});

// Storage for officer photos
const officerPhotoStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    const dir = path.join(__dirname, 'uploads', 'officers');
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, `officer-${uniqueSuffix}${ext}`);
  }
});

const uploadOfficerPhoto = multer({
  storage: officerPhotoStorage,
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB
  fileFilter: function (req, file, cb) {
    const allowedTypes = /jpeg|jpg|png/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (mimetype && extname) {
      cb(null, true);
    } else {
      cb(new Error('Only JPG and PNG images allowed for officer photos.'));
    }
  }
});

// Storage for officer documents
const officerDocStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    const officerId = req.params.id || 'temp';
    const dir = path.join(__dirname, 'uploads', 'officer_documents', officerId);
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const sanitizedName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
    cb(null, uniqueSuffix + '-' + sanitizedName);
  }
});

const uploadOfficerDoc = multer({
  storage: officerDocStorage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: function (req, file, cb) {
    const allowedTypes = /pdf|jpg|jpeg|png|doc|docx/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (mimetype && extname) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only PDF, images, and office documents allowed.'));
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
    
    let sql = `SELECT t.*, 
               f.name as assigned_firm_name,
               o.full_name as officer_name,
               o.designation_title,
               o.personal_mobile as officer_mobile,
               o.personal_email as officer_email
               FROM tenders t 
               LEFT JOIN firms f ON t.assigned_firm_id = f.id
               LEFT JOIN (
                 SELECT o.id, o.full_name, o.personal_mobile, o.personal_email, d.title as designation_title
                 FROM officers o
                 LEFT JOIN designations d ON o.designation_id = d.id
               ) o ON t.officer_id = o.id
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
    const filteredOfficers = applyFieldSecurityToList(officers, req.user);
    
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
    
    // Apply field-level security based on user role and visibility settings
    const filteredOfficer = applyFieldSecurity(officer, req.user);
    
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
app.post('/api/officers/:id/deeds', authenticate, authorize('admin', 'hr', 'manager'), (req, res) => {
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
    
    run(`
      INSERT INTO officer_deeds (
        id, officer_id, deed_type, title, description, deed_date,
        severity, points, category, reported_by, verification_status,
        remarks, is_confidential
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)
    `, [
      deedId, req.params.id, deed_type, title, description, deed_date,
      severity, points || 0, category, req.user.username, remarks, is_confidential || 0
    ]);
    
    // Log activity
    logger.info('Officer deed recorded', {
      deedId, officerId: req.params.id, deedType: deed_type,
      userId: req.user.id, username: req.user.username
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
    
    // Delete file from filesystem
    const fs = require('fs');
    const filePath = path.join(__dirname, 'uploads', document.file_path);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    
    // Delete from database
    run('DELETE FROM officer_documents WHERE id = ?', [documentId]);
    
    // Log activity
    logActivity(userId, 'document_deleted', null, null,
      `Deleted document ${document.document_title} for officer ${officer.full_name}`, req.ip);
    
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
// HEALTH CHECK & MONITORING
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
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Big Office running on http://localhost:${PORT}`));
