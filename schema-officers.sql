-- ============================================
-- OFFICERS DIRECTORY MODULE - DATABASE SCHEMA
-- Big Office v3.2 - Phase 3
-- ============================================

-- Officers Table (Main personnel records)
CREATE TABLE IF NOT EXISTS officers (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  
  -- Personal Information
  full_name TEXT NOT NULL,
  name_bangla TEXT,
  father_name TEXT,
  mother_name TEXT,
  date_of_birth DATE,
  gender TEXT CHECK(gender IN ('male', 'female', 'other')),
  blood_group TEXT,
  religion TEXT,
  nationality TEXT DEFAULT 'Bangladeshi',
  
  -- Identification
  nid_number TEXT UNIQUE,
  passport_number TEXT,
  tin_number TEXT,
  
  -- Contact Information
  personal_mobile TEXT,
  official_mobile TEXT,
  personal_email TEXT,
  official_email TEXT,
  emergency_contact TEXT,
  emergency_contact_name TEXT,
  
  -- Address
  present_address TEXT,
  permanent_address TEXT,
  district TEXT,
  division TEXT,
  
  -- Photo & Documents
  photo_url TEXT,
  signature_url TEXT,
  
  -- Employment Details
  employee_id TEXT UNIQUE,
  designation_id TEXT,
  position_id TEXT,
  office_id TEXT,
  department TEXT,
  
  -- Employment Dates
  joining_date DATE,
  confirmation_date DATE,
  retirement_date DATE,
  
  -- Status
  employment_status TEXT DEFAULT 'active' CHECK(employment_status IN ('active', 'on_leave', 'suspended', 'retired', 'terminated', 'resigned')),
  employment_type TEXT DEFAULT 'permanent' CHECK(employment_type IN ('permanent', 'contractual', 'temporary', 'consultant', 'intern')),
  
  -- Salary & Grade
  current_grade TEXT,
  current_scale TEXT,
  basic_salary DECIMAL(12,2),
  
  -- Performance
  performance_rating DECIMAL(3,2),
  last_appraisal_date DATE,
  
  -- Additional Info
  education_qualification TEXT,
  training_courses TEXT,
  skills TEXT,
  languages_known TEXT,
  
  -- Metadata
  notes TEXT,
  created_by INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (designation_id) REFERENCES designations(id),
  FOREIGN KEY (position_id) REFERENCES positions(id),
  FOREIGN KEY (office_id) REFERENCES offices(id)
);

