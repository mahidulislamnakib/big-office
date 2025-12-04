// seed-demo-data.js - Populate Big Office with realistic demo data
const Database = require('better-sqlite3');
const db = new Database('./data/tenders.db');

console.log('Seeding demo data for Big Office...\n');

// Helper function to run SQL
const run = (sql, params = []) => {
  try {
    return db.prepare(sql).run(params);
  } catch (err) {
    console.error('Error:', err.message);
    return null;
  }
};

// Clear existing data (optional - comment out to keep existing data)
console.log('Clearing existing data...');
const tables = ['firms', 'licenses', 'enlistments', 'tax_compliance', 'bank_accounts', 
                'pay_orders', 'bank_guarantees', 'loans', 'tenders', 'tender_assignments',
                'tender_costs', 'projects', 'project_bills', 'documents', 'contacts',
                'team_members', 'tasks', 'task_comments', 'suppliers', 'supplier_transactions',
                'clients', 'client_contacts', 'tender_summaries', 'tender_summary_items',
                'tender_preparation_requirements'];
tables.forEach(table => run(`DELETE FROM ${table}`));

// ============================================
// 1. FIRMS
// ============================================
console.log('Creating firms...');
const firms = [
  {
    name: 'Green Earth Constructions Ltd.',
    business_type: 'Private Ltd',
    category: 'building,road,bridge',
    tin: '123456789012',
    bin: '000123456',
    address: '45/A, Mohakhali C/A',
    city: 'Dhaka',
    postal_code: '1212',
    email: 'info@greenearth.com',
    phone: '02-9876543',
    mobile: '01711-123456',
    website: 'www.greenearth.com',
    established_date: '2015-03-15',
    proprietor_name: 'Md. Karim Rahman',
    contact_person: 'Eng. Ashraf Ali',
    contact_designation: 'Managing Director',
    status: 'active',
    notes: 'Specialized in civil construction and road projects'
  },
  {
    name: 'Rahman Engineering Works',
    business_type: 'Proprietorship',
    category: 'electrical,mechanical',
    tin: '987654321098',
    bin: '000987654',
    address: '123, Agrabad C/A',
    city: 'Chittagong',
    postal_code: '4100',
    email: 'contact@rahmaneng.com',
    phone: '031-654321',
    mobile: '01819-987654',
    website: null,
    established_date: '2010-07-20',
    proprietor_name: 'Abdul Rahman',
    contact_person: 'Abdul Rahman',
    contact_designation: 'Proprietor',
    status: 'active',
    notes: 'Mechanical and electrical works specialist'
  },
  {
    name: 'Delta Builders & Associates',
    business_type: 'Partnership',
    category: 'building,supply',
    tin: '456789012345',
    bin: '000456789',
    address: '78, New Elephant Road',
    city: 'Dhaka',
    postal_code: '1205',
    email: 'delta@builders.com',
    phone: '02-8765432',
    mobile: '01912-345678',
    website: 'www.deltabuilders.com',
    established_date: '2018-01-10',
    proprietor_name: 'Hasan & Partners',
    contact_person: 'Jahangir Hasan',
    contact_designation: 'Partner',
    status: 'active',
    notes: 'Building construction and interior works'
  }
];

