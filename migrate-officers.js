// ============================================
// OFFICERS DIRECTORY MODULE - DATABASE MIGRATION
// Big Office v3.2 - Phase 3
// ============================================

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dbPath = path.join(__dirname, 'data', 'tenders.db');
const db = new Database(dbPath);

console.log('📋 Starting Officers Directory migration...\n');

try {
  // Read and execute schema
  const schemaSQL = fs.readFileSync(path.join(__dirname, 'schema-officers.sql'), 'utf8');
  
  console.log('🔨 Creating tables and indexes...\n');
  
  // Execute the entire schema at once (SQLite supports multiple statements with exec)
  db.exec(schemaSQL);
  
  console.log(`✅ Schema executed successfully\n`);
  
  // ============================================
  // SEED DATA
  // ============================================
  
  console.log('🌱 Seeding sample data...\n');
  
  // Insert Designations
  const designations = [
    { id: 'des-001', title: 'Managing Director', title_bangla: 'ব্যবস্থাপনা পরিচালক', grade_level: 1, category: 'management' },
    { id: 'des-002', title: 'General Manager', title_bangla: 'সাধারণ ব্যবস্থাপক', grade_level: 2, category: 'management' },
    { id: 'des-003', title: 'Deputy General Manager', title_bangla: 'উপ-সাধারণ ব্যবস্থাপক', grade_level: 3, category: 'management' },
    { id: 'des-004', title: 'Senior Manager', title_bangla: 'সিনিয়র ম্যানেজার', grade_level: 4, category: 'executive' },
    { id: 'des-005', title: 'Manager', title_bangla: 'ম্যানেজার', grade_level: 5, category: 'executive' },
    { id: 'des-006', title: 'Assistant Manager', title_bangla: 'সহকারী ম্যানেজার', grade_level: 6, category: 'executive' },
    { id: 'des-007', title: 'Senior Engineer', title_bangla: 'সিনিয়র প্রকৌশলী', grade_level: 5, category: 'officer' },
    { id: 'des-008', title: 'Engineer', title_bangla: 'প্রকৌশলী', grade_level: 6, category: 'officer' },
    { id: 'des-009', title: 'Junior Engineer', title_bangla: 'জুনিয়র প্রকৌশলী', grade_level: 7, category: 'officer' },
    { id: 'des-010', title: 'Accountant', title_bangla: 'হিসাবরক্ষক', grade_level: 6, category: 'officer' },
    { id: 'des-011', title: 'Site Supervisor', title_bangla: 'সাইট সুপারভাইজার', grade_level: 7, category: 'staff' },
    { id: 'des-012', title: 'Office Assistant', title_bangla: 'অফিস সহায়ক', grade_level: 8, category: 'support' }
  ];
  
  const insertDesignation = db.prepare(`
    INSERT OR IGNORE INTO designations (id, title, title_bangla, grade_level, category)
    VALUES (?, ?, ?, ?, ?)
  `);
  
  for (const d of designations) {
    insertDesignation.run(d.id, d.title, d.title_bangla, d.grade_level, d.category);
  }
  console.log(`✅ Inserted ${designations.length} designations`);
  
  // Insert Positions
  const positions = [
    { id: 'pos-001', title: 'Chief Executive', department: 'Management', reports_to_position_id: null },
    { id: 'pos-002', title: 'Head of Operations', department: 'Operations', reports_to_position_id: 'pos-001' },
    { id: 'pos-003', title: 'Head of Finance', department: 'Finance', reports_to_position_id: 'pos-001' },
    { id: 'pos-004', title: 'Head of Engineering', department: 'Engineering', reports_to_position_id: 'pos-002' },
    { id: 'pos-005', title: 'Head of Procurement', department: 'Procurement', reports_to_position_id: 'pos-002' },
    { id: 'pos-006', title: 'Project Manager', department: 'Projects', reports_to_position_id: 'pos-004' },
    { id: 'pos-007', title: 'Site Engineer', department: 'Engineering', reports_to_position_id: 'pos-006' },
    { id: 'pos-008', title: 'Accounts Officer', department: 'Finance', reports_to_position_id: 'pos-003' },
    { id: 'pos-009', title: 'Procurement Officer', department: 'Procurement', reports_to_position_id: 'pos-005' }
  ];
  
  const insertPosition = db.prepare(`
    INSERT OR IGNORE INTO positions (id, title, department, reports_to_position_id)
    VALUES (?, ?, ?, ?)
  `);
  
  for (const p of positions) {
    insertPosition.run(p.id, p.title, p.department, p.reports_to_position_id);
  }
  console.log(`✅ Inserted ${positions.length} positions`);
  
  // Insert Offices
  const offices = [
    { 
      id: 'office-001', 
      office_name: 'Head Office - Dhaka', 
      office_code: 'HO-DHK',
      office_type: 'head_office',
      address: 'House 12, Road 5, Dhanmondi, Dhaka-1205',
      district: 'Dhaka',
      division: 'Dhaka',
      phone: '+880 2 9612345',
      email: 'headoffice@bigoffice.com'
    },
    { 
      id: 'office-002', 
      office_name: 'Regional Office - Chittagong', 
      office_code: 'RO-CTG',
      office_type: 'regional_office',
      address: 'CDA Avenue, Chittagong',
      district: 'Chittagong',
      division: 'Chittagong',
      parent_office_id: 'office-001',
      phone: '+880 31 612345',
      email: 'chittagong@bigoffice.com'
    },
    { 
      id: 'office-003', 
      office_name: 'Regional Office - Sylhet', 
      office_code: 'RO-SYL',
      office_type: 'regional_office',
      address: 'Zindabazar, Sylhet',
      district: 'Sylhet',
      division: 'Sylhet',
      parent_office_id: 'office-001',
      phone: '+880 821 712345',
      email: 'sylhet@bigoffice.com'
    },
    { 
      id: 'office-004', 
      office_name: 'Project Office - Padma Bridge', 
      office_code: 'PO-PDB',
      office_type: 'project_office',
      address: 'Mawa, Munshiganj',
      district: 'Munshiganj',
      division: 'Dhaka',
      parent_office_id: 'office-001'
    },
    { 
      id: 'office-005', 
      office_name: 'Site Office - Dhaka Metro', 
      office_code: 'SO-DMR',
      office_type: 'site_office',
      address: 'Uttara, Dhaka',
      district: 'Dhaka',
      division: 'Dhaka',
      parent_office_id: 'office-001'
    }
  ];
  
  const insertOffice = db.prepare(`
    INSERT OR IGNORE INTO offices (id, office_name, office_code, office_type, address, district, division, parent_office_id, phone, email)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  
  for (const o of offices) {
    insertOffice.run(
      o.id, o.office_name, o.office_code, o.office_type, 
      o.address, o.district, o.division, o.parent_office_id || null,
      o.phone || null, o.email || null
    );
  }
  console.log(`✅ Inserted ${offices.length} offices`);
  
  // Insert Sample Officers
  const officers = [
    {
      id: 'officer-001',
      full_name: 'Md. Abdul Karim',
      name_bangla: 'মোঃ আবদুল করিম',
      father_name: 'Md. Rashid Ahmed',
      date_of_birth: '1975-03-15',
      gender: 'male',
      blood_group: 'B+',
      nid_number: '19753512345678901',
      employee_id: 'EMP-001',
      designation_id: 'des-002',
      position_id: 'pos-002',
      office_id: 'office-001',
      personal_mobile: '+880 1711-123456',
      official_mobile: '+880 1811-123456',
      personal_email: 'karim@email.com',
      official_email: 'karim@bigoffice.com',
      present_address: 'Banani, Dhaka',
      district: 'Dhaka',
      division: 'Dhaka',
      joining_date: '2005-01-10',
      employment_status: 'active',
      employment_type: 'permanent',
      current_grade: 'Grade-2',
      basic_salary: 85000.00,
      education_qualification: 'B.Sc. in Civil Engineering, BUET',
      department: 'Operations'
    },
    {
      id: 'officer-002',
      full_name: 'Fatema Begum',
      name_bangla: 'ফাতেমা বেগম',
      father_name: 'Md. Habibur Rahman',
      date_of_birth: '1982-07-22',
      gender: 'female',
      blood_group: 'A+',
      nid_number: '19823512345678902',
      employee_id: 'EMP-002',
      designation_id: 'des-005',
      position_id: 'pos-003',
      office_id: 'office-001',
      personal_mobile: '+880 1712-234567',
      official_mobile: '+880 1812-234567',
      personal_email: 'fatema@email.com',
      official_email: 'fatema@bigoffice.com',
      present_address: 'Uttara, Dhaka',
      district: 'Dhaka',
      division: 'Dhaka',
      joining_date: '2010-03-15',
      employment_status: 'active',
      employment_type: 'permanent',
      current_grade: 'Grade-5',
      basic_salary: 55000.00,
      education_qualification: 'MBA in Finance, Dhaka University',
      department: 'Finance'
    },
    {
      id: 'officer-003',
      full_name: 'Eng. Mahmudur Rahman',
      name_bangla: 'ইঞ্জি. মাহমুদুর রহমান',
      father_name: 'Md. Rafiqul Islam',
      date_of_birth: '1988-11-10',
      gender: 'male',
      blood_group: 'O+',
      nid_number: '19883512345678903',
      employee_id: 'EMP-003',
      designation_id: 'des-007',
      position_id: 'pos-004',
      office_id: 'office-002',
      personal_mobile: '+880 1713-345678',
      official_mobile: '+880 1813-345678',
      personal_email: 'mahmud@email.com',
      official_email: 'mahmud@bigoffice.com',
      present_address: 'Agrabad, Chittagong',
      district: 'Chittagong',
      division: 'Chittagong',
      joining_date: '2012-06-01',
      employment_status: 'active',
      employment_type: 'permanent',
      current_grade: 'Grade-5',
      basic_salary: 58000.00,
      education_qualification: 'B.Sc. in Civil Engineering, CUET',
      department: 'Engineering'
    },
    {
      id: 'officer-004',
      full_name: 'Sharmin Akter',
      name_bangla: 'শারমিন আক্তার',
      father_name: 'Md. Shahjahan Ali',
      date_of_birth: '1990-05-18',
      gender: 'female',
      blood_group: 'AB+',
      nid_number: '19903512345678904',
      employee_id: 'EMP-004',
      designation_id: 'des-008',
      position_id: 'pos-007',
      office_id: 'office-004',
      personal_mobile: '+880 1714-456789',
      official_mobile: '+880 1814-456789',
      personal_email: 'sharmin@email.com',
      official_email: 'sharmin@bigoffice.com',
      present_address: 'Mawa, Munshiganj',
      district: 'Munshiganj',
      division: 'Dhaka',
      joining_date: '2015-09-01',
      employment_status: 'active',
      employment_type: 'permanent',
      current_grade: 'Grade-6',
      basic_salary: 45000.00,
      education_qualification: 'B.Sc. in Civil Engineering, RUET',
      department: 'Engineering'
    },
    {
      id: 'officer-005',
      full_name: 'Md. Tanvir Hossain',
      name_bangla: 'মোঃ তানভীর হোসেন',
      father_name: 'Md. Anwar Hossain',
      date_of_birth: '1985-09-25',
      gender: 'male',
      blood_group: 'B+',
      nid_number: '19853512345678905',
      employee_id: 'EMP-005',
      designation_id: 'des-010',
      position_id: 'pos-008',
      office_id: 'office-001',
      personal_mobile: '+880 1715-567890',
      official_mobile: '+880 1815-567890',
      personal_email: 'tanvir@email.com',
      official_email: 'tanvir@bigoffice.com',
      present_address: 'Mohammadpur, Dhaka',
      district: 'Dhaka',
      division: 'Dhaka',
      joining_date: '2008-04-01',
      employment_status: 'active',
      employment_type: 'permanent',
      current_grade: 'Grade-6',
      basic_salary: 42000.00,
      education_qualification: 'B.Com in Accounting, National University',
      department: 'Finance'
    },
    {
      id: 'officer-006',
      full_name: 'Rifat Ahmed',
      name_bangla: 'রিফাত আহমেদ',
      father_name: 'Md. Kamal Uddin',
      date_of_birth: '1992-02-14',
      gender: 'male',
      blood_group: 'O+',
      nid_number: '19923512345678906',
      employee_id: 'EMP-006',
      designation_id: 'des-009',
      position_id: 'pos-007',
      office_id: 'office-005',
      personal_mobile: '+880 1716-678901',
      official_mobile: '+880 1816-678901',
      personal_email: 'rifat@email.com',
      official_email: 'rifat@bigoffice.com',
      present_address: 'Uttara, Dhaka',
      district: 'Dhaka',
      division: 'Dhaka',
      joining_date: '2018-01-15',
      employment_status: 'active',
      employment_type: 'permanent',
      current_grade: 'Grade-7',
      basic_salary: 38000.00,
      education_qualification: 'B.Sc. in Civil Engineering, DIU',
      department: 'Engineering'
    }
  ];
  
  const insertOfficer = db.prepare(`
    INSERT OR IGNORE INTO officers (
      id, full_name, name_bangla, father_name, date_of_birth, gender, blood_group,
      nid_number, employee_id, designation_id, position_id, office_id,
      personal_mobile, official_mobile, personal_email, official_email,
      present_address, district, division, joining_date,
      employment_status, employment_type, current_grade, basic_salary,
      education_qualification, department
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  
  for (const o of officers) {
    insertOfficer.run(
      o.id, o.full_name, o.name_bangla, o.father_name, o.date_of_birth, o.gender, o.blood_group,
      o.nid_number, o.employee_id, o.designation_id, o.position_id, o.office_id,
      o.personal_mobile, o.official_mobile, o.personal_email, o.official_email,
      o.present_address, o.district, o.division, o.joining_date,
      o.employment_status, o.employment_type, o.current_grade, o.basic_salary,
      o.education_qualification, o.department
    );
  }
  console.log(`✅ Inserted ${officers.length} officers`);
  
  // Insert Sample Transfer History
  const transfers = [
    {
      officer_id: 'officer-001',
      from_office_id: 'office-002',
      to_office_id: 'office-001',
      from_designation_id: 'des-005',
      to_designation_id: 'des-002',
      transfer_date: '2020-01-15',
      transfer_type: 'promotion',
      transfer_order_number: 'TO-2020-001',
      reason: 'Promoted to General Manager and transferred to Head Office'
    },
    {
      officer_id: 'officer-003',
      from_office_id: 'office-001',
      to_office_id: 'office-002',
      from_designation_id: 'des-008',
      to_designation_id: 'des-007',
      transfer_date: '2019-07-01',
      transfer_type: 'promotion',
      transfer_order_number: 'TO-2019-045',
      reason: 'Promoted to Senior Engineer and transferred to Regional Office'
    }
  ];
  
  const insertTransfer = db.prepare(`
    INSERT OR IGNORE INTO transfer_history (
      officer_id, from_office_id, to_office_id, from_designation_id, to_designation_id,
      transfer_date, transfer_type, transfer_order_number, reason
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  
  for (const t of transfers) {
    const id = `trans-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    insertTransfer.run(
      t.officer_id, t.from_office_id, t.to_office_id,
      t.from_designation_id, t.to_designation_id,
      t.transfer_date, t.transfer_type, t.transfer_order_number, t.reason
    );
  }
  console.log(`✅ Inserted ${transfers.length} transfer records`);
  
  // Insert Sample Promotion History
  const promotions = [
    {
      officer_id: 'officer-002',
      from_designation_id: 'des-006',
      to_designation_id: 'des-005',
      from_grade: 'Grade-6',
      to_grade: 'Grade-5',
      from_basic_salary: 42000.00,
      to_basic_salary: 55000.00,
      promotion_date: '2018-06-01',
      promotion_type: 'regular',
      promotion_order_number: 'PO-2018-012',
      reason: 'Regular promotion after performance evaluation'
    },
    {
      officer_id: 'officer-005',
      from_designation_id: 'des-012',
      to_designation_id: 'des-010',
      from_grade: 'Grade-8',
      to_grade: 'Grade-6',
      from_basic_salary: 28000.00,
      to_basic_salary: 42000.00,
      promotion_date: '2016-03-15',
      promotion_type: 'fast_track',
      promotion_order_number: 'PO-2016-008',
      reason: 'Fast track promotion for exceptional performance'
    }
  ];
  
  const insertPromotion = db.prepare(`
    INSERT OR IGNORE INTO promotion_history (
      officer_id, from_designation_id, to_designation_id, from_grade, to_grade,
      from_basic_salary, to_basic_salary, promotion_date, promotion_type,
      promotion_order_number, reason
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  
  for (const p of promotions) {
    const id = `promo-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    insertPromotion.run(
      p.officer_id, p.from_designation_id, p.to_designation_id,
      p.from_grade, p.to_grade, p.from_basic_salary, p.to_basic_salary,
      p.promotion_date, p.promotion_type, p.promotion_order_number, p.reason
    );
  }
  console.log(`✅ Inserted ${promotions.length} promotion records`);
  
  console.log('\n✅ Officers Directory migration completed successfully!');
  console.log('\n📊 Summary:');
  console.log(`   - 7 tables created`);
  console.log(`   - ${designations.length} designations`);
  console.log(`   - ${positions.length} positions`);
  console.log(`   - ${offices.length} offices`);
  console.log(`   - ${officers.length} officers`);
  console.log(`   - ${transfers.length} transfers`);
  console.log(`   - ${promotions.length} promotions`);
  console.log(`   - 4 views created`);
  console.log(`   - 20 indexes created\n`);
  
} catch (err) {
  console.error('❌ Migration failed:', err.message);
  console.error(err);
  process.exit(1);
} finally {
  db.close();
}