-- Designations Table (Job titles)
CREATE TABLE IF NOT EXISTS designations (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  title TEXT NOT NULL UNIQUE,
  title_bangla TEXT,
  grade_level INTEGER,
  category TEXT CHECK(category IN ('officer', 'staff', 'management', 'executive', 'support')),
  description TEXT,
  is_active BOOLEAN DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Positions Table (Specific roles within organization)
CREATE TABLE IF NOT EXISTS positions (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  title TEXT NOT NULL,
  title_bangla TEXT,
  department TEXT,
  reports_to_position_id TEXT,
  responsibilities TEXT,
  is_active BOOLEAN DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (reports_to_position_id) REFERENCES positions(id)
);

-- Offices Table (Physical locations/branches)
CREATE TABLE IF NOT EXISTS offices (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  office_name TEXT NOT NULL,
  office_name_bangla TEXT,
  office_code TEXT UNIQUE,
  office_type TEXT CHECK(office_type IN ('head_office', 'regional_office', 'branch_office', 'site_office', 'project_office')),
  
  -- Location
  address TEXT,
  district TEXT,
  division TEXT,
  post_code TEXT,
  
  -- Contact
  phone TEXT,
  email TEXT,
  fax TEXT,
  
  -- Hierarchy
  parent_office_id TEXT,
  
  -- Status
  is_active BOOLEAN DEFAULT 1,
  opening_date DATE,
  closing_date DATE,
  
  -- Metadata
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (parent_office_id) REFERENCES offices(id)
);

-- Transfer History Table
CREATE TABLE IF NOT EXISTS transfer_history (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  officer_id TEXT NOT NULL,
  
  -- From Details
  from_office_id TEXT,
  from_designation_id TEXT,
  from_position_id TEXT,
  
  -- To Details
  to_office_id TEXT NOT NULL,
  to_designation_id TEXT,
  to_position_id TEXT,
  
  -- Transfer Details
  transfer_date DATE NOT NULL,
  transfer_type TEXT CHECK(transfer_type IN ('routine', 'promotion', 'request', 'administrative', 'disciplinary')),
  transfer_order_number TEXT,
  transfer_order_date DATE,
  
  -- Reason & Notes
  reason TEXT,
  remarks TEXT,
  
  -- Approval
  approved_by INTEGER,
  approved_at DATETIME,
  
  -- Metadata
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (officer_id) REFERENCES officers(id) ON DELETE CASCADE,
  FOREIGN KEY (from_office_id) REFERENCES offices(id),
  FOREIGN KEY (to_office_id) REFERENCES offices(id),
  FOREIGN KEY (from_designation_id) REFERENCES designations(id),
  FOREIGN KEY (to_designation_id) REFERENCES designations(id),
  FOREIGN KEY (from_position_id) REFERENCES positions(id),
  FOREIGN KEY (to_position_id) REFERENCES positions(id)
);

-- Promotion History Table
CREATE TABLE IF NOT EXISTS promotion_history (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  officer_id TEXT NOT NULL,
  
  -- From Details
  from_designation_id TEXT NOT NULL,
  from_grade TEXT,
  from_scale TEXT,
  from_basic_salary DECIMAL(12,2),
  
  -- To Details
  to_designation_id TEXT NOT NULL,
  to_grade TEXT,
  to_scale TEXT,
  to_basic_salary DECIMAL(12,2),
  
  -- Promotion Details
  promotion_date DATE NOT NULL,
  promotion_type TEXT CHECK(promotion_type IN ('regular', 'fast_track', 'acting', 'special')),
  promotion_order_number TEXT,
  promotion_order_date DATE,
  
  -- Reason & Notes
  reason TEXT,
  remarks TEXT,
  
  -- Approval
  approved_by INTEGER,
  approved_at DATETIME,
  
  -- Metadata
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (officer_id) REFERENCES officers(id) ON DELETE CASCADE,
  FOREIGN KEY (from_designation_id) REFERENCES designations(id),
  FOREIGN KEY (to_designation_id) REFERENCES designations(id)
);

-- Officer Documents Table (Links to existing documents table or stores officer-specific docs)
CREATE TABLE IF NOT EXISTS officer_documents (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  officer_id TEXT NOT NULL,
  document_type TEXT CHECK(document_type IN ('cv', 'certificate', 'nid', 'passport', 'photo', 'signature', 'appointment_letter', 'transfer_order', 'promotion_order', 'other')),
  document_title TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_type TEXT,
  file_size INTEGER,
  description TEXT,
  uploaded_by INTEGER,
  uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (officer_id) REFERENCES officers(id) ON DELETE CASCADE
);

-- Indexes for Performance
CREATE INDEX IF NOT EXISTS idx_officers_name ON officers(full_name);
CREATE INDEX IF NOT EXISTS idx_officers_employee_id ON officers(employee_id);
CREATE INDEX IF NOT EXISTS idx_officers_nid ON officers(nid_number);
CREATE INDEX IF NOT EXISTS idx_officers_designation ON officers(designation_id);
CREATE INDEX IF NOT EXISTS idx_officers_office ON officers(office_id);
CREATE INDEX IF NOT EXISTS idx_officers_status ON officers(employment_status);
CREATE INDEX IF NOT EXISTS idx_officers_mobile ON officers(personal_mobile, official_mobile);

CREATE INDEX IF NOT EXISTS idx_transfer_officer ON transfer_history(officer_id);
CREATE INDEX IF NOT EXISTS idx_transfer_date ON transfer_history(transfer_date DESC);
CREATE INDEX IF NOT EXISTS idx_transfer_from_office ON transfer_history(from_office_id);
CREATE INDEX IF NOT EXISTS idx_transfer_to_office ON transfer_history(to_office_id);

CREATE INDEX IF NOT EXISTS idx_promotion_officer ON promotion_history(officer_id);
CREATE INDEX IF NOT EXISTS idx_promotion_date ON promotion_history(promotion_date DESC);

CREATE INDEX IF NOT EXISTS idx_officer_docs_officer ON officer_documents(officer_id);
CREATE INDEX IF NOT EXISTS idx_officer_docs_type ON officer_documents(document_type);

CREATE INDEX IF NOT EXISTS idx_designations_title ON designations(title);
CREATE INDEX IF NOT EXISTS idx_positions_title ON positions(title);
CREATE INDEX IF NOT EXISTS idx_offices_name ON offices(office_name);
CREATE INDEX IF NOT EXISTS idx_offices_code ON offices(office_code);

-- ============================================
-- VIEWS FOR COMMON QUERIES
-- ============================================

-- Officers with Full Details View
CREATE VIEW IF NOT EXISTS v_officers_full AS
SELECT 
  o.*,
  d.title as designation_title,
  d.title_bangla as designation_title_bangla,
  d.grade_level,
  p.title as position_title,
  p.department as position_department,
  of.office_name,
  of.office_name_bangla,
  of.office_type,
  of.district as office_district,
  of.division as office_division
FROM officers o
LEFT JOIN designations d ON o.designation_id = d.id
LEFT JOIN positions p ON o.position_id = p.id
LEFT JOIN offices of ON o.office_id = of.id;

-- Active Officers Count by Office
CREATE VIEW IF NOT EXISTS v_officers_by_office AS
SELECT 
  of.id as office_id,
  of.office_name,
  of.office_type,
  COUNT(o.id) as total_officers,
  COUNT(CASE WHEN o.employment_status = 'active' THEN 1 END) as active_officers,
  COUNT(CASE WHEN o.employment_status = 'on_leave' THEN 1 END) as on_leave_officers
FROM offices of
LEFT JOIN officers o ON of.id = o.office_id
GROUP BY of.id, of.office_name, of.office_type;

-- Officers Transfer Timeline
CREATE VIEW IF NOT EXISTS v_transfer_timeline AS
SELECT 
  th.id,
  th.officer_id,
  o.full_name as officer_name,
  o.employee_id,
  of1.office_name as from_office,
  of2.office_name as to_office,
  d1.title as from_designation,
  d2.title as to_designation,
  th.transfer_date,
  th.transfer_type,
  th.transfer_order_number,
  th.reason
FROM transfer_history th
JOIN officers o ON th.officer_id = o.id
LEFT JOIN offices of1 ON th.from_office_id = of1.id
LEFT JOIN offices of2 ON th.to_office_id = of2.id
LEFT JOIN designations d1 ON th.from_designation_id = d1.id
LEFT JOIN designations d2 ON th.to_designation_id = d2.id
ORDER BY th.transfer_date DESC;

-- Officers Promotion Timeline
CREATE VIEW IF NOT EXISTS v_promotion_timeline AS
SELECT 
  ph.id,
  ph.officer_id,
  o.full_name as officer_name,
  o.employee_id,
  d1.title as from_designation,
  d2.title as to_designation,
  ph.from_grade,
  ph.to_grade,
  ph.from_basic_salary,
  ph.to_basic_salary,
  ph.promotion_date,
  ph.promotion_type,
  ph.promotion_order_number,
  ph.reason
FROM promotion_history ph
JOIN officers o ON ph.officer_id = o.id
LEFT JOIN designations d1 ON ph.from_designation_id = d1.id
LEFT JOIN designations d2 ON ph.to_designation_id = d2.id
ORDER BY ph.promotion_date DESC;