const firmIds = [];
firms.forEach(firm => {
  const result = run(`
    INSERT INTO firms (name, business_type, category, tin, bin, address, city, postal_code, email, 
                       phone, mobile, website, established_date, proprietor_name, 
                       contact_person, contact_designation, status, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [firm.name, firm.business_type, firm.category, firm.tin, firm.bin, firm.address, firm.city,
      firm.postal_code, firm.email, firm.phone, firm.mobile, firm.website,
      firm.established_date, firm.proprietor_name, firm.contact_person,
      firm.contact_designation, firm.status, firm.notes]);
  if (result) firmIds.push(result.lastInsertRowid);
});
console.log(`✓ Created ${firmIds.length} firms`);

// ============================================
// 2. LICENSES
// ============================================
console.log('Creating licenses...');
const licenses = [
  { firm_id: firmIds[0], license_type: 'trade_license', license_number: 'TL-2024-12345', 
    issuing_authority: 'Dhaka City Corporation', issue_date: '2024-01-01', 
    expiry_date: '2025-12-31', amount: 5000, status: 'active' },
  { firm_id: firmIds[0], license_type: 'tin', license_number: '123456789012', 
    issuing_authority: 'NBR', issue_date: '2015-04-01', expiry_date: null, 
    amount: 0, status: 'active' },
  { firm_id: firmIds[0], license_type: 'vat', license_number: 'VAT-2015-1234', 
    issuing_authority: 'NBR', issue_date: '2015-04-15', expiry_date: null, 
    amount: 0, status: 'active' },
  { firm_id: firmIds[1], license_type: 'trade_license', license_number: 'CCC-2024-5678', 
    issuing_authority: 'Chittagong City Corporation', issue_date: '2024-02-01', 
    expiry_date: '2025-01-31', amount: 3000, status: 'active' },
  { firm_id: firmIds[2], license_type: 'trade_license', license_number: 'TL-2023-9876', 
    issuing_authority: 'Dhaka City Corporation', issue_date: '2023-06-01', 
    expiry_date: '2024-05-31', amount: 4500, status: 'expired' }
];

licenses.forEach(lic => {
  run(`INSERT INTO licenses (firm_id, license_type, license_number, issuing_authority, 
       issue_date, expiry_date, amount, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [lic.firm_id, lic.license_type, lic.license_number, lic.issuing_authority,
       lic.issue_date, lic.expiry_date, lic.amount, lic.status]);
});
console.log(`✓ Created ${licenses.length} licenses`);

// ============================================
// 3. ENLISTMENTS
// ============================================
console.log('Creating enlistments...');
const enlistments = [
  { firm_id: firmIds[0], authority: 'PWD', category: 'A', work_type: 'Building',
    enlistment_number: 'PWD/BLD/A/2024/123', issue_date: '2024-01-15', 
    expiry_date: '2026-01-14', amount: 50000, status: 'active' },
  { firm_id: firmIds[0], authority: 'LGED', category: 'B', work_type: 'Road',
    enlistment_number: 'LGED/RD/B/2023/456', issue_date: '2023-06-01', 
    expiry_date: '2025-05-31', amount: 35000, status: 'active' },
  { firm_id: firmIds[1], authority: 'RHD', category: 'C', work_type: 'Bridge',
    enlistment_number: 'RHD/BR/C/2024/789', issue_date: '2024-03-01', 
    expiry_date: '2026-02-28', amount: 25000, status: 'active' },
  { firm_id: firmIds[2], authority: 'RAJUK', category: 'B', work_type: 'Building',
    enlistment_number: 'RAJUK/BLD/B/2023/321', issue_date: '2023-09-01', 
    expiry_date: '2025-08-31', amount: 40000, status: 'active' }
];

enlistments.forEach(enl => {
  run(`INSERT INTO enlistments (firm_id, authority, category, work_type, enlistment_number, 
       issue_date, expiry_date, amount, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [enl.firm_id, enl.authority, enl.category, enl.work_type, enl.enlistment_number,
       enl.issue_date, enl.expiry_date, enl.amount, enl.status]);
});
console.log(`✓ Created ${enlistments.length} enlistments`);

// ============================================
// 4. BANK ACCOUNTS
// ============================================
console.log('Creating bank accounts...');
const accounts = [
  { firm_id: firmIds[0], bank_name: 'Dutch-Bangla Bank', branch_name: 'Mohakhali', 
    account_number: '1234567890', account_type: 'current', 
    balance: 2500000, status: 'active' },
  { firm_id: firmIds[0], bank_name: 'Islami Bank', branch_name: 'Gulshan', 
    account_number: '9876543210', account_type: 'savings', 
    balance: 500000, status: 'active' },
  { firm_id: firmIds[1], bank_name: 'Sonali Bank', branch_name: 'Agrabad', 
    account_number: '5555666677', account_type: 'current', 
    balance: 1200000, status: 'active' },
  { firm_id: firmIds[2], bank_name: 'BRAC Bank', branch_name: 'Dhanmondi', 
    account_number: '1111222233', account_type: 'current', 
    balance: 800000, status: 'active' }
];

accounts.forEach(acc => {
  run(`INSERT INTO bank_accounts (firm_id, bank_name, branch_name, account_number, 
       account_type, balance, status) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [acc.firm_id, acc.bank_name, acc.branch_name, acc.account_number,
       acc.account_type, acc.balance, acc.status]);
});
console.log(`✓ Created ${accounts.length} bank accounts`);

// ============================================
// 5. BANK GUARANTEES
// ============================================
console.log('Creating bank guarantees...');
const guarantees = [
  { firm_id: firmIds[0], bg_type: 'tender_security', bg_number: 'BG-2024-001', 
    bank_name: 'Dutch-Bangla Bank', amount: 350000, issue_date: '2024-11-01', 
    expiry_date: '2025-03-31', in_favor_of: 'PWD, Dhaka', status: 'active' },
  { firm_id: firmIds[0], bg_type: 'performance_security', bg_number: 'BG-2024-002', 
    bank_name: 'Islami Bank', amount: 1500000, issue_date: '2024-06-15', 
    expiry_date: '2025-12-31', in_favor_of: 'LGED, Dhaka', status: 'active' },
  { firm_id: firmIds[1], bg_type: 'advance_payment', bg_number: 'BG-2024-003', 
    bank_name: 'Sonali Bank', amount: 800000, issue_date: '2024-08-01', 
    expiry_date: '2025-02-28', in_favor_of: 'RHD, Chittagong', status: 'active' },
  { firm_id: firmIds[2], bg_type: 'retention_money', bg_number: 'BG-2023-045', 
    bank_name: 'BRAC Bank', amount: 250000, issue_date: '2023-12-01', 
    expiry_date: '2024-11-30', in_favor_of: 'RAJUK, Dhaka', status: 'expired' }
];

guarantees.forEach(bg => {
  run(`INSERT INTO bank_guarantees (firm_id, bg_type, bg_number, bank_name, amount, 
       issue_date, expiry_date, in_favor_of, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [bg.firm_id, bg.bg_type, bg.bg_number, bg.bank_name, bg.amount,
       bg.issue_date, bg.expiry_date, bg.in_favor_of, bg.status]);
});
console.log(`✓ Created ${guarantees.length} bank guarantees`);

// ============================================
// 6. TENDERS
// ============================================
console.log('Creating tenders...');
const tenders = [
  { tender_id: '1131373', procuring_entity: 'Chief Controller of Stores, Pahartali',
    proc_type: 'Goods', method: 'NCT', tender_value: 20000000, 
    assigned_firm_id: firmIds[0], lastSubmission: '2025-12-07', status: 'preparing',
    notes: 'Wheel Set Guide procurement for Bangladesh Railway' },
  { tender_id: 'PWD-2024-1234', procuring_entity: 'PWD, Dhaka Division',
    proc_type: 'Works', method: 'OTM', tender_value: 15000000, 
    assigned_firm_id: firmIds[0], lastSubmission: '2024-12-15', status: 'submitted',
    notes: 'Road rehabilitation project' },
  { tender_id: 'LGED-2024-5678', procuring_entity: 'LGED, Chittagong',
    proc_type: 'Works', method: 'LTM', tender_value: 8000000, 
    assigned_firm_id: firmIds[1], lastSubmission: '2024-11-20', status: 'won',
    notes: 'Bridge construction project' },
  { tender_id: 'RAJUK-2024-9876', procuring_entity: 'RAJUK, Dhaka',
    proc_type: 'Works', method: 'OTM', tender_value: 25000000, 
    assigned_firm_id: firmIds[2], lastSubmission: '2024-10-30', status: 'lost',
    notes: 'Building construction tender' },
  { tender_id: 'RHD-2025-0001', procuring_entity: 'RHD, Sylhet Division',
    proc_type: 'Works', method: 'OTM', tender_value: 30000000, 
    assigned_firm_id: null, lastSubmission: '2025-01-15', status: 'discovered',
    notes: 'Highway expansion project' }
];

const tenderIds = [];
tenders.forEach(tender => {
  const result = run(`INSERT INTO tenders (tender_id, procuring_entity, proc_type, method, 
       tender_value, assigned_firm_id, lastSubmission, status, notes) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [tender.tender_id, tender.procuring_entity, tender.proc_type, tender.method,
       tender.tender_value, tender.assigned_firm_id, tender.lastSubmission, 
       tender.status, tender.notes]);
  if (result) tenderIds.push(result.lastInsertRowid);
});
console.log(`✓ Created ${tenders.length} tenders`);

// ============================================
// 7. PROJECTS
// ============================================
console.log('Creating projects...');
const projects = [
  { project_name: 'Mirpur Road Rehabilitation', tender_id: tenderIds[1], firm_id: firmIds[0], 
    contract_value: 15000000, contract_date: '2024-06-01', 
    completion_date: '2025-05-31', status: 'ongoing', 
    completion_percentage: 45, notes: 'PWD project - 2km road work' },
  { project_name: 'Kaptai Bridge Construction', tender_id: tenderIds[2], firm_id: firmIds[1], 
    contract_value: 8000000, contract_date: '2024-01-15', 
    completion_date: '2024-12-31', status: 'ongoing', 
    completion_percentage: 75, notes: 'LGED bridge project' },
  { project_name: 'Gulshan Community Center', tender_id: tenderIds[3], firm_id: firmIds[2], 
    contract_value: 12000000, contract_date: '2023-09-01', 
    completion_date: '2024-08-31', status: 'completed', 
    completion_percentage: 100, notes: 'RAJUK building project - completed ahead of schedule' }
];

projects.forEach(proj => {
  run(`INSERT INTO projects (project_name, tender_id, firm_id, contract_value, contract_date, 
       completion_date, status, completion_percentage, notes) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [proj.project_name, proj.tender_id, proj.firm_id, proj.contract_value, proj.contract_date,
       proj.completion_date, proj.status, proj.completion_percentage, proj.notes]);
});
console.log(`✓ Created ${projects.length} projects`);

// ============================================
// 8. CONTACTS
// ============================================
console.log('Creating contacts...');
const contacts = [
  { name: 'Md. Karim Rahman', firm_id: firmIds[0], contact_type: 'proprietor',
    designation: 'Managing Director', mobile: '01711-123456', 
    email: 'karim@greenearth.com' },
  { name: 'Eng. Ashraf Ali', firm_id: firmIds[0], contact_type: 'employee',
    designation: 'Project Manager', mobile: '01819-234567', 
    email: 'ashraf@greenearth.com' },
  { name: 'Abdul Rahman', firm_id: firmIds[1], contact_type: 'proprietor',
    designation: 'Proprietor', mobile: '01819-987654', 
    email: 'contact@rahmaneng.com' },
  { name: 'Jahangir Hasan', firm_id: firmIds[2], contact_type: 'partner',
    designation: 'Partner', mobile: '01912-345678', 
    email: 'jahangir@deltabuilders.com' }
];

contacts.forEach(contact => {
  run(`INSERT INTO contacts (name, firm_id, contact_type, designation, mobile, email) 
       VALUES (?, ?, ?, ?, ?, ?)`,
      [contact.name, contact.firm_id, contact.contact_type, contact.designation,
       contact.mobile, contact.email]);
});
console.log(`✓ Created ${contacts.length} contacts`);

// ============================================
// 9. TEAM MEMBERS
// ============================================
console.log('Creating team members...');
const teamMembers = [
  { name: 'Rafiq Ahmed', designation: 'Senior Engineer', department: 'operations',
    role: 'manager', email: 'rafiq@bigoffice.com', mobile: '01711-111111',
    status: 'active', joining_date: '2020-01-15' },
  { name: 'Sultana Begum', designation: 'Accounts Manager', department: 'accounts',
    role: 'accountant', email: 'sultana@bigoffice.com', mobile: '01819-222222',
    status: 'active', joining_date: '2021-03-10' },
  { name: 'Kamal Hossain', designation: 'Documentation Officer', department: 'documentation',
    role: 'document_handler', email: 'kamal@bigoffice.com', mobile: '01912-333333',
    status: 'active', joining_date: '2022-06-01' },
  { name: 'Nasrin Akter', designation: 'Project Coordinator', department: 'operations',
    role: 'coordinator', email: 'nasrin@bigoffice.com', mobile: '01611-444444',
    status: 'active', joining_date: '2023-02-20' },
  { name: 'Imran Khan', designation: 'Field Officer', department: 'field',
    role: 'field_officer', email: 'imran@bigoffice.com', mobile: '01711-555555',
    status: 'on_leave', joining_date: '2023-09-01' }
];

const teamMemberIds = [];
teamMembers.forEach(member => {
  const result = run(`INSERT INTO team_members (name, designation, department, role, email, 
       mobile, status, joining_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [member.name, member.designation, member.department, member.role, member.email,
       member.mobile, member.status, member.joining_date]);
  if (result) teamMemberIds.push(result.lastInsertRowid);
});
console.log(`✓ Created ${teamMembers.length} team members`);

// ============================================
// 10. TASKS
// ============================================
console.log('Creating tasks...');
const tasks = [
  { title: 'Prepare Railway Tender Documents', description: 'Collect all documents for Wheel Set Guide tender',
    task_type: 'tender_preparation', priority: 'high', status: 'in_progress',
    assigned_to: teamMemberIds[0], firm_id: firmIds[0], due_date: '2025-12-05',
    estimated_hours: 16 },
  { title: 'Renew PWD Enlistment', description: 'PWD Grade A enlistment renewal process',
    task_type: 'license_renewal', priority: 'medium', status: 'pending',
    assigned_to: teamMemberIds[2], firm_id: firmIds[0], due_date: '2025-12-20',
    estimated_hours: 8 },
  { title: 'Bank Guarantee Collection', description: 'Collect BG for PWD road project',
    task_type: 'bank_work', priority: 'high', status: 'completed',
    assigned_to: teamMemberIds[1], firm_id: firmIds[0], due_date: '2024-11-15',
    estimated_hours: 4 },
  { title: 'Mirpur Site Inspection', description: 'Weekly progress check at Mirpur road site',
    task_type: 'site_visit', priority: 'medium', status: 'pending',
    assigned_to: teamMemberIds[4], firm_id: firmIds[0], due_date: '2024-12-08',
    estimated_hours: 6 },
  { title: 'Client Meeting - LGED', description: 'Discuss upcoming tenders with LGED officials',
    task_type: 'meeting', priority: 'low', status: 'pending',
    assigned_to: teamMemberIds[3], firm_id: firmIds[1], due_date: '2024-12-10',
    estimated_hours: 3 }
];

tasks.forEach(task => {
  run(`INSERT INTO tasks (title, description, task_type, priority, status, assigned_to, 
       firm_id, due_date, estimated_hours) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [task.title, task.description, task.task_type, task.priority, task.status,
       task.assigned_to, task.firm_id, task.due_date, task.estimated_hours]);
});
console.log(`✓ Created ${tasks.length} tasks`);

// ============================================
// 11. SUPPLIERS
// ============================================
console.log('Creating suppliers...');
const suppliers = [
  { name: 'Akij Cement Ltd.', company_name: 'Akij Cement Ltd.', supplier_type: 'material',
    category: 'cement', contact_person: 'Salesman', mobile: '01711-666666',
    email: 'sales@akijcement.com', payment_terms: 'credit_15days', 
    credit_limit: 500000, rating: 5, status: 'active' },
  { name: 'BSRM Steel', company_name: 'BSRM Steel Mills Ltd.', supplier_type: 'material',
    category: 'steel', contact_person: 'Dealer', mobile: '01819-777777',
    email: 'info@bsrm.com', payment_terms: 'credit_7days', 
    credit_limit: 1000000, rating: 5, status: 'active' },
  { name: 'Rahman Hardware', company_name: 'Rahman Hardware & Sanitary', supplier_type: 'material',
    category: 'hardware', contact_person: 'Sohel', mobile: '01912-888888',
    email: 'rahman@hardware.com', payment_terms: 'cash', 
    credit_limit: 0, rating: 4, status: 'active' },
  { name: 'Elite Electrical Works', company_name: 'Elite Electrical Works', supplier_type: 'subcontractor',
    category: 'electrical', contact_person: 'Eng. Faruk', mobile: '01711-999999',
    email: 'elite@electrical.com', payment_terms: 'credit_30days', 
    credit_limit: 300000, rating: 4, status: 'active' },
  { name: 'Precision Engineering', company_name: 'Precision Engineering Services', supplier_type: 'consultant',
    category: 'structural_design', contact_person: 'Dr. Rahim', mobile: '01819-000000',
    email: 'info@precision.com', payment_terms: 'cash', 
    credit_limit: 0, rating: 5, status: 'active' }
];

const supplierIds = [];
suppliers.forEach(supplier => {
  const result = run(`INSERT INTO suppliers (name, company_name, supplier_type, category, 
       contact_person, mobile, email, payment_terms, credit_limit, rating, status) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [supplier.name, supplier.company_name, supplier.supplier_type, supplier.category,
       supplier.contact_person, supplier.mobile, supplier.email, supplier.payment_terms,
       supplier.credit_limit, supplier.rating, supplier.status]);
  if (result) supplierIds.push(result.lastInsertRowid);
});
console.log(`✓ Created ${suppliers.length} suppliers`);

// ============================================
// 12. CLIENTS
// ============================================
console.log('Creating clients...');
const clients = [
  { name: 'Public Works Department', organization_type: 'government',
    department: 'PWD, Dhaka', region: 'Dhaka', email: 'pwd@gov.bd',
    office_address: 'PWD Building, Motijheel', city: 'Dhaka',
    payment_reputation: 'excellent', status: 'active' },
  { name: 'Local Govt Engineering Dept', organization_type: 'government',
    department: 'LGED', region: 'Chittagong', email: 'lged@gov.bd',
    office_address: 'LGED Complex, Agrabad', city: 'Chittagong',
    payment_reputation: 'good', status: 'active' },
  { name: 'RAJUK', organization_type: 'semi_government',
    department: 'RAJUK', region: 'Dhaka', email: 'info@rajuk.gov.bd',
    office_address: 'RAJUK Bhaban, Agargaon', city: 'Dhaka',
    payment_reputation: 'fair', status: 'active' },
  { name: 'Square Pharmaceuticals', organization_type: 'private',
    department: 'Procurement', region: 'Dhaka', email: 'procurement@square.com',
    office_address: 'Square Centre, Tejgaon', city: 'Dhaka',
    payment_reputation: 'excellent', status: 'active' }
];

const clientIds = [];
clients.forEach(client => {
  const result = run(`INSERT INTO clients (name, organization_type, department, region, 
       email, office_address, city, payment_reputation) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [client.name, client.organization_type, client.department, client.region,
       client.email, client.office_address, client.city, client.payment_reputation]);
  if (result) clientIds.push(result.lastInsertRowid);
});
console.log(`✓ Created ${clients.length} clients`);

// ============================================
// 13. USERS
// ============================================
console.log('Creating users...');
const users = [
  { username: 'admin', password: 'demo123', full_name: 'System Administrator',
    email: 'admin@bigoffice.com', role: 'admin', status: 'active',
    firm_access: 'all' },
  { username: 'manager', password: 'demo123', full_name: 'Rafiq Ahmed',
    email: 'rafiq@bigoffice.com', role: 'manager', status: 'active',
    firm_access: String(firmIds[0]) },
  { username: 'accounts', password: 'demo123', full_name: 'Sultana Begum',
    email: 'sultana@bigoffice.com', role: 'user', status: 'active',
    firm_access: 'all' }
];

users.forEach(user => {
  run(`INSERT INTO users (username, password, full_name, email, role, status, firm_access) 
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [user.username, user.password, user.full_name, user.email, user.role,
       user.status, user.firm_access]);
});
console.log(`✓ Created ${users.length} users`);

// ============================================
// 14. TENDER SUMMARY
// ============================================
console.log('Creating tender summary with items and requirements...');
const summaryResult = run(`
  INSERT INTO tender_summaries (
    procuring_entity, official_inviting_tender, brief_description,
    invitation_reference, invitation_date, document_price, document_purchase_deadline,
    submission_deadline, tender_opening_date, procurement_type, procurement_method,
    tender_security_amount, tender_security_in_favour_of, liquid_asset_requirement,
    liquid_asset_in_favour_of, inspection_type, inspection_milestone, inspection_place,
    inspection_procedure, estimated_tender_value, our_estimated_cost, profit_margin,
    materials_cost, labor_cost, overhead_cost, preparation_days, execution_days,
    risk_level, risks, mitigation_plans, executive_summary, recommendation, 
    confidence_level, notes, firm_id, tender_id, created_by
  ) VALUES (
    'Chief Controller of Stores, Pahartali', 'Md Belal Hossain Sarker',
    'Procurement of Wheel Set Guide, Item No: 104-00720, Drawing No: 0118289-E-04-0543-2 = 515 Nos',
    '54.01.1543.335.08.011.25', '2025-08-06', 2000, '2025-09-03 17:00:00',
    '2025-12-07 10:00:00', '2025-12-07 12:30:00', 'NCT', 'OSTETM',
    350000, 'FA & CAO (East), Bangladesh Railway, CRB, Chattogram', 11500000,
    'The Chief Controller of Stores, Bangladesh Railway, Pahartali, Chattogram',
    'Physical Inspection; BUET Test', 'After delivery', 'DCOS, Inspection, Pahartali',
    'Materials shall be accepted on the basis of BUET Test Report.',
    20000000, 17000000, 15, 12000000, 3000000, 2000000, 10, 120,
    'medium', 
    'Technical specifications require precise manufacturing. BUET testing requirement adds time and cost.',
    'Pre-qualify manufacturer with ISO 9001:2015. Verify capability to meet hardness specs.',
    'Straightforward supply tender for railway components from reliable government client. Technical specifications are clearly defined. Financial requirements are manageable. Recommended to participate with pre-qualified ISO-certified manufacturer.',
    'should_participate', 'high', 'Good profit margin with manageable technical requirements',
    ?, ?, 1
  )
`, [firmIds[0], tenderIds[0]]);

if (!summaryResult) {
  console.log('✗ Failed to create tender summary');
} else {
  const summaryId = summaryResult.lastInsertRowid;
  
  // Add items
  run(`INSERT INTO tender_summary_items (summary_id, item_no, description, technical_specification,
       quantity, unit, point_of_delivery, delivery_period)
       VALUES (?, '01', 'Wheel Set Guide, Item No: 104-00720, Drawing No: 0118289-E-04-0543-2',
       'Drawing No: 0118289-E-04-0543-2 (Hardness must be in the range of 456 - 512)',
       '515 Nos.', 'Nos', 'DCOS/INSP/PHT', '120 days')`, [summaryId]);
  
  // Add requirements
  const requirements = [
    'General Experience: 5 (Five) years',
    'Specific Experience: Supply of Similar Goods to Bangladesh Railway, min BDT 1 crore contract within last 05 years',
    'Financial Capacity: BDT 1,15,00,000.00 (ONE CRORE FIFTEEN LAKH TAKA ONLY)',
    'Valid Trade License',
    'TIN Certificate',
    'VAT Certificate',
    'Manufacturer\'s Authorization Letter or Dealer/Distributor\'s Authorization Letter',
    'Valid ISO 9001:2015 of the Manufacturer',
    'Import Registration Certificate (IRC)'
  ];
  
  requirements.forEach((req, idx) => {
    run(`INSERT INTO tender_preparation_requirements (summary_id, requirement_no, requirement_text, is_fulfilled)
         VALUES (?, ?, ?, ?)`, [summaryId, idx + 1, req, idx < 6 ? 1 : 0]);
  });
  
  console.log(`✓ Created tender summary with ${requirements.length} requirements`);
}

// ============================================
// SUMMARY
// ============================================
console.log('\n========================================');
console.log('DEMO DATA SEEDING COMPLETED!');
console.log('========================================');
console.log(`✓ ${firmIds.length} Firms`);
console.log(`✓ ${licenses.length} Licenses`);
console.log(`✓ ${enlistments.length} Enlistments`);
console.log(`✓ ${accounts.length} Bank Accounts`);
console.log(`✓ ${guarantees.length} Bank Guarantees`);
console.log(`✓ ${tenders.length} Tenders`);
console.log(`✓ ${projects.length} Projects`);
console.log(`✓ ${contacts.length} Contacts`);
console.log(`✓ ${teamMembers.length} Team Members`);
console.log(`✓ ${tasks.length} Tasks`);
console.log(`✓ ${suppliers.length} Suppliers`);
console.log(`✓ ${clients.length} Clients`);
console.log(`✓ ${users.length} Users`);
console.log(`✓ 1 Tender Summary (with items & requirements)`);

// ============================================
// LETTER HUB
// ============================================
console.log('\n📝 Seeding Letter Hub...');
const letterCategories = [
  { name: 'Business', description: 'Business correspondence letters', icon: '💼' },
  { name: 'Legal', description: 'Legal and compliance letters', icon: '⚖️' },
  { name: 'HR', description: 'Human resources letters', icon: '👥' },
  { name: 'Project', description: 'Project-related correspondence', icon: '📊' },
  { name: 'Compliance', description: 'Regulatory compliance letters', icon: '✅' },
  { name: 'General', description: 'General purpose letters', icon: '📄' }
];

letterCategories.forEach(cat => {
  run('INSERT INTO letter_categories (name, description, icon) VALUES (?, ?, ?)',
    [cat.name, cat.description, cat.icon]
  );
});

const letterTemplates = [
  {
    category_id: 1,
    title: 'Tender Submission Cover Letter',
    subject: 'Submission of Tender for {{project_name}}',
    content: `Dear {{recipient_name}},

Subject: Submission of Tender for {{project_name}}

We are pleased to submit our tender proposal for the above-mentioned project. Our company, {{company_name}}, has extensive experience in {{category}} projects.

Tender Details:
- Tender ID: {{tender_id}}
- Project: {{project_name}}
- Submitted By: {{submitted_by}}
- Date: {{date}}

All required documents are enclosed with this application. We look forward to your favorable consideration.

Thank you for this opportunity.

Sincerely,
{{sender_name}}
{{sender_designation}}
{{company_name}}`,
    tags: 'tender,submission,proposal',
    created_by: 1
  },
  {
    category_id: 2,
    title: 'License Renewal Application',
    subject: 'Application for Renewal of {{license_type}}',
    content: `To,
{{recipient_name}}
{{recipient_designation}}
{{recipient_organization}}

Subject: Application for Renewal of {{license_type}}

Dear Sir/Madam,

We, {{company_name}}, hereby apply for the renewal of our {{license_type}} (License No: {{license_number}}) which is due to expire on {{expiry_date}}.

All required documents and fees are enclosed. We request your kind consideration for prompt renewal.

Company Details:
- Name: {{company_name}}
- TIN: {{tin}}
- Address: {{address}}

Thank you for your cooperation.

Yours faithfully,
{{sender_name}}
{{sender_designation}}`,
    tags: 'license,renewal,compliance',
    created_by: 1
  },
  {
    category_id: 4,
    title: 'Project Completion Letter',
    subject: 'Notification of Project Completion - {{project_name}}',
    content: `Dear {{recipient_name}},

Subject: Notification of Project Completion - {{project_name}}

We are pleased to inform you that the project "{{project_name}}" has been successfully completed as per the agreement dated {{agreement_date}}.

Project Summary:
- Project Name: {{project_name}}
- Contract Value: {{contract_value}}
- Completion Date: {{completion_date}}
- Location: {{location}}

All deliverables have been handed over and final inspections completed. We request your team to conduct the final acceptance review at your earliest convenience.

Thank you for your cooperation throughout the project.

Best regards,
{{sender_name}}
{{company_name}}`,
    tags: 'project,completion,notification',
    created_by: 1
  }
];

letterTemplates.forEach(template => {
  run(`INSERT INTO letter_templates (category_id, title, subject, content, tags, created_by) 
     VALUES (?, ?, ?, ?, ?, ?)`,
    [template.category_id, template.title, template.subject, template.content, template.tags, template.created_by]
  );
});
console.log('✓ Created 6 letter categories and 3 templates');

// ============================================
// EXPENSE MANAGER
// ============================================
console.log('💰 Seeding Expense Manager...');
const expenseCategories = [
  { name: 'Office Expenses', description: 'Rent, utilities, maintenance', icon: '🏢', budget_limit: 50000 },
  { name: 'Salaries & Wages', description: 'Employee compensation', icon: '💵', budget_limit: 200000 },
  { name: 'Travel & Transport', description: 'Business travel expenses', icon: '🚗', budget_limit: 30000 },
  { name: 'Materials & Supplies', description: 'Project materials and supplies', icon: '🛠️', budget_limit: 100000 },
  { name: 'Equipment', description: 'Machinery and equipment', icon: '⚙️', budget_limit: 150000 },
  { name: 'Professional Services', description: 'Consultancy, legal fees', icon: '👔', budget_limit: 40000 },
  { name: 'Marketing', description: 'Advertising and promotion', icon: '📢', budget_limit: 25000 },
  { name: 'Miscellaneous', description: 'Other expenses', icon: '��', budget_limit: 15000 }
];

expenseCategories.forEach(cat => {
  run('INSERT INTO expense_categories (name, description, icon, budget_limit) VALUES (?, ?, ?, ?)',
    [cat.name, cat.description, cat.icon, cat.budget_limit]
  );
});

const sampleExpenses = [
  {
    category_id: 1,
    expense_date: '2025-11-15',
    amount: 35000,
    payment_method: 'bank_transfer',
    vendor_name: 'Property Management Ltd',
    description: 'Office rent for November 2025',
    status: 'paid',
    created_by: 1
  },
  {
    category_id: 3,
    firm_id: 1,
    expense_date: '2025-11-20',
    amount: 8500,
    payment_method: 'cash',
    vendor_name: 'City Transport',
    description: 'Site visit transportation - Green Earth project',
    status: 'approved',
    is_billable: 1,
    created_by: 1
  },
  {
    category_id: 4,
    project_id: 1,
    expense_date: '2025-11-25',
    amount: 125000,
    payment_method: 'check',
    payment_reference: 'CHK-2025-1145',
    vendor_name: 'Building Materials Supplier',
    description: 'Construction materials for City Plaza',
    status: 'paid',
    created_by: 1
  }
];

sampleExpenses.forEach(exp => {
  const fields = [];
  const values = [];
  const placeholders = [];
  
  Object.keys(exp).forEach(key => {
    fields.push(key);
    values.push(exp[key]);
    placeholders.push('?');
  });
  
  run(`INSERT INTO expenses (${fields.join(', ')}) VALUES (${placeholders.join(', ')})`, values);
});
console.log('✓ Created 8 expense categories and 3 sample expenses');

console.log('\n========================================');
console.log('DEMO DATA SEEDING COMPLETED!');
console.log('========================================');
console.log(`✓ ${firms.length} Firms`);
console.log(`✓ ${licenses.length} Licenses`);
console.log(`✓ ${enlistments.length} Enlistments`);
console.log(`✓ ${accounts.length} Bank Accounts`);
console.log(`✓ ${guarantees.length} Bank Guarantees`);
console.log(`✓ ${tenders.length} Tenders`);
console.log(`✓ ${projects.length} Projects`);
console.log(`✓ ${contacts.length} Contacts`);
console.log(`✓ ${teamMembers.length} Team Members`);
console.log(`✓ ${tasks.length} Tasks`);
console.log(`✓ ${suppliers.length} Suppliers`);
console.log(`✓ ${clients.length} Clients`);
console.log(`✓ ${users.length} Users`);
console.log(`✓ 1 Tender Summary (with items & requirements)`);
console.log('✓ 6 Letter Categories & 3 Templates');
console.log('✓ 8 Expense Categories & 3 Sample Expenses');
console.log('\nLogin credentials:');
console.log('  Username: admin, Password: demo123');
console.log('  Username: manager, Password: demo123');
console.log('  Username: accounts, Password: demo123');
console.log('\nAccess the system at: http://localhost:3000/app.html');
console.log('========================================\n');

db.close();
