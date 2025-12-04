# Big Office - Advanced Features Research & Implementation Plan

## Overview
This document provides comprehensive research for implementing advanced document management, contact system, email functionality, and professional letterhead/PDF generation for kormopro.com.

---

## 1. FILE UPLOAD & PREVIEW SYSTEM

### A. File Upload with Multer

**Package:** `multer@2.0.2` (8.7M weekly downloads, MIT license)

**Key Features:**
- Middleware for handling `multipart/form-data` 
- DiskStorage and MemoryStorage options
- File filtering, size limits, and validation
- Integration with Express.js routes

**Implementation Options:**

#### Option 1: DiskStorage (Recommended for kormopro.com)
```javascript
const multer = require('multer');
const path = require('path');

// Configure storage
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    // Organize by firm: uploads/firm_documents/firm_1/
    const firmId = req.params.firmId;
    const dir = path.join(__dirname, 'uploads', 'firm_documents', `firm_${firmId}`);
    
    // Create directory if doesn't exist
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: function (req, file, cb) {
    // Generate unique filename: doctype_timestamp_originalname
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

// File filter for validation
const fileFilter = function (req, file, cb) {
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

// Configure upload
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
    files: 5 // Max 5 files at once
  },
  fileFilter: fileFilter
});

// Use in route
app.post('/api/firms/:firmId/documents', upload.single('document'), (req, res) => {
  // req.file contains: fieldname, originalname, encoding, mimetype, destination, filename, path, size
  // req.body contains other form fields
  
  const fileInfo = {
    file_path: req.file.path,
    file_type: path.extname(req.file.originalname).substring(1),
    file_size: req.file.size,
    original_name: req.file.originalname
  };
  
  // Save to database with other document metadata
});
```

**Storage Structure:**
```
uploads/
  firm_documents/
    firm_1/
      trade_license-1234567890-TL-2024.pdf
      tin_certificate-9876543210-TIN-Cert.pdf
    firm_2/
      ...
  letterheads/
    firm_1/
      logo.png
      seal.png
      signature.png
  email_attachments/
    ...
```

**Benefits:**
- Files stored on disk, not in memory (scalable)
- Organized folder structure per firm
- Easy to backup and migrate
- Compatible with VPS filesystem

**Security Considerations:**
- Validate file types by both extension and MIME type
- Limit file sizes to prevent DoS attacks
- Use unique filenames to prevent overwriting
- Store outside public directory, serve through protected routes
- Scan for malware (optional: integrate ClamAV)

---

### B. Document Preview System

**For PDFs:** **PDF.js** by Mozilla (standard for web PDF rendering)

**For Images:** Native browser rendering (`<img>` tag)

**For Office Docs:** Convert to PDF first (optional: unoconv, LibreOffice), or provide download only

#### PDF.js Implementation

**CDN Approach (Recommended for kormopro.com):**
```html
<!-- In public/app.html -->
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf_viewer.min.css">
<script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"></script>

<!-- Preview Modal -->
<div id="document-preview-modal" class="modal" style="display:none;">
  <div class="modal-content" style="width: 90%; max-width: 1200px;">
    <span class="close" onclick="closePreview()">&times;</span>
    <h2 id="preview-title"></h2>
    
    <div class="preview-controls">
      <button onclick="previousPage()">Previous</button>
      <span>Page: <span id="page_num"></span> / <span id="page_count"></span></span>
      <button onclick="nextPage()">Next</button>
      <button onclick="downloadDocument()">Download</button>
    </div>
    
    <canvas id="pdf-canvas" style="width: 100%; border: 1px solid #ddd;"></canvas>
    <img id="image-preview" style="width: 100%; display:none;">
  </div>
</div>
```

