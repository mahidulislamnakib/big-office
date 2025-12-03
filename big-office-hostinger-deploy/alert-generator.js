// alert-generator.js - Automated Alert Generation System
const Database = require('better-sqlite3');
const path = require('path');

const DB_FILE = path.join(__dirname, 'data', 'tenders.db');
const db = new Database(DB_FILE, { readonly: false });

class AlertGenerator {
  constructor() {
    this.alertTypes = {
      LICENSE_EXPIRY: 'license_expiry',
      ENLISTMENT_EXPIRY: 'enlistment_expiry',
      BG_EXPIRY: 'bg_expiry',
      TAX_DEADLINE: 'tax_deadline',
      TENDER_DEADLINE: 'tender_deadline',
      LOAN_PAYMENT: 'loan_payment'
    };
  }

  // Main function to generate all alerts
  generateAllAlerts() {
    console.log('Starting alert generation...');
    
    // Clear old completed/dismissed alerts
    this.cleanupOldAlerts();
    
    // Generate alerts for each category
    this.generateLicenseAlerts();
    this.generateEnlistmentAlerts();
    this.generateBankGuaranteeAlerts();
    this.generateTaxAlerts();
    this.generateTenderAlerts();
    this.generateLoanAlerts();
    
    console.log('Alert generation completed!');
  }

  cleanupOldAlerts() {
    // Delete completed/dismissed alerts older than 30 days
    db.prepare(`
      DELETE FROM alerts 
      WHERE status IN ('completed', 'dismissed') 
      AND created_at < date('now', '-30 days')
    `).run();
  }

  generateLicenseAlerts() {
    const licenses = db.prepare(`
      SELECT l.*, f.name as firm_name 
      FROM licenses l
      LEFT JOIN firms f ON l.firm_id = f.id
      WHERE l.status = 'active' 
      AND l.expiry_date IS NOT NULL
      AND l.expiry_date != ''
      AND date(l.expiry_date) <= date('now', '+60 days')
    `).all();

    licenses.forEach(license => {
      const daysUntilExpiry = this.getDaysUntilDate(license.expiry_date);
      
      if (daysUntilExpiry <= 60 && !this.alertExists('license', license.id)) {
        const priority = daysUntilExpiry <= 7 ? 'high' : daysUntilExpiry <= 30 ? 'medium' : 'low';
        const licenseTypeFormatted = this.formatLicenseType(license.license_type);
        
        this.createAlert({
          alert_type: this.alertTypes.LICENSE_EXPIRY,
          reference_type: 'license',
          reference_id: license.id,
          firm_id: license.firm_id,
          title: `${licenseTypeFormatted} expiring soon`,
          message: `${licenseTypeFormatted} for ${license.firm_name} expires in ${daysUntilExpiry} days`,
          alert_date: this.getAlertDate(daysUntilExpiry),
          due_date: license.expiry_date,
          priority: priority
        });
      }
    });
  }

  generateEnlistmentAlerts() {
    const enlistments = db.prepare(`
      SELECT e.*, f.name as firm_name 
      FROM enlistments e
      LEFT JOIN firms f ON e.firm_id = f.id
      WHERE e.status = 'active' 
      AND e.expiry_date IS NOT NULL
      AND e.expiry_date != ''
      AND date(e.expiry_date) <= date('now', '+90 days')
    `).all();

    enlistments.forEach(enlistment => {
      const daysUntilExpiry = this.getDaysUntilDate(enlistment.expiry_date);
      
      if (daysUntilExpiry <= 90 && !this.alertExists('enlistment', enlistment.id)) {
        const priority = daysUntilExpiry <= 30 ? 'high' : daysUntilExpiry <= 60 ? 'medium' : 'low';
        
        this.createAlert({
          alert_type: this.alertTypes.ENLISTMENT_EXPIRY,
          reference_type: 'enlistment',
          reference_id: enlistment.id,
          firm_id: enlistment.firm_id,
          title: `${enlistment.authority} enlistment expiring`,
          message: `${enlistment.authority} (${enlistment.category}) for ${enlistment.firm_name} expires in ${daysUntilExpiry} days`,
          alert_date: this.getAlertDate(daysUntilExpiry),
          due_date: enlistment.expiry_date,
          priority: priority
        });
      }
    });
  }

