const PDFDocument = require('pdfkit');
const ExcelJS = require('exceljs');
const fs = require('fs');
const path = require('path');

/**
 * Report Generator Utility
 * Generates PDF and Excel reports for all platform modules
 */

class ReportGenerator {
  constructor(db) {
    this.db = db;
  }

  /**
   * Generate PDF Report
   */
  async generatePDF(reportType, data, options = {}) {
    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({ 
          margin: 50,
          size: 'A4',
          bufferPages: true
        });
        
        const chunks = [];
        doc.on('data', chunk => chunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);

        // Header
        this.addPDFHeader(doc, reportType, options);
        
        // Content based on report type
        switch(reportType) {
          case 'firms':
            this.generateFirmsPDF(doc, data);
            break;
          case 'tenders':
            this.generateTendersPDF(doc, data);
            break;
          case 'tender-summary':
            this.generateTenderSummaryPDF(doc, data);
            break;
          case 'financial':
            this.generateFinancialPDF(doc, data);
            break;
          case 'projects':
            this.generateProjectsPDF(doc, data);
            break;
          case 'expenses':
            this.generateExpensesPDF(doc, data);
            break;
          case 'team':
            this.generateTeamPDF(doc, data);
            break;
          case 'contacts':
            this.generateContactsPDF(doc, data);
            break;
          case 'licenses':
            this.generateLicensesPDF(doc, data);
            break;
          case 'comprehensive':
            this.generateComprehensivePDF(doc, data);
            break;
          default:
            throw new Error('Unknown report type');
        }

        // Footer
        this.addPDFFooter(doc);
        
        doc.end();
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Generate Excel Report
   */
  async generateExcel(reportType, data, options = {}) {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Big Office ERP';
    workbook.created = new Date();
    
    switch(reportType) {
      case 'firms':
        this.generateFirmsExcel(workbook, data);
        break;
      case 'tenders':
        this.generateTendersExcel(workbook, data);
        break;
      case 'tender-summary':
        this.generateTenderSummaryExcel(workbook, data);
        break;
      case 'financial':
        this.generateFinancialExcel(workbook, data);
        break;
      case 'projects':
        this.generateProjectsExcel(workbook, data);
        break;
      case 'expenses':
        this.generateExpensesExcel(workbook, data);
        break;
      case 'team':
        this.generateTeamExcel(workbook, data);
        break;
      case 'contacts':
        this.generateContactsExcel(workbook, data);
        break;
      case 'licenses':
        this.generateLicensesExcel(workbook, data);
        break;
      case 'comprehensive':
        this.generateComprehensiveExcel(workbook, data);
        break;
      default:
        throw new Error('Unknown report type');
    }

    return await workbook.xlsx.writeBuffer();
  }

  // ==================== PDF Generators ====================

  addPDFHeader(doc, reportType, options) {
    doc.fontSize(20).text('Big Office ERP', { align: 'center' });
    doc.fontSize(16).text(`${this.formatReportTitle(reportType)} Report`, { align: 'center' });
    doc.fontSize(10).text(`Generated: ${new Date().toLocaleString()}`, { align: 'center' });
    
    if (options.firmName) {
      doc.text(`Firm: ${options.firmName}`, { align: 'center' });
    }
    
    if (options.dateRange) {
      doc.text(`Period: ${options.dateRange}`, { align: 'center' });
    }
    
    doc.moveDown(2);
  }

  addPDFFooter(doc) {
    const pages = doc.bufferedPageRange();
    for (let i = 0; i < pages.count; i++) {
      doc.switchToPage(i);
      doc.fontSize(8).text(
        `Page ${i + 1} of ${pages.count}`,
        50,
        doc.page.height - 50,
        { align: 'center' }
      );
    }
  }

  generateFirmsPDF(doc, firms) {
    doc.fontSize(14).text('Firms Summary', { underline: true });
    doc.moveDown();
    
    firms.forEach((firm, index) => {
      doc.fontSize(12).text(`${index + 1}. ${firm.name}`, { bold: true });
      doc.fontSize(10);
      doc.text(`Registration: ${firm.registration_no || 'N/A'}`);
      doc.text(`Type: ${firm.type || 'N/A'}`);
      doc.text(`Address: ${firm.address || 'N/A'}`);
      doc.text(`Contact: ${firm.contact_person || 'N/A'} - ${firm.phone || 'N/A'}`);
      doc.text(`Email: ${firm.email || 'N/A'}`);
      doc.text(`Status: ${firm.status || 'N/A'}`);
      doc.moveDown();
    });
  }

  generateTendersPDF(doc, tenders) {
    doc.fontSize(14).text('Tenders Summary', { underline: true });
    doc.moveDown();
    
    tenders.forEach((tender, index) => {
      doc.fontSize(12).text(`${index + 1}. ${tender.title || tender.tender_no}`, { bold: true });
      doc.fontSize(10);
      doc.text(`Tender No: ${tender.tender_no || 'N/A'}`);
      doc.text(`Procuring Entity: ${tender.procuring_entity || 'N/A'}`);
      doc.text(`Type: ${tender.tender_type || 'N/A'}`);
      doc.text(`Budget: ${tender.estimated_budget ? '৳' + tender.estimated_budget.toLocaleString() : 'N/A'}`);
      doc.text(`Submission: ${tender.submission_deadline || 'N/A'}`);
      doc.text(`Status: ${tender.status || 'N/A'}`);
      doc.moveDown();
    });
  }

  generateTenderSummaryPDF(doc, summary) {
    doc.fontSize(14).text('Tender Summary Report', { underline: true });
    doc.moveDown();
    
    // Basic Info
    doc.fontSize(12).text('Basic Information', { bold: true });
    doc.fontSize(10);
    doc.text(`e-GP Tender ID: ${summary.egp_tender_id || 'N/A'}`);
    doc.text(`Procuring Entity: ${summary.procuring_entity || 'N/A'}`);
    doc.text(`Official Inviting: ${summary.official_inviting_tender || 'N/A'}`);
    doc.text(`Description: ${summary.brief_description || 'N/A'}`);
    doc.moveDown();
    
    // Timeline
    doc.fontSize(12).text('Timeline', { bold: true });
    doc.fontSize(10);
    doc.text(`Invitation Date: ${summary.invitation_date || 'N/A'}`);
    doc.text(`Document Purchase Deadline: ${summary.document_purchase_deadline || 'N/A'}`);
    doc.text(`Submission Deadline: ${summary.submission_deadline || 'N/A'}`);
    doc.text(`Opening Date: ${summary.tender_opening_date || 'N/A'}`);
    doc.moveDown();
    
    // Financial
    doc.fontSize(12).text('Financial Information', { bold: true });
    doc.fontSize(10);
    doc.text(`Document Price: ৳${summary.document_price || 0}`);
    doc.text(`Tender Security: ৳${summary.tender_security_amount || 0}`);
    doc.text(`Estimated Value: ৳${summary.estimated_tender_value || 0}`);
    doc.text(`Our Estimate: ৳${summary.our_estimated_cost || 0}`);
    doc.text(`Profit Margin: ${summary.profit_margin || 0}%`);
    doc.moveDown();
    
    // Risk Assessment
    if (summary.risk_level) {
      doc.fontSize(12).text('Risk Assessment', { bold: true });
      doc.fontSize(10);
      doc.text(`Risk Level: ${summary.risk_level}`);
      doc.text(`Risks: ${summary.risks || 'N/A'}`);
      doc.text(`Mitigation: ${summary.mitigation_plans || 'N/A'}`);
      doc.moveDown();
    }
    
    // Decision Support
    doc.fontSize(12).text('Decision Support', { bold: true });
    doc.fontSize(10);
    doc.text(`Recommendation: ${summary.recommendation || 'N/A'}`);
    doc.text(`Confidence Level: ${summary.confidence_level || 'N/A'}`);
    doc.text(`Executive Summary: ${summary.executive_summary || 'N/A'}`);
    
    // Items
    if (summary.items && summary.items.length > 0) {
      doc.addPage();
      doc.fontSize(14).text('Tender Items', { underline: true });
      doc.moveDown();
      
      summary.items.forEach((item, index) => {
        doc.fontSize(10);
        doc.text(`${index + 1}. ${item.description || 'N/A'}`);
        doc.text(`   Quantity: ${item.quantity || 0} ${item.unit || ''}`);
        doc.text(`   Unit Rate: ৳${item.unit_rate || 0}`);
        doc.text(`   Total: ৳${item.total_amount || 0}`);
        doc.moveDown(0.5);
      });
    }
  }

  generateFinancialPDF(doc, data) {
    doc.fontSize(14).text('Financial Summary', { underline: true });
    doc.moveDown();
    
    // Bank Accounts
    if (data.bankAccounts && data.bankAccounts.length > 0) {
      doc.fontSize(12).text('Bank Accounts', { bold: true });
      doc.fontSize(10);
      data.bankAccounts.forEach(acc => {
        doc.text(`${acc.bank_name} - ${acc.account_no} (${acc.account_type})`);
        doc.text(`Balance: ৳${acc.balance || 0}`);
        doc.moveDown(0.5);
      });
      doc.moveDown();
    }
    
    // Loans
    if (data.loans && data.loans.length > 0) {
      doc.fontSize(12).text('Loans', { bold: true });
      doc.fontSize(10);
      data.loans.forEach(loan => {
        doc.text(`${loan.loan_type} - ${loan.bank_name}`);
        doc.text(`Amount: ৳${loan.loan_amount}, Outstanding: ৳${loan.outstanding_balance}`);
        doc.moveDown(0.5);
      });
      doc.moveDown();
    }
    
    // Bank Guarantees
    if (data.guarantees && data.guarantees.length > 0) {
      doc.fontSize(12).text('Bank Guarantees', { bold: true });
      doc.fontSize(10);
      data.guarantees.forEach(bg => {
        doc.text(`${bg.guarantee_type} - ${bg.guarantee_no}`);
        doc.text(`Amount: ৳${bg.amount}, Valid until: ${bg.expiry_date}`);
        doc.moveDown(0.5);
      });
    }
  }

  generateProjectsPDF(doc, projects) {
    doc.fontSize(14).text('Projects Summary', { underline: true });
    doc.moveDown();
    
    projects.forEach((project, index) => {
      doc.fontSize(12).text(`${index + 1}. ${project.project_name}`, { bold: true });
      doc.fontSize(10);
      doc.text(`Project No: ${project.project_no || 'N/A'}`);
      doc.text(`Client: ${project.client_name || 'N/A'}`);
      doc.text(`Value: ৳${project.contract_value || 0}`);
      doc.text(`Start: ${project.start_date || 'N/A'}`);
      doc.text(`End: ${project.completion_date || 'N/A'}`);
      doc.text(`Status: ${project.status || 'N/A'}`);
      doc.text(`Progress: ${project.progress || 0}%`);
      doc.moveDown();
    });
  }

  generateExpensesPDF(doc, expenses) {
    doc.fontSize(14).text('Expenses Report', { underline: true });
    doc.moveDown();
    
    let total = 0;
    const categoryTotals = {};
    
    expenses.forEach(expense => {
      total += expense.amount || 0;
      const cat = expense.category_name || 'Uncategorized';
      categoryTotals[cat] = (categoryTotals[cat] || 0) + expense.amount;
    });
    
    doc.fontSize(12).text(`Total Expenses: ৳${total.toLocaleString()}`, { bold: true });
    doc.moveDown();
    
    doc.fontSize(12).text('By Category', { bold: true });
    doc.fontSize(10);
    Object.entries(categoryTotals).forEach(([cat, amount]) => {
      doc.text(`${cat}: ৳${amount.toLocaleString()}`);
    });
    doc.moveDown();
    
    doc.fontSize(12).text('Expense Details', { bold: true });
    doc.fontSize(10);
    expenses.forEach((expense, index) => {
      doc.text(`${index + 1}. ${expense.description || 'N/A'} - ৳${expense.amount || 0}`);
      doc.text(`   Category: ${expense.category_name || 'N/A'}, Date: ${expense.expense_date || 'N/A'}`);
      doc.moveDown(0.5);
    });
  }

  generateTeamPDF(doc, team) {
    doc.fontSize(14).text('Team Members', { underline: true });
    doc.moveDown();
    
    team.forEach((member, index) => {
      doc.fontSize(12).text(`${index + 1}. ${member.name}`, { bold: true });
      doc.fontSize(10);
      doc.text(`Designation: ${member.designation || 'N/A'}`);
      doc.text(`Department: ${member.department || 'N/A'}`);
      doc.text(`Email: ${member.email || 'N/A'}`);
      doc.text(`Phone: ${member.phone || 'N/A'}`);
      doc.text(`Joining Date: ${member.joining_date || 'N/A'}`);
      doc.text(`Status: ${member.status || 'N/A'}`);
      doc.moveDown();
    });
  }

  generateContactsPDF(doc, contacts) {
    doc.fontSize(14).text('Contacts Directory', { underline: true });
    doc.moveDown();
    
    const grouped = {};
    contacts.forEach(contact => {
      const type = contact.contact_type || 'Other';
      if (!grouped[type]) grouped[type] = [];
      grouped[type].push(contact);
    });
    
    Object.entries(grouped).forEach(([type, list]) => {
      doc.fontSize(12).text(`${type.toUpperCase()}`, { bold: true });
      doc.fontSize(10);
      list.forEach(contact => {
        doc.text(`• ${contact.name} - ${contact.designation || ''}`);
        doc.text(`  ${contact.email || 'N/A'} | ${contact.phone || 'N/A'}`);
        doc.moveDown(0.5);
      });
      doc.moveDown();
    });
  }

  generateLicensesPDF(doc, licenses) {
    doc.fontSize(14).text('Licenses & Registrations', { underline: true });
    doc.moveDown();
    
    licenses.forEach((license, index) => {
      doc.fontSize(12).text(`${index + 1}. ${license.license_type || 'License'}`, { bold: true });
      doc.fontSize(10);
      doc.text(`License No: ${license.license_no || 'N/A'}`);
      doc.text(`Issuing Authority: ${license.issuing_authority || 'N/A'}`);
      doc.text(`Issue Date: ${license.issue_date || 'N/A'}`);
      doc.text(`Expiry Date: ${license.expiry_date || 'N/A'}`);
      doc.text(`Status: ${license.status || 'N/A'}`);
      doc.moveDown();
    });
  }

  generateComprehensivePDF(doc, data) {
    // Executive Summary
    doc.fontSize(16).text('Comprehensive Business Report', { underline: true });
    doc.moveDown();
    
    doc.fontSize(12).text('Executive Summary', { bold: true });
    doc.fontSize(10);
    doc.text(`Total Firms: ${data.stats.totalFirms || 0}`);
    doc.text(`Active Tenders: ${data.stats.activeTenders || 0}`);
    doc.text(`Ongoing Projects: ${data.stats.ongoingProjects || 0}`);
    doc.text(`Total Team Members: ${data.stats.totalTeam || 0}`);
    doc.moveDown(2);
    
    // Add summary from each module
    if (data.firms) {
      doc.addPage();
      this.generateFirmsPDF(doc, data.firms);
    }
    
    if (data.tenders) {
      doc.addPage();
      this.generateTendersPDF(doc, data.tenders);
    }
    
    if (data.projects) {
      doc.addPage();
      this.generateProjectsPDF(doc, data.projects);
    }
    
    if (data.financial) {
      doc.addPage();
      this.generateFinancialPDF(doc, data.financial);
    }
  }

  // ==================== Excel Generators ====================

  generateFirmsExcel(workbook, firms) {
    const sheet = workbook.addWorksheet('Firms');
    
    // Header
    sheet.columns = [
      { header: 'Firm Name', key: 'name', width: 30 },
      { header: 'Registration No', key: 'registration_no', width: 20 },
      { header: 'Type', key: 'type', width: 15 },
      { header: 'Contact Person', key: 'contact_person', width: 25 },
      { header: 'Phone', key: 'phone', width: 15 },
      { header: 'Email', key: 'email', width: 30 },
      { header: 'Address', key: 'address', width: 40 },
      { header: 'Status', key: 'status', width: 12 }
    ];
    
    // Style header
    sheet.getRow(1).font = { bold: true };
    sheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFD3D3D3' }
    };
    
    // Add data
    firms.forEach(firm => sheet.addRow(firm));
  }