```javascript
// In public/app.js
let pdfDoc = null;
let pageNum = 1;
let pageRendering = false;
let pageNumPending = null;
let scale = 1.5;

async function previewDocument(docId) {
  const doc = await fetch(`${API}/firms/${currentFirmId}/documents/${docId}`).then(r => r.json());
  
  document.getElementById('preview-title').textContent = doc.document_name;
  document.getElementById('document-preview-modal').style.display = 'block';
  
  if (doc.file_type === 'pdf') {
    // Load PDF using PDF.js
    const loadingTask = pdfjsLib.getDocument(`/api/documents/${docId}/view`);
    
    loadingTask.promise.then(function(pdf) {
      pdfDoc = pdf;
      document.getElementById('page_count').textContent = pdf.numPages;
      renderPage(pageNum);
    });
  } else if (['jpg', 'jpeg', 'png'].includes(doc.file_type)) {
    // Show image directly
    document.getElementById('pdf-canvas').style.display = 'none';
    document.getElementById('image-preview').style.display = 'block';
    document.getElementById('image-preview').src = `/api/documents/${docId}/view`;
  } else {
    // For other types, just download
    alert('Preview not available for this file type. Downloading...');
    downloadDocument();
  }
}

function renderPage(num) {
  pageRendering = true;
  pdfDoc.getPage(num).then(function(page) {
    const canvas = document.getElementById('pdf-canvas');
    const ctx = canvas.getContext('2d');
    const viewport = page.getViewport({scale: scale});
    
    canvas.height = viewport.height;
    canvas.width = viewport.width;
    
    const renderContext = {
      canvasContext: ctx,
      viewport: viewport
    };
    
    const renderTask = page.render(renderContext);
    
    renderTask.promise.then(function() {
      pageRendering = false;
      if (pageNumPending !== null) {
        renderPage(pageNumPending);
        pageNumPending = null;
      }
    });
  });
  
  document.getElementById('page_num').textContent = num;
}

function nextPage() {
  if (pageNum >= pdfDoc.numPages) return;
  pageNum++;
  renderPage(pageNum);
}

function previousPage() {
  if (pageNum <= 1) return;
  pageNum--;
  renderPage(pageNum);
}
```

**Backend Route for Secure File Serving:**
```javascript
// In server.js
app.get('/api/documents/:id/view', (req, res) => {
  try {
    const docId = req.params.id;
    const doc = row('SELECT * FROM firm_documents WHERE id = ?', [docId]);
    
    if (!doc) {
      return res.status(404).json({ error: 'Document not found' });
    }
    
    // Check user permissions here (optional: verify user has access to this firm)
    // if (!hasPermission(req.user, doc.firm_id)) return res.status(403).json({ error: 'Forbidden' });
    
    // Serve file
    const filePath = doc.file_path;
    
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found on disk' });
    }
    
    // Set appropriate content type
    const contentType = {
      'pdf': 'application/pdf',
      'jpg': 'image/jpeg',
      'jpeg': 'image/jpeg',
      'png': 'image/png',
      'doc': 'application/msword',
      'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    }[doc.file_type] || 'application/octet-stream';
    
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `inline; filename="${doc.document_name}.${doc.file_type}"`);
    
    const fileStream = fs.createReadStream(filePath);
    fileStream.pipe(res);
    
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Download endpoint (forces download instead of inline display)
app.get('/api/documents/:id/download', (req, res) => {
  // Same logic as above, but with Content-Disposition: attachment
  res.setHeader('Content-Disposition', `attachment; filename="${doc.document_name}.${doc.file_type}"`);
});
```

---

## 2. EMAIL SYSTEM

### A. Nodemailer Configuration

**Package:** `nodemailer@7.0.11` (7.4M weekly downloads, MIT license)

**Features:**
- SMTP, Gmail, SendGrid, AWS SES support
- HTML email templates
- Attachments support
- OAuth2 authentication

#### Implementation Options:

**Option 1: Generic SMTP (Most Flexible)**
```javascript
const nodemailer = require('nodemailer');

// Email configuration table (already design this)
const getEmailConfig = () => {
  return row('SELECT * FROM email_config WHERE is_active = 1 LIMIT 1');
};

// Create reusable transporter
const createTransporter = () => {
  const config = getEmailConfig();
  
  return nodemailer.createTransport({
    host: config.smtp_host,           // e.g., 'mail.kormopro.com'
    port: config.smtp_port,           // 587 for TLS, 465 for SSL
    secure: config.smtp_port === 465, // true for 465, false for other ports
    auth: {
      user: config.smtp_user,
      pass: config.smtp_pass
    },
    tls: {
      rejectUnauthorized: false // For self-signed certificates (use with caution)
    }
  });
};

// Send email function
async function sendEmail(to, subject, body, attachments = [], fromEmail = null) {
  try {
    const config = getEmailConfig();
    const transporter = createTransporter();
    
    const mailOptions = {
      from: fromEmail || `"${config.from_name}" <${config.from_email}>`,
      to: to,                    // Can be comma-separated string or array
      subject: subject,
      html: body,                // HTML body
      text: body.replace(/<[^>]*>/g, ''), // Plain text fallback
      attachments: attachments   // Array of { filename, path } objects
    };
    
    const info = await transporter.sendMail(mailOptions);
    
    // Log to email_history
    run(`INSERT INTO email_history (to_email, from_email, subject, body, status, sent_at, message_id)
         VALUES (?, ?, ?, ?, 'sent', datetime('now'), ?)`,
        [to, mailOptions.from, subject, body, info.messageId]);
    
    return { success: true, messageId: info.messageId };
    
  } catch (err) {
    console.error('Email error:', err);
    
    // Log failed email
    run(`INSERT INTO email_history (to_email, from_email, subject, body, status, sent_at, error_message)
         VALUES (?, ?, ?, ?, 'failed', datetime('now'), ?)`,
        [to, fromEmail, subject, body, err.message]);
    
    throw err;
  }
}

// API endpoint
app.post('/api/emails/send', async (req, res) => {
  try {
    const { to, subject, body, template_id, variables, attachments, from_email } = req.body;
    
    let finalBody = body;
    
    // If using template, load and replace variables
    if (template_id) {
      const template = row('SELECT * FROM email_templates WHERE id = ?', [template_id]);
      finalBody = template.body;
      
      // Replace variables: {{company_name}}, {{date}}, etc.
      if (variables) {
        Object.keys(variables).forEach(key => {
          finalBody = finalBody.replace(new RegExp(`{{${key}}}`, 'g'), variables[key]);
        });
      }
    }
    
    const result = await sendEmail(to, subject, finalBody, attachments, from_email);
    res.json(result);
    
  } catch (err) {
    res.status(500).json({ error: 'Failed to send email', message: err.message });
  }
});
```

**Option 2: Gmail SMTP (Easier for testing)**
```javascript
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: 'your-email@gmail.com',
    pass: 'your-app-password' // Generate from Google Account settings
  }
});
```

**Option 3: SendGrid API (Professional, 100 emails/day free)**
```javascript
const sgMail = require('@sendgrid/mail');
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

const msg = {
  to: 'recipient@example.com',
  from: 'sender@kormopro.com',
  subject: 'Subject',
  html: '<strong>Body</strong>',
};

await sgMail.send(msg);
```

#### Database Schema for Email System:

```sql
-- Email Configuration
CREATE TABLE IF NOT EXISTS email_config (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  smtp_host TEXT NOT NULL,          -- mail.kormopro.com
  smtp_port INTEGER NOT NULL,       -- 587 or 465
  smtp_user TEXT NOT NULL,          -- admin@kormopro.com
  smtp_pass TEXT NOT NULL,          -- Password (encrypted in production)
  from_email TEXT NOT NULL,         -- noreply@kormopro.com
  from_name TEXT NOT NULL,          -- Big Office System
  is_active BOOLEAN DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Email Templates
CREATE TABLE IF NOT EXISTS email_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,               -- HTML body with {{variables}}
  variables TEXT,                   -- JSON array of variable names
  category TEXT,                    -- tender_notification, document_expiry, etc.
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Email History
CREATE TABLE IF NOT EXISTS email_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  to_email TEXT NOT NULL,
  from_email TEXT NOT NULL,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  status TEXT DEFAULT 'pending',    -- pending, sent, failed, bounced
  sent_at DATETIME,
  message_id TEXT,
  error_message TEXT,
  attachments TEXT,                 -- JSON array of attachment info
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

---

## 3. ORGANIZATION CONTACTS MODULE

### Database Schema:

```sql
-- Organizations (Government/Non-Government entities)
CREATE TABLE IF NOT EXISTS organizations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  short_name TEXT,
  type TEXT NOT NULL,                     -- government, non_government
  category TEXT,                          -- ministry, department, ngo, private_company, bank, etc.
  parent_org_id INTEGER,                  -- For hierarchical organizations
  address TEXT,
  city TEXT,
  district TEXT,
  postal_code TEXT,
  country TEXT DEFAULT 'Bangladesh',
  phone TEXT,
  fax TEXT,
  email TEXT,
  website TEXT,
  established_date TEXT,
  registration_number TEXT,
  description TEXT,
  notes TEXT,
  is_active BOOLEAN DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (parent_org_id) REFERENCES organizations(id) ON DELETE SET NULL
);