  generateBankGuaranteeAlerts() {
    const guarantees = db.prepare(`
      SELECT bg.*, f.name as firm_name 
      FROM bank_guarantees bg
      LEFT JOIN firms f ON bg.firm_id = f.id
      WHERE bg.status = 'active' 
      AND bg.expiry_date IS NOT NULL
      AND bg.expiry_date != ''
      AND date(bg.expiry_date) <= date('now', '+30 days')
    `).all();

    guarantees.forEach(bg => {
      const daysUntilExpiry = this.getDaysUntilDate(bg.expiry_date);
      
      if (daysUntilExpiry <= 30 && !this.alertExists('bank_guarantee', bg.id)) {
        const priority = daysUntilExpiry <= 7 ? 'high' : daysUntilExpiry <= 15 ? 'medium' : 'low';
        
        this.createAlert({
          alert_type: this.alertTypes.BG_EXPIRY,
          reference_type: 'bank_guarantee',
          reference_id: bg.id,
          firm_id: bg.firm_id,
          title: `Bank Guarantee expiring soon`,
          message: `${bg.bg_type} (${bg.bg_number}) for ${bg.firm_name} - Amount: ৳${bg.amount} expires in ${daysUntilExpiry} days`,
          alert_date: this.getAlertDate(daysUntilExpiry),
          due_date: bg.expiry_date,
          priority: priority
        });
      }
    });
  }

  generateTaxAlerts() {
    const taxItems = db.prepare(`
      SELECT t.*, f.name as firm_name 
      FROM tax_compliance t
      LEFT JOIN firms f ON t.firm_id = f.id
      WHERE t.status = 'pending' 
      AND t.due_date IS NOT NULL
      AND t.due_date != ''
      AND date(t.due_date) <= date('now', '+15 days')
    `).all();

    taxItems.forEach(tax => {
      const daysUntilDue = this.getDaysUntilDate(tax.due_date);
      
      if (daysUntilDue <= 15 && !this.alertExists('tax_compliance', tax.id)) {
        const priority = daysUntilDue <= 3 ? 'high' : daysUntilDue <= 7 ? 'medium' : 'low';
        
        this.createAlert({
          alert_type: this.alertTypes.TAX_DEADLINE,
          reference_type: 'tax_compliance',
          reference_id: tax.id,
          firm_id: tax.firm_id,
          title: `Tax compliance deadline approaching`,
          message: `${tax.compliance_type} for ${tax.firm_name} (${tax.fiscal_year}) due in ${daysUntilDue} days`,
          alert_date: this.getAlertDate(daysUntilDue),
          due_date: tax.due_date,
          priority: priority
        });
      }
    });
  }

  generateTenderAlerts() {
    const tenders = db.prepare(`
      SELECT t.*, f.name as firm_name 
      FROM tenders t
      LEFT JOIN firms f ON t.assigned_firm_id = f.id
      WHERE t.status IN ('discovered', 'evaluated', 'preparing')
      AND t.lastSubmission IS NOT NULL
      AND t.lastSubmission != ''
      AND date(t.lastSubmission) <= date('now', '+7 days')
    `).all();

    tenders.forEach(tender => {
      const daysUntilSubmission = this.getDaysUntilDate(tender.lastSubmission);
      
      if (daysUntilSubmission <= 7 && !this.alertExists('tender', tender.id)) {
        const priority = daysUntilSubmission <= 2 ? 'high' : daysUntilSubmission <= 5 ? 'medium' : 'low';
        
        this.createAlert({
          alert_type: this.alertTypes.TENDER_DEADLINE,
          reference_type: 'tender',
          reference_id: tender.id,
          firm_id: tender.assigned_firm_id,
          title: `Tender submission deadline approaching`,
          message: `${tender.tender_id} - ${tender.procuring_entity} submission in ${daysUntilSubmission} days`,
          alert_date: this.getAlertDate(daysUntilSubmission),
          due_date: tender.lastSubmission,
          priority: priority
        });
      }
    });
  }