  generateTendersExcel(workbook, tenders) {
    const sheet = workbook.addWorksheet('Tenders');
    
    sheet.columns = [
      { header: 'Tender No', key: 'tender_no', width: 20 },
      { header: 'Title', key: 'title', width: 40 },
      { header: 'Procuring Entity', key: 'procuring_entity', width: 30 },
      { header: 'Type', key: 'tender_type', width: 15 },
      { header: 'Budget', key: 'estimated_budget', width: 15 },
      { header: 'Submission Deadline', key: 'submission_deadline', width: 20 },
      { header: 'Status', key: 'status', width: 12 }
    ];
    
    sheet.getRow(1).font = { bold: true };
    sheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFD3D3D3' }
    };
    
    tenders.forEach(tender => sheet.addRow(tender));
  }

  generateTenderSummaryExcel(workbook, summary) {
    // Summary Sheet
    const summarySheet = workbook.addWorksheet('Tender Summary');
    summarySheet.columns = [
      { header: 'Field', key: 'field', width: 30 },
      { header: 'Value', key: 'value', width: 50 }
    ];
    
    const fields = [
      { field: 'e-GP Tender ID', value: summary.egp_tender_id },
      { field: 'Procuring Entity', value: summary.procuring_entity },
      { field: 'Official Inviting', value: summary.official_inviting_tender },
      { field: 'Description', value: summary.brief_description },
      { field: 'Procurement Type', value: summary.procurement_type },
      { field: 'Procurement Method', value: summary.procurement_method },
      { field: 'Document Price', value: summary.document_price },
      { field: 'Tender Security', value: summary.tender_security_amount },
      { field: 'Estimated Value', value: summary.estimated_tender_value },
      { field: 'Our Estimate', value: summary.our_estimated_cost },
      { field: 'Profit Margin', value: summary.profit_margin },
      { field: 'Risk Level', value: summary.risk_level },
      { field: 'Recommendation', value: summary.recommendation },
      { field: 'Confidence Level', value: summary.confidence_level }
    ];
    
    fields.forEach(f => summarySheet.addRow(f));
    summarySheet.getRow(1).font = { bold: true };
    
    // Items Sheet
    if (summary.items && summary.items.length > 0) {
      const itemsSheet = workbook.addWorksheet('Items');
      itemsSheet.columns = [
        { header: 'Item No', key: 'item_no', width: 10 },
        { header: 'Description', key: 'description', width: 40 },
        { header: 'Quantity', key: 'quantity', width: 12 },
        { header: 'Unit', key: 'unit', width: 10 },
        { header: 'Unit Rate', key: 'unit_rate', width: 15 },
        { header: 'Total Amount', key: 'total_amount', width: 15 }
      ];
      itemsSheet.getRow(1).font = { bold: true };
      summary.items.forEach(item => itemsSheet.addRow(item));
    }
  }

  generateFinancialExcel(workbook, data) {
    // Bank Accounts
    if (data.bankAccounts) {
      const sheet = workbook.addWorksheet('Bank Accounts');
      sheet.columns = [
        { header: 'Bank Name', key: 'bank_name', width: 25 },
        { header: 'Account No', key: 'account_no', width: 20 },
        { header: 'Account Type', key: 'account_type', width: 15 },
        { header: 'Balance', key: 'balance', width: 15 },
        { header: 'Status', key: 'status', width: 12 }
      ];
      sheet.getRow(1).font = { bold: true };
      data.bankAccounts.forEach(acc => sheet.addRow(acc));
    }
    
    // Loans
    if (data.loans) {
      const sheet = workbook.addWorksheet('Loans');
      sheet.columns = [
        { header: 'Loan Type', key: 'loan_type', width: 20 },
        { header: 'Bank', key: 'bank_name', width: 25 },
        { header: 'Loan Amount', key: 'loan_amount', width: 15 },
        { header: 'Outstanding', key: 'outstanding_balance', width: 15 },
        { header: 'Interest Rate', key: 'interest_rate', width: 12 },
        { header: 'Status', key: 'status', width: 12 }
      ];
      sheet.getRow(1).font = { bold: true };
      data.loans.forEach(loan => sheet.addRow(loan));
    }
  }

  generateProjectsExcel(workbook, projects) {
    const sheet = workbook.addWorksheet('Projects');
    
    sheet.columns = [
      { header: 'Project No', key: 'project_no', width: 20 },
      { header: 'Project Name', key: 'project_name', width: 35 },
      { header: 'Client', key: 'client_name', width: 25 },
      { header: 'Contract Value', key: 'contract_value', width: 15 },
      { header: 'Start Date', key: 'start_date', width: 15 },
      { header: 'Completion Date', key: 'completion_date', width: 15 },
      { header: 'Progress %', key: 'progress', width: 12 },
      { header: 'Status', key: 'status', width: 12 }
    ];
    
    sheet.getRow(1).font = { bold: true };
    sheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFD3D3D3' }
    };
    
    projects.forEach(project => sheet.addRow(project));
  }

  generateExpensesExcel(workbook, expenses) {
    const sheet = workbook.addWorksheet('Expenses');
    
    sheet.columns = [
      { header: 'Date', key: 'expense_date', width: 15 },
      { header: 'Category', key: 'category_name', width: 20 },
      { header: 'Description', key: 'description', width: 40 },
      { header: 'Amount', key: 'amount', width: 15 },
      { header: 'Payment Method', key: 'payment_method', width: 15 },
      { header: 'Status', key: 'status', width: 12 }
    ];
    
    sheet.getRow(1).font = { bold: true };
    sheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFD3D3D3' }
    };
    
    expenses.forEach(expense => sheet.addRow(expense));
    
    // Add totals
    const totalRow = expenses.reduce((sum, e) => sum + (e.amount || 0), 0);
    sheet.addRow({});
    const lastRow = sheet.addRow({ description: 'TOTAL', amount: totalRow });
    lastRow.font = { bold: true };
  }

  generateTeamExcel(workbook, team) {
    const sheet = workbook.addWorksheet('Team');
    
    sheet.columns = [
      { header: 'Name', key: 'name', width: 25 },
      { header: 'Designation', key: 'designation', width: 25 },
      { header: 'Department', key: 'department', width: 20 },
      { header: 'Email', key: 'email', width: 30 },
      { header: 'Phone', key: 'phone', width: 15 },
      { header: 'Joining Date', key: 'joining_date', width: 15 },
      { header: 'Status', key: 'status', width: 12 }
    ];
    
    sheet.getRow(1).font = { bold: true };
    team.forEach(member => sheet.addRow(member));
  }

  generateContactsExcel(workbook, contacts) {
    const sheet = workbook.addWorksheet('Contacts');
    
    sheet.columns = [
      { header: 'Name', key: 'name', width: 25 },
      { header: 'Type', key: 'contact_type', width: 15 },
      { header: 'Designation', key: 'designation', width: 25 },
      { header: 'Department', key: 'department', width: 20 },
      { header: 'Email', key: 'email', width: 30 },
      { header: 'Phone', key: 'phone', width: 15 },
      { header: 'Mobile', key: 'mobile', width: 15 }
    ];
    
    sheet.getRow(1).font = { bold: true };
    contacts.forEach(contact => sheet.addRow(contact));
  }

  generateLicensesExcel(workbook, licenses) {
    const sheet = workbook.addWorksheet('Licenses');
    
    sheet.columns = [
      { header: 'License Type', key: 'license_type', width: 25 },
      { header: 'License No', key: 'license_no', width: 20 },
      { header: 'Issuing Authority', key: 'issuing_authority', width: 30 },
      { header: 'Issue Date', key: 'issue_date', width: 15 },
      { header: 'Expiry Date', key: 'expiry_date', width: 15 },
      { header: 'Status', key: 'status', width: 12 }
    ];
    
    sheet.getRow(1).font = { bold: true };
    licenses.forEach(license => sheet.addRow(license));
  }

  generateComprehensiveExcel(workbook, data) {
    // Overview
    const overview = workbook.addWorksheet('Overview');
    overview.columns = [
      { header: 'Metric', key: 'metric', width: 30 },
      { header: 'Value', key: 'value', width: 20 }
    ];
    overview.addRow({ metric: 'Total Firms', value: data.stats.totalFirms || 0 });
    overview.addRow({ metric: 'Active Tenders', value: data.stats.activeTenders || 0 });
    overview.addRow({ metric: 'Ongoing Projects', value: data.stats.ongoingProjects || 0 });
    overview.addRow({ metric: 'Total Team Members', value: data.stats.totalTeam || 0 });
    overview.getRow(1).font = { bold: true };
    
    // Add other sheets
    if (data.firms) this.generateFirmsExcel(workbook, data.firms);
    if (data.tenders) this.generateTendersExcel(workbook, data.tenders);
    if (data.projects) this.generateProjectsExcel(workbook, data.projects);
    if (data.financial) this.generateFinancialExcel(workbook, data.financial);
  }

  // Helper methods
  formatReportTitle(type) {
    const titles = {
      'firms': 'Firms',
      'tenders': 'Tenders',
      'tender-summary': 'Tender Summary',
      'financial': 'Financial',
      'projects': 'Projects',
      'expenses': 'Expenses',
      'team': 'Team',
      'contacts': 'Contacts',
      'licenses': 'Licenses',
      'comprehensive': 'Comprehensive'
    };
    return titles[type] || 'Report';
  }
}

module.exports = ReportGenerator;