-- Contact Persons within Organizations
CREATE TABLE IF NOT EXISTS contact_persons (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  organization_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  designation TEXT,
  department TEXT,
  email TEXT,
  phone TEXT,
  mobile TEXT,
  extension TEXT,                         -- Office phone extension
  is_primary BOOLEAN DEFAULT 0,           -- Primary contact for organization
  notes TEXT,
  is_active BOOLEAN DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_organizations_type ON organizations(type);
CREATE INDEX IF NOT EXISTS idx_organizations_category ON organizations(category);
CREATE INDEX IF NOT EXISTS idx_organizations_active ON organizations(is_active);
CREATE INDEX IF NOT EXISTS idx_contact_persons_org ON contact_persons(organization_id);
CREATE INDEX IF NOT EXISTS idx_contact_persons_primary ON contact_persons(is_primary);
```

### API Endpoints:

```javascript
// Organizations CRUD
app.get('/api/organizations', (req, res) => {
  const { type, category, search } = req.query;
  
  let sql = 'SELECT * FROM organizations WHERE is_active = 1';
  const params = [];
  
  if (type) {
    sql += ' AND type = ?';
    params.push(type);
  }
  
  if (category) {
    sql += ' AND category = ?';
    params.push(category);
  }
  
  if (search) {
    sql += ' AND (name LIKE ? OR short_name LIKE ? OR email LIKE ?)';
    const searchParam = `%${search}%`;
    params.push(searchParam, searchParam, searchParam);
  }
  
  sql += ' ORDER BY name';
  
  res.json(rows(sql, params));
});

app.post('/api/organizations', (req, res) => {
  const { name, short_name, type, category, address, city, phone, email, website, notes } = req.body;
  
  const result = run(
    `INSERT INTO organizations (name, short_name, type, category, address, city, phone, email, website, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [name, short_name, type, category, address, city, phone, email, website, notes]
  );
  
  res.json({ success: true, id: result.lastInsertRowid });
});

// Contact Persons CRUD
app.get('/api/organizations/:orgId/contacts', (req, res) => {
  const contacts = rows(
    'SELECT * FROM contact_persons WHERE organization_id = ? AND is_active = 1 ORDER BY is_primary DESC, name',
    [req.params.orgId]
  );
  res.json(contacts);
});

app.post('/api/organizations/:orgId/contacts', (req, res) => {
  const { name, designation, department, email, phone, mobile, is_primary } = req.body;
  
  // If setting as primary, unset other primary contacts
  if (is_primary) {
    run('UPDATE contact_persons SET is_primary = 0 WHERE organization_id = ?', [req.params.orgId]);
  }
  
  const result = run(
    `INSERT INTO contact_persons (organization_id, name, designation, department, email, phone, mobile, is_primary)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [req.params.orgId, name, designation, department, email, phone, mobile, is_primary || 0]
  );
  
  res.json({ success: true, id: result.lastInsertRowid });
});
```

---

## 4. PROFESSIONAL LETTERHEAD & PDF GENERATION

### Comparison: Puppeteer vs PDFKit

#### Option 1: **Puppeteer** (Recommended for Complex Layouts)

**Pros:**
- Renders HTML/CSS to PDF (WYSIWYG)
- Perfect for letterheads with logos, headers, footers
- Can embed images, custom fonts, colors
- Can screenshot HTML for previews

**Cons:**
- Requires Chrome/Chromium (200MB+ footprint)
- Higher memory usage
- Slower than PDFKit

**Use Case:** Professional letterheads with complex designs, logos, seals

#### Option 2: **PDFKit** (Lightweight Alternative)

**Pros:**
- Programmatic PDF generation
- Low memory footprint
- Fast generation
- Vector graphics support

**Cons:**
- No HTML rendering
- Requires manual positioning
- Complex layouts need more code

**Use Case:** Simple documents, forms, reports

### Recommended Approach: **Puppeteer for kormopro.com**

#### Installation:
```bash
npm install puppeteer
```

#### Letterhead System Architecture:

**Database Schema:**
```sql
-- Add to firms table
ALTER TABLE firms ADD COLUMN logo_path TEXT;
ALTER TABLE firms ADD COLUMN seal_path TEXT;
ALTER TABLE firms ADD COLUMN signature_path TEXT;
ALTER TABLE firms ADD COLUMN letterhead_template_id INTEGER;

-- Letterhead Templates
CREATE TABLE IF NOT EXISTS letterhead_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  html_template TEXT NOT NULL,           -- HTML with placeholders
  css_styles TEXT,                       -- Custom CSS
  header_height INTEGER DEFAULT 150,     -- In pixels
  footer_height INTEGER DEFAULT 100,
  margin_top INTEGER DEFAULT 20,
  margin_bottom INTEGER DEFAULT 20,
  margin_left INTEGER DEFAULT 20,
  margin_right INTEGER DEFAULT 20,
  is_default BOOLEAN DEFAULT 0,
  preview_image TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Generated Letters
CREATE TABLE IF NOT EXISTS generated_letters (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  firm_id INTEGER NOT NULL,
  recipient_organization_id INTEGER,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,                    -- HTML body
  letter_date TEXT,
  reference_number TEXT,
  pdf_path TEXT,                         -- Path to generated PDF
  status TEXT DEFAULT 'draft',           -- draft, sent, archived
  created_by INTEGER,
  sent_at DATETIME,
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (firm_id) REFERENCES firms(id),
  FOREIGN KEY (recipient_organization_id) REFERENCES organizations(id)
);
```

#### Letterhead Template (HTML):
```html
<!-- letterhead_template.html -->
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    @page {
      size: A4;
      margin: 0;
    }
    body {
      margin: 0;
      padding: 0;
      font-family: 'Times New Roman', serif;
      font-size: 12pt;
      line-height: 1.6;
    }
    .letterhead-header {
      height: 150px;
      border-bottom: 2px solid #003366;
      padding: 20px;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .letterhead-logo {
      width: 80px;
      height: 80px;
    }
    .letterhead-company-info {
      flex: 1;
      text-align: center;
      margin: 0 20px;
    }
    .letterhead-company-name {
      font-size: 20pt;
      font-weight: bold;
      color: #003366;
      margin-bottom: 5px;
    }
    .letterhead-company-details {
      font-size: 9pt;
      color: #666;
    }
    .letterhead-seal {
      width: 60px;
      height: 60px;
    }
    .letter-body {
      padding: 30px 50px;
      min-height: 600px;
    }
    .letter-meta {
      text-align: right;
      margin-bottom: 30px;
    }
    .letter-content {
      text-align: justify;
      margin-bottom: 40px;
    }
    .letter-signature {
      margin-top: 60px;
    }
    .signature-image {
      width: 150px;
      margin-bottom: 10px;
    }
    .letterhead-footer {
      position: fixed;
      bottom: 0;
      width: 100%;
      height: 80px;
      border-top: 1px solid #ccc;
      padding: 15px 50px;
      font-size: 9pt;
      text-align: center;
      color: #666;
      background-color: #f9f9f9;
    }
  </style>
</head>
<body>
  <div class="letterhead-header">
    <img src="{{logo_url}}" class="letterhead-logo" alt="Company Logo">
    <div class="letterhead-company-info">
      <div class="letterhead-company-name">{{company_name}}</div>
      <div class="letterhead-company-details">
        {{address}}<br>
        Phone: {{phone}} | Email: {{email}} | Website: {{website}}
      </div>
    </div>
    <img src="{{seal_url}}" class="letterhead-seal" alt="Company Seal">
  </div>
  
  <div class="letter-body">
    <div class="letter-meta">
      <strong>Date:</strong> {{date}}<br>
      <strong>Ref:</strong> {{reference_number}}
    </div>
    
    <div style="margin-bottom: 20px;">
      <strong>To,</strong><br>
      {{recipient_name}}<br>
      {{recipient_designation}}<br>
      {{recipient_organization}}<br>
      {{recipient_address}}
    </div>
    
    <div style="margin-bottom: 20px;">
      <strong>Subject:</strong> {{subject}}
    </div>
    
    <div style="margin-bottom: 15px;">
      Dear Sir/Madam,
    </div>
    
    <div class="letter-content">
      {{body}}
    </div>
    
    <div style="margin-bottom: 15px;">
      Sincerely,
    </div>
    
    <div class="letter-signature">
      <img src="{{signature_url}}" class="signature-image" alt="Signature"><br>
      <strong>{{signatory_name}}</strong><br>
      {{signatory_designation}}<br>
      {{company_name}}
    </div>
  </div>
  
  <div class="letterhead-footer">
    {{footer_text}}
  </div>
</body>
</html>
```

#### PDF Generation Function:
```javascript
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

async function generateLetterPDF(letterId) {
  try {
    // Get letter data
    const letter = row('SELECT * FROM generated_letters WHERE id = ?', [letterId]);
    const firm = row('SELECT * FROM firms WHERE id = ?', [letter.firm_id]);
    const recipient = letter.recipient_organization_id 
      ? row('SELECT * FROM organizations WHERE id = ?', [letter.recipient_organization_id])
      : null;
    
    // Load template
    const templatePath = path.join(__dirname, 'templates', 'letterhead_template.html');
    let html = fs.readFileSync(templatePath, 'utf8');
    
    // Replace variables
    const variables = {
      logo_url: firm.logo_path ? `file://${path.resolve(firm.logo_path)}` : '',
      seal_url: firm.seal_path ? `file://${path.resolve(firm.seal_path)}` : '',
      signature_url: firm.signature_path ? `file://${path.resolve(firm.signature_path)}` : '',
      company_name: firm.name,
      address: firm.address,
      phone: firm.phone,
      email: firm.email,
      website: firm.website || '',
      date: letter.letter_date || new Date().toISOString().split('T')[0],
      reference_number: letter.reference_number || 'N/A',
      recipient_name: recipient?.name || 'N/A',
      recipient_designation: '',
      recipient_organization: recipient?.name || '',
      recipient_address: recipient?.address || '',
      subject: letter.subject,
      body: letter.body,
      signatory_name: firm.owner_name || 'Managing Director',
      signatory_designation: 'Managing Director',
      footer_text: `${firm.name} | ${firm.address} | Phone: ${firm.phone}`
    };
    
    Object.keys(variables).forEach(key => {
      html = html.replace(new RegExp(`{{${key}}}`, 'g'), variables[key] || '');
    });
    
    // Launch Puppeteer
    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    
    // Generate PDF
    const pdfDir = path.join(__dirname, 'uploads', 'letters', `firm_${letter.firm_id}`);
    fs.mkdirSync(pdfDir, { recursive: true });
    
    const pdfPath = path.join(pdfDir, `letter_${letterId}_${Date.now()}.pdf`);
    
    await page.pdf({
      path: pdfPath,
      format: 'A4',
      printBackground: true,
      margin: {
        top: '0px',
        right: '0px',
        bottom: '0px',
        left: '0px'
      }
    });
    
    await browser.close();
    
    // Update database
    run('UPDATE generated_letters SET pdf_path = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [pdfPath, letterId]);
    
    return { success: true, pdfPath };
    
  } catch (err) {
    console.error('PDF generation error:', err);
    throw err;
  }
}

// API endpoint
app.post('/api/letters/:id/generate-pdf', async (req, res) => {
  try {
    const result = await generateLetterPDF(req.params.id);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'PDF generation failed', message: err.message });
  }
});

// Download generated PDF
app.get('/api/letters/:id/pdf', (req, res) => {
  const letter = row('SELECT * FROM generated_letters WHERE id = ?', [req.params.id]);
  
  if (!letter || !letter.pdf_path) {
    return res.status(404).json({ error: 'PDF not found' });
  }
  
  res.download(letter.pdf_path, `Letter_${letter.reference_number}.pdf`);
});
```

---

## 5. IMPLEMENTATION ROADMAP

### Phase 1: File Upload & Preview (2-3 days)
1. Install multer: `npm install multer`
2. Create `/uploads` directory structure
3. Update document endpoints to handle file uploads
4. Add PDF.js CDN to app.html
5. Create preview modal and JavaScript functions
6. Test with various file types

### Phase 2: Organization Contacts (1-2 days)
1. Add organizations and contact_persons tables to schema.sql
2. Run database migration
3. Create API endpoints for CRUD operations
4. Build Organizations page UI (similar to Firms page)
5. Add contact management within organization view
6. Seed demo organizations

### Phase 3: Email System (2-3 days)
1. Install nodemailer: `npm install nodemailer`
2. Add email_config, email_templates, email_history tables
3. Create email configuration UI in admin panel
4. Build email composition interface
5. Create pre-defined templates (tender notifications, document expiry alerts, etc.)
6. Test with Gmail SMTP or CloudPanel mail server
7. Integrate with existing alert system

### Phase 4: Letterhead & PDF Generation (3-4 days)
1. Install puppeteer: `npm install puppeteer`
2. Add logo/seal/signature upload to firm profile
3. Create letterhead_templates and generated_letters tables
4. Design 2-3 professional letterhead templates
5. Build letter composer UI with WYSIWYG editor
6. Implement PDF generation function
7. Add email integration (send generated letters via email)
8. Test PDF output quality

### Phase 5: Testing & Deployment (1-2 days)
1. End-to-end testing of all features
2. Security audit (file upload validation, email injection prevention)
3. Performance testing (PDF generation speed, concurrent uploads)
4. Documentation for users
5. Deploy to VPS
6. PM2 restart and monitoring

**Total Estimated Time:** 9-14 days

---

## 6. SECURITY CONSIDERATIONS

### File Upload Security:
- ✅ Validate file types by extension AND MIME type
- ✅ Limit file sizes (10MB recommended)
- ✅ Sanitize filenames (remove special characters)
- ✅ Store outside public directory
- ✅ Serve through authenticated routes
- ✅ Scan uploads for malware (optional: ClamAV integration)
- ✅ Set proper permissions (chmod 644 for files)

### Email Security:
- ✅ Use app-specific passwords for Gmail
- ✅ Validate recipient email addresses
- ✅ Prevent email injection attacks (sanitize inputs)
- ✅ Rate limiting (prevent spam)
- ✅ SPF/DKIM/DMARC configuration for kormopro.com domain
- ✅ Encrypt SMTP credentials in production

### PDF Generation Security:
- ✅ Sanitize HTML input (prevent XSS in letterheads)
- ✅ Limit concurrent PDF generation (resource management)
- ✅ Set timeout for Puppeteer processes
- ✅ Clean up temporary files

### Access Control:
- ✅ Role-based permissions (admin, manager, viewer)
- ✅ Verify user has access to firm before viewing documents
- ✅ Audit logs for sensitive operations

---

## 7. PERFORMANCE OPTIMIZATION

### File Storage:
- Consider CDN for static assets (logos, seals)
- Implement lazy loading for document lists
- Compress images before upload
- Use thumbnail generation for image previews

### Email Queue:
- Implement background job queue (bull.js or node-resque)
- Batch email sending
- Retry failed emails with exponential backoff

### PDF Generation:
- Cache generated PDFs (don't regenerate if content unchanged)
- Use Puppeteer pool for concurrent requests
- Consider cloud-based PDF generation (DocRaptor, PDFShift) for scale

---

## 8. COST ANALYSIS

### Free/Open Source:
- Multer: Free
- PDF.js: Free
- Nodemailer: Free
- Puppeteer: Free
- Total: **$0/month**

### Paid Services (Optional):
- SendGrid: 100 emails/day free, $19.95/month for 50K emails
- CloudPanel Email: Included with VPS
- Chrome for Puppeteer: ~200MB disk space
- AWS SES: $0.10 per 1,000 emails
- Mailgun: 5,000 emails/month free

**Recommended for kormopro.com:** Use free options initially, upgrade to SendGrid or AWS SES if email volume exceeds 100/day.

---

## 9. ALTERNATIVE APPROACHES

### For File Preview:
- **Google Docs Viewer:** `https://docs.google.com/viewer?url=YOUR_FILE_URL&embedded=true`
  - Pros: No setup, handles many formats
  - Cons: Requires public URLs, privacy concerns

- **Microsoft Office Online:** Similar to Google Docs
  - Cons: Requires public URLs

- **LibreOffice Online:** Self-hosted
  - Pros: Complete control
  - Cons: Complex setup, resource-intensive

### For PDF Generation:
- **wkhtmltopdf:** CLI tool for HTML to PDF
  - Pros: Fast, simple
  - Cons: Deprecated, limited CSS support

- **jsPDF:** Client-side PDF generation
  - Pros: No server load
  - Cons: Limited features compared to Puppeteer

- **DocRaptor API:** Cloud-based PDF generation
  - Pros: Professional output, no server resources
  - Cons: Paid service ($15/month for 125 docs)

---

## 10. NEXT STEPS

After approval of this research, proceed with:

1. **Create detailed task breakdown** for each phase
2. **Set up development branch** for new features
3. **Install dependencies** and test locally
4. **Create database migrations** for new tables
5. **Build UI mockups** for approval
6. **Implement Phase 1** (File Upload & Preview)
7. **Test and get feedback** before moving to Phase 2

---

## CONCLUSION

All requested features are technically feasible with the existing Node.js/Express/SQLite stack. The recommended technology stack is:

- **File Upload:** Multer with DiskStorage
- **File Preview:** PDF.js + Native Browser
- **Email:** Nodemailer with SMTP
- **PDF Generation:** Puppeteer with HTML templates
- **Contacts:** SQLite database with hierarchical structure

**Total Development Time:** 9-14 days
**Additional Cost:** $0 (using open-source tools)
**Server Requirements:** No significant increase (Puppeteer adds ~200MB disk usage)

The system will provide kormopro.com with a complete document management, communication, and professional correspondence platform suitable for government tender work.

---

*Research compiled: January 2025*
*For: Big Office kormopro.com Enhancement Project*