  generateLoanAlerts() {
    const loans = db.prepare(`
      SELECT l.*, f.name as firm_name 
      FROM loans l
      LEFT JOIN firms f ON l.firm_id = f.id
      WHERE l.status = 'active' 
      AND l.maturity_date IS NOT NULL
      AND l.maturity_date != ''
      AND date(l.maturity_date) <= date('now', '+30 days')
    `).all();

    loans.forEach(loan => {
      const daysUntilMaturity = this.getDaysUntilDate(loan.maturity_date);
      
      if (daysUntilMaturity <= 30 && !this.alertExists('loan', loan.id)) {
        const priority = daysUntilMaturity <= 7 ? 'high' : daysUntilMaturity <= 15 ? 'medium' : 'low';
        
        this.createAlert({
          alert_type: this.alertTypes.LOAN_PAYMENT,
          reference_type: 'loan',
          reference_id: loan.id,
          firm_id: loan.firm_id,
          title: `Loan maturity approaching`,
          message: `${loan.loan_type} (${loan.bank_name}) for ${loan.firm_name} - Outstanding: ৳${loan.outstanding_amount} matures in ${daysUntilMaturity} days`,
          alert_date: this.getAlertDate(daysUntilMaturity),
          due_date: loan.maturity_date,
          priority: priority
        });
      }
    });
  }

  createAlert(data) {
    try {
      db.prepare(`
        INSERT INTO alerts (alert_type, reference_type, reference_id, firm_id, title, message, 
                           alert_date, due_date, priority, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
      `).run([
        data.alert_type,
        data.reference_type,
        data.reference_id,
        data.firm_id,
        data.title,
        data.message,
        data.alert_date,
        data.due_date,
        data.priority
      ]);
      
      console.log(`✓ Created alert: ${data.title}`);
    } catch (err) {
      console.error('Error creating alert:', err.message);
    }
  }

  alertExists(referenceType, referenceId) {
    const existing = db.prepare(`
      SELECT id FROM alerts 
      WHERE reference_type = ? 
      AND reference_id = ? 
      AND status = 'pending'
    `).get(referenceType, referenceId);
    
    return !!existing;
  }

  getDaysUntilDate(dateStr) {
    if (!dateStr) return 999;
    
    const targetDate = new Date(dateStr);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const diffTime = targetDate - today;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    return diffDays;
  }

  getAlertDate(daysUntil) {
    const today = new Date();
    return today.toISOString().split('T')[0];
  }

  // Format license type for display
  formatLicenseType(type) {
    const typeMap = {
      'trade_license': 'Trade License',
      'tin': 'TIN',
      'vat': 'VAT',
      'irc': 'IRC',
      'fire': 'Fire License',
      'environmental': 'Environmental License'
    };
    return typeMap[type] || type.split('_').map(word => 
      word.charAt(0).toUpperCase() + word.slice(1)
    ).join(' ');
  }

  // Generate summary report
  generateReport() {
    const report = {
      high: db.prepare("SELECT COUNT(*) as count FROM alerts WHERE priority = 'high' AND status = 'pending'").get(),
      medium: db.prepare("SELECT COUNT(*) as count FROM alerts WHERE priority = 'medium' AND status = 'pending'").get(),
      low: db.prepare("SELECT COUNT(*) as count FROM alerts WHERE priority = 'low' AND status = 'pending'").get(),
      total: db.prepare("SELECT COUNT(*) as count FROM alerts WHERE status = 'pending'").get()
    };

    console.log('\n=== Alert Summary ===');
    console.log(`🔴 High Priority: ${report.high.count}`);
    console.log(`🟡 Medium Priority: ${report.medium.count}`);
    console.log(`🟢 Low Priority: ${report.low.count}`);
    console.log(`📊 Total Pending: ${report.total.count}`);
    console.log('====================\n');

    return report;
  }
}

// Run if executed directly
if (require.main === module) {
  const generator = new AlertGenerator();
  generator.generateAllAlerts();
  generator.generateReport();
  process.exit(0);
}

module.exports = AlertGenerator;
