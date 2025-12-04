// server.js - Big Office - Comprehensive Tender Management System
const express = require('express');
const bodyParser = require('body-parser');
const Database = require('better-sqlite3');
const path = require('path');
const cors = require('cors');
const fs = require('fs');
const AlertGenerator = require('./alert-generator');

const DB_FILE = path.join(__dirname, 'data', 'tenders.db');
if (!fs.existsSync(DB_FILE)) {
  console.error('Database not found. Run `npm run init-db` first.');
  process.exit(1);
}

const db = new Database(DB_FILE, { readonly: false });
const app = express();

app.use(cors());
app.use(bodyParser.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Root redirect to login
app.get('/', (req, res) => {
  res.redirect('/login.html');
});

// Helper functions
const row = (sql, params = []) => db.prepare(sql).get(params);
const rows = (sql, params = []) => db.prepare(sql).all(params);
const run = (sql, params = []) => db.prepare(sql).run(params);

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
app.get('/api/firms', (req, res) => {
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
app.get('/api/firms/:id', (req, res) => {
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
app.post('/api/firms', (req, res) => {
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
app.delete('/api/firms/:id', (req, res) => {
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

app.get('/api/licenses', (req, res) => {
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

app.post('/api/licenses', (req, res) => {
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

app.delete('/api/licenses/:id', (req, res) => {
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

app.get('/api/enlistments', (req, res) => {
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

app.post('/api/enlistments', (req, res) => {
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

app.delete('/api/enlistments/:id', (req, res) => {
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

app.get('/api/tax-compliance', (req, res) => {
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

app.post('/api/tax-compliance', (req, res) => {
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

app.delete('/api/tax-compliance/:id', (req, res) => {
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

app.get('/api/bank-accounts', (req, res) => {
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

app.post('/api/bank-accounts', (req, res) => {
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

app.delete('/api/bank-accounts/:id', (req, res) => {
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

app.get('/api/pay-orders', (req, res) => {
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

app.post('/api/pay-orders', (req, res) => {
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

app.delete('/api/pay-orders/:id', (req, res) => {
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

app.get('/api/bank-guarantees', (req, res) => {
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

app.post('/api/bank-guarantees', (req, res) => {
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

app.delete('/api/bank-guarantees/:id', (req, res) => {
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

app.get('/api/loans', (req, res) => {
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

app.post('/api/loans', (req, res) => {
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

app.delete('/api/loans/:id', (req, res) => {
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

app.get('/api/tenders', (req, res) => {
  try {
    const status = req.query.status;
    const firmId = req.query.firm_id;
    
    let sql = `SELECT t.*, f.name as assigned_firm_name FROM tenders t 
               LEFT JOIN firms f ON t.assigned_firm_id = f.id WHERE 1=1`;
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

app.get('/api/tenders/:id', (req, res) => {
  try {
    const tender = row('SELECT * FROM tenders WHERE id = ?', [req.params.id]);
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

app.post('/api/tenders', (req, res) => {
  try {
    const d = req.body;
    
    if (d.id) {
      run(`UPDATE tenders SET tender_id=?, procuring_entity=?, official=?, proc_type=?, method=?, 
           briefDesc=?, itemNo=?, itemDesc=?, techSpec=?, quantity=?, pod=?, delivery=?, invRef=?, 
           docPrice=?, lastPurchase=?, lastSubmission=?, opening=?, tSec=?, validity=?, liquid=?, 
           tenderPrep=?, reqDocs=?, inspection=?, contact=?, tender_value=?, eligibility=?, 
           publication_date=?, site_visit_date=?, pre_bid_meeting=?, status=?, source=?, sector=?, 
           assigned_firm_id=?, is_consortium=?, document_path=?, notes=?, updated_at=CURRENT_TIMESTAMP 
           WHERE id=?`,
        [d.tender_id, d.procuring_entity, d.official, d.proc_type, d.method, d.briefDesc, d.itemNo,
         d.itemDesc, d.techSpec, d.quantity, d.pod, d.delivery, d.invRef, d.docPrice, d.lastPurchase,
         d.lastSubmission, d.opening, d.tSec, d.validity, d.liquid, d.tenderPrep, d.reqDocs, 
         d.inspection, d.contact, d.tender_value, d.eligibility, d.publication_date, d.site_visit_date,
         d.pre_bid_meeting, d.status, d.source, d.sector, d.assigned_firm_id, d.is_consortium, 
         d.document_path, d.notes, d.id]);
      res.json({ ok: true, id: d.id });
    } else {
      const info = run(`INSERT INTO tenders (tender_id, procuring_entity, official, proc_type, method, 
                        briefDesc, itemNo, itemDesc, techSpec, quantity, pod, delivery, invRef, docPrice, 
                        lastPurchase, lastSubmission, opening, tSec, validity, liquid, tenderPrep, reqDocs, 
                        inspection, contact, tender_value, eligibility, publication_date, site_visit_date, 
                        pre_bid_meeting, status, source, sector, assigned_firm_id, is_consortium, 
                        document_path, notes) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [d.tender_id||'', d.procuring_entity||'', d.official||'', d.proc_type||'', d.method||'', 
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

app.delete('/api/tenders/:id', (req, res) => {
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

app.get('/api/projects', (req, res) => {
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

app.get('/api/projects/:id', (req, res) => {
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

app.post('/api/projects', (req, res) => {
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

app.delete('/api/projects/:id', (req, res) => {
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

app.get('/api/alerts', (req, res) => {
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

app.post('/api/alerts/:id/acknowledge', (req, res) => {
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

app.get('/api/dashboard/stats', (req, res) => {
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

app.get('/api/contacts', (req, res) => {
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

app.post('/api/contacts', (req, res) => {
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

app.delete('/api/contacts/:id', (req, res) => {
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
app.get('/api/team-members', (req, res) => {
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
app.get('/api/team-members/:id', (req, res) => {
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
app.post('/api/team-members', (req, res) => {
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
app.put('/api/team-members/:id', (req, res) => {
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
app.delete('/api/team-members/:id', (req, res) => {
  try {
    run('DELETE FROM team_members WHERE id = ?', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'DB error' });
  }
});

// ============================================
// TASKS
// ============================================

// Get all tasks
app.get('/api/tasks', (req, res) => {
  try {
    const { status, assigned_to, priority, firm_id, tender_id, project_id } = req.query;
    let query = `
      SELECT t.*, 
        tm.name as assigned_to_name,
        f.name as firm_name,
        tn.tenderNo as tender_no,
        p.name as project_name
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
app.get('/api/tasks/:id', (req, res) => {
  try {
    const task = row(`
      SELECT t.*, 
        tm.name as assigned_to_name,
        tb.name as assigned_by_name,
        f.name as firm_name,
        tn.tenderNo as tender_no,
        p.name as project_name
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
app.post('/api/tasks', (req, res) => {
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
app.put('/api/tasks/:id', (req, res) => {
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
app.delete('/api/tasks/:id', (req, res) => {
  try {
    run('DELETE FROM tasks WHERE id = ?', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'DB error' });
  }
});

// Add comment to task
app.post('/api/tasks/:id/comments', (req, res) => {
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
app.get('/api/tasks/stats/overview', (req, res) => {
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
app.get('/api/suppliers', (req, res) => {
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
app.get('/api/suppliers/:id', (req, res) => {
  try {
    const supplier = row('SELECT * FROM suppliers WHERE id = ?', [req.params.id]);
    if (!supplier) return res.status(404).json({ error: 'Supplier not found' });
    
    // Get transaction history
    const transactions = rows(`
      SELECT st.*, p.name as project_name
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
app.post('/api/suppliers', (req, res) => {
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
app.put('/api/suppliers/:id', (req, res) => {
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
app.delete('/api/suppliers/:id', (req, res) => {
  try {
    run('DELETE FROM suppliers WHERE id = ?', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'DB error' });
  }
});

// Add supplier transaction
app.post('/api/suppliers/:id/transactions', (req, res) => {
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
app.get('/api/clients', (req, res) => {
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
app.get('/api/clients/:id', (req, res) => {
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
app.post('/api/clients', (req, res) => {
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
app.put('/api/clients/:id', (req, res) => {
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
app.delete('/api/clients/:id', (req, res) => {
  try {
    run('DELETE FROM clients WHERE id = ?', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'DB error' });
  }
});

// Add client contact
app.post('/api/clients/:id/contacts', (req, res) => {
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

// Login endpoint
app.post('/api/login', (req, res) => {
  try {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ ok: false, error: 'Username and password required' });
    }
    
    const user = row('SELECT * FROM users WHERE username = ? AND password = ?', [username, password]);
    
    if (!user) {
      return res.status(401).json({ ok: false, error: 'Invalid username or password' });
    }
    
    // Update last login
    run('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?', [user.id]);
    
    // Return user info (excluding password)
    const { password: _, ...userInfo } = user;
    res.json({ ok: true, user: userInfo });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: 'Server error' });
  }
});

// Get all users
app.get('/api/users', (req, res) => {
  try {
    const users = rows('SELECT id, username, full_name, email, mobile, role, department, designation, status, last_login, created_at FROM users ORDER BY full_name');
    res.json(users);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'DB error' });
  }
});

// Get single user
app.get('/api/users/:id', (req, res) => {
  try {
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

// Add user
app.post('/api/users', (req, res) => {
  try {
    const { username, password, full_name, email, mobile, role, permissions, firm_access, department, designation, photo_url, notes } = req.body;
    
    // Hash password (in production, use bcrypt)
    const hashedPassword = password; // TODO: implement proper password hashing
    
    const result = run(`
      INSERT INTO users (
        username, password, full_name, email, mobile, role, permissions,
        firm_access, department, designation, photo_url, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [username, hashedPassword, full_name, email, mobile, role || 'user', permissions, firm_access, department, designation, photo_url, notes]);
    
    res.json({ ok: true, id: result.lastInsertRowid });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'DB error' });
  }
});

// Update user
app.put('/api/users/:id', (req, res) => {
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
app.delete('/api/users/:id', (req, res) => {
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
app.get('/api/tender-summaries', (req, res) => {
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
app.get('/api/tender-summaries/:id', (req, res) => {
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
app.post('/api/tender-summaries', (req, res) => {
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
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
app.put('/api/tender-summaries/:id', (req, res) => {
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
app.delete('/api/tender-summaries/:id', (req, res) => {
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
app.post('/api/alerts/generate', (req, res) => {
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
app.get('/api/alerts/stats', (req, res) => {
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
app.get('/api/letter-categories', (req, res) => {
  const rows = all('SELECT * FROM letter_categories ORDER BY name');
  res.json(rows);
});

app.post('/api/letter-categories', (req, res) => {
  const { name, description, icon } = req.body;
  const result = run(
    'INSERT INTO letter_categories (name, description, icon) VALUES (?, ?, ?)',
    [name, description, icon]
  );
  res.json({ id: result.lastInsertRowid, name, description, icon });
});

app.put('/api/letter-categories/:id', (req, res) => {
  const { name, description, icon } = req.body;
  run(
    'UPDATE letter_categories SET name = ?, description = ?, icon = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
    [name, description, icon, req.params.id]
  );
  res.json({ success: true });
});

app.delete('/api/letter-categories/:id', (req, res) => {
  run('DELETE FROM letter_categories WHERE id = ?', [req.params.id]);
  res.json({ success: true });
});

// Letter Templates
app.get('/api/letter-templates', (req, res) => {
  const rows = all(`
    SELECT lt.*, lc.name as category_name, u.username as created_by_name
    FROM letter_templates lt
    LEFT JOIN letter_categories lc ON lt.category_id = lc.id
    LEFT JOIN users u ON lt.created_by = u.id
    ORDER BY lt.created_at DESC
  `);
  res.json(rows);
});

app.get('/api/letter-templates/:id', (req, res) => {
  const template = row('SELECT * FROM letter_templates WHERE id = ?', [req.params.id]);
  if (!template) return res.status(404).json({ error: 'Template not found' });
  res.json(template);
});

app.post('/api/letter-templates', (req, res) => {
  const { category_id, title, subject, content, tags, language, is_official, notes, created_by } = req.body;
  const result = run(
    `INSERT INTO letter_templates (category_id, title, subject, content, tags, language, is_official, notes, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [category_id, title, subject, content, tags, language || 'en', is_official !== false ? 1 : 0, notes, created_by]
  );
  res.json({ id: result.lastInsertRowid });
});

app.put('/api/letter-templates/:id', (req, res) => {
  const { category_id, title, subject, content, tags, language, is_official, status, notes } = req.body;
  run(
    `UPDATE letter_templates SET category_id = ?, title = ?, subject = ?, content = ?, tags = ?, 
     language = ?, is_official = ?, status = ?, notes = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    [category_id, title, subject, content, tags, language, is_official, status, notes, req.params.id]
  );
  run('UPDATE letter_templates SET usage_count = usage_count + 1 WHERE id = ?', [req.params.id]);
  res.json({ success: true });
});

app.delete('/api/letter-templates/:id', (req, res) => {
  run('DELETE FROM letter_templates WHERE id = ?', [req.params.id]);
  res.json({ success: true });
});

// Generated Letters
app.get('/api/generated-letters', (req, res) => {
  const rows = all(`
    SELECT gl.*, f.name as firm_name, p.name as project_name, u.username as generated_by_name
    FROM generated_letters gl
    LEFT JOIN firms f ON gl.firm_id = f.id
    LEFT JOIN projects p ON gl.project_id = p.id
    LEFT JOIN users u ON gl.generated_by = u.id
    ORDER BY gl.created_at DESC
  `);
  res.json(rows);
});

app.get('/api/generated-letters/:id', (req, res) => {
  const letter = row('SELECT * FROM generated_letters WHERE id = ?', [req.params.id]);
  if (!letter) return res.status(404).json({ error: 'Letter not found' });
  res.json(letter);
});

app.post('/api/generated-letters', (req, res) => {
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

app.put('/api/generated-letters/:id', (req, res) => {
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

app.delete('/api/generated-letters/:id', (req, res) => {
  run('DELETE FROM generated_letters WHERE id = ?', [req.params.id]);
  res.json({ success: true });
});

// ============================================
// EXPENSE MANAGER API
// ============================================

// Expense Categories
app.get('/api/expense-categories', (req, res) => {
  const rows = all('SELECT * FROM expense_categories WHERE is_active = 1 ORDER BY name');
  res.json(rows);
});

app.post('/api/expense-categories', (req, res) => {
  const { name, parent_id, description, budget_limit, icon } = req.body;
  const result = run(
    'INSERT INTO expense_categories (name, parent_id, description, budget_limit, icon) VALUES (?, ?, ?, ?, ?)',
    [name, parent_id, description, budget_limit, icon]
  );
  res.json({ id: result.lastInsertRowid });
});

app.put('/api/expense-categories/:id', (req, res) => {
  const { name, description, budget_limit, icon, is_active } = req.body;
  run(
    'UPDATE expense_categories SET name = ?, description = ?, budget_limit = ?, icon = ?, is_active = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
    [name, description, budget_limit, icon, is_active, req.params.id]
  );
  res.json({ success: true });
});

app.delete('/api/expense-categories/:id', (req, res) => {
  run('UPDATE expense_categories SET is_active = 0 WHERE id = ?', [req.params.id]);
  res.json({ success: true });
});

// Expenses
app.get('/api/expenses', (req, res) => {
  const { status, firm_id, project_id, start_date, end_date } = req.query;
  let sql = `
    SELECT e.*, ec.name as category_name, ec.icon as category_icon,
           f.name as firm_name, p.name as project_name, u.username as created_by_name
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
    SELECT eb.*, ec.name as category_name, p.name as project_name
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
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Big Office running on http://localhost:${PORT}`));
