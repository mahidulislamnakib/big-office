-- ============================================
-- FIRMS MANAGEMENT
-- ============================================
CREATE TABLE IF NOT EXISTS firms (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  business_type TEXT, -- Proprietorship, Partnership, Private Ltd, Public Ltd
  category TEXT, -- Comma-separated: building, road, bridge, water, electrical, mechanical, supply, consultancy
  tin TEXT,
  bin TEXT,
  address TEXT,
  city TEXT,
  postal_code TEXT,
  email TEXT,
  phone TEXT,
  mobile TEXT,
  website TEXT,
  established_date TEXT,
  proprietor_name TEXT,
  contact_person TEXT,
  contact_designation TEXT,
  status TEXT DEFAULT 'active', -- active, inactive, suspended
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- LICENSES & COMPLIANCE
-- ============================================
CREATE TABLE IF NOT EXISTS licenses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  firm_id INTEGER NOT NULL,
  license_type TEXT NOT NULL, -- trade_license, tin, vat, irc, fire, environmental
  license_number TEXT,
  issuing_authority TEXT,
  issue_date TEXT,
  expiry_date TEXT,
  renewal_date TEXT,
  amount REAL,
  status TEXT DEFAULT 'active', -- active, expired, under_renewal, cancelled
  document_path TEXT,
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (firm_id) REFERENCES firms(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS enlistments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  firm_id INTEGER NOT NULL,
  authority TEXT NOT NULL, -- RAJUK, PWD, LGED, RHD, BWDB, etc
  category TEXT, -- A, B, C, D, E
  work_type TEXT, -- Building, Road, Water, Electrical, etc
  enlistment_number TEXT,
  issue_date TEXT,
  expiry_date TEXT,
  renewal_date TEXT,
  amount REAL,
  status TEXT DEFAULT 'active',
  document_path TEXT,
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (firm_id) REFERENCES firms(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS tax_compliance (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  firm_id INTEGER NOT NULL,
  compliance_type TEXT NOT NULL, -- monthly_vat, yearly_return, advance_tax, tds, wht
  fiscal_year TEXT, -- 2024-2025
  month TEXT, -- for monthly obligations
  due_date TEXT,
  submission_date TEXT,
  amount REAL,
  challan_number TEXT,
  status TEXT DEFAULT 'pending', -- pending, submitted, paid, overdue
  document_path TEXT,
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (firm_id) REFERENCES firms(id) ON DELETE CASCADE
);

-- ============================================
-- BANKING & FINANCIAL INSTRUMENTS
-- ============================================
CREATE TABLE IF NOT EXISTS bank_accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  firm_id INTEGER NOT NULL,
  bank_name TEXT NOT NULL,
  branch_name TEXT,
  account_number TEXT NOT NULL,
  account_type TEXT, -- current, savings, cd, fdr
  account_name TEXT,
  opening_date TEXT,
  maturity_date TEXT, -- for CD/FDR
  balance REAL DEFAULT 0,
  interest_rate REAL,
  signatory_1 TEXT,
  signatory_2 TEXT,
  status TEXT DEFAULT 'active',
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (firm_id) REFERENCES firms(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS pay_orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  firm_id INTEGER NOT NULL,
  tender_id INTEGER,
  bank_name TEXT NOT NULL,
  po_number TEXT,
  issue_date TEXT,
  amount REAL NOT NULL,
  in_favor_of TEXT, -- procuring entity
  purpose TEXT, -- tender document purchase
  status TEXT DEFAULT 'active', -- active, encashed, cancelled, expired
  encashment_date TEXT,
  document_path TEXT,
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (firm_id) REFERENCES firms(id) ON DELETE CASCADE,
  FOREIGN KEY (tender_id) REFERENCES tenders(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS bank_guarantees (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  firm_id INTEGER NOT NULL,
  tender_id INTEGER,
  project_id INTEGER,
  bg_type TEXT NOT NULL, -- tender_security, performance, advance_payment, retention
  bank_name TEXT NOT NULL,
  branch_name TEXT,
  bg_number TEXT,
  issue_date TEXT,
  expiry_date TEXT,
  amount REAL NOT NULL,
  percentage REAL, -- e.g., 2% for tender security
  in_favor_of TEXT,
  claim_period_days INTEGER,
  commission_rate REAL,
  commission_amount REAL,
  status TEXT DEFAULT 'active', -- active, expired, claimed, released, extended
  extension_date TEXT,
  release_date TEXT,
  document_path TEXT,
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (firm_id) REFERENCES firms(id) ON DELETE CASCADE,
  FOREIGN KEY (tender_id) REFERENCES tenders(id) ON DELETE SET NULL,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS loans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  firm_id INTEGER NOT NULL,
  bank_name TEXT NOT NULL,
  branch_name TEXT,
  loan_type TEXT, -- working_capital, term_loan, overdraft, credit_limit
  loan_number TEXT,
  sanction_date TEXT,
  loan_amount REAL NOT NULL,
  interest_rate REAL,
  tenure_months INTEGER,
  installment_amount REAL,
  disbursement_date TEXT,
  maturity_date TEXT,
  outstanding_amount REAL,
  collateral TEXT,
  guarantor TEXT,
  status TEXT DEFAULT 'active', -- active, closed, overdue
  document_path TEXT,
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (firm_id) REFERENCES firms(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS loan_payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  loan_id INTEGER NOT NULL,
  payment_date TEXT,
  due_date TEXT,
  principal_amount REAL,
  interest_amount REAL,
  total_amount REAL,
  payment_method TEXT,
  status TEXT DEFAULT 'pending', -- pending, paid, overdue
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (loan_id) REFERENCES loans(id) ON DELETE CASCADE
);

-- ============================================
-- TENDERS MANAGEMENT
-- ============================================
CREATE TABLE IF NOT EXISTS tenders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tender_id TEXT NOT NULL,
  procuring_entity TEXT,
  official TEXT,
  proc_type TEXT, -- Goods, Works, Services, Consultancy
  method TEXT, -- OTM, LTM, RFQ, Direct
  briefDesc TEXT,
  itemNo TEXT,
  itemDesc TEXT,
  techSpec TEXT,
  quantity TEXT,
  pod TEXT,
  delivery TEXT,
  invRef TEXT,
  docPrice TEXT,
  lastPurchase TEXT,
  lastSubmission TEXT,
  opening TEXT,
  tSec TEXT,
  validity TEXT,
  liquid TEXT,
  tenderPrep TEXT,
  reqDocs TEXT,
  inspection TEXT,
  contact TEXT,
  
  -- Additional fields
  tender_value REAL,
  eligibility TEXT,
  publication_date TEXT,
  site_visit_date TEXT,
  pre_bid_meeting TEXT,
  
  -- Status tracking
  status TEXT DEFAULT 'discovered', -- discovered, evaluated, preparing, submitted, opened, won, lost, cancelled
  source TEXT, -- e-GP, newspaper, direct
  sector TEXT, -- government, semi-government, private
  
  -- Assignment
  assigned_firm_id INTEGER,
  is_consortium INTEGER DEFAULT 0,
  
  -- Documents
  document_path TEXT,
  
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (assigned_firm_id) REFERENCES firms(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS tender_assignments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tender_id INTEGER NOT NULL,
  firm_id INTEGER NOT NULL,
  role TEXT, -- lead, partner, subcontractor
  share_percentage REAL,
  assignment_date TEXT,
  status TEXT DEFAULT 'active',
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (tender_id) REFERENCES tenders(id) ON DELETE CASCADE,
  FOREIGN KEY (firm_id) REFERENCES firms(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS tender_costs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tender_id INTEGER NOT NULL,
  firm_id INTEGER NOT NULL,
  cost_type TEXT NOT NULL, -- document_purchase, site_visit, pay_order, bg_commission, professional_fee, preparation
  amount REAL NOT NULL,
  payment_date TEXT,
  payment_method TEXT,
  receipt_number TEXT,
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (tender_id) REFERENCES tenders(id) ON DELETE CASCADE,
  FOREIGN KEY (firm_id) REFERENCES firms(id) ON DELETE CASCADE
);

-- ============================================
-- PROJECTS (Won Tenders)
-- ============================================
CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tender_id INTEGER NOT NULL,
  firm_id INTEGER NOT NULL,
  project_name TEXT NOT NULL,
  contract_number TEXT,
  contract_value REAL,
  contract_date TEXT,
  commencement_date TEXT,
  completion_date TEXT,
  extended_completion_date TEXT,
  
  -- Financial tracking
  advance_percentage REAL,
  advance_amount REAL,
  advance_received_date TEXT,
  retention_percentage REAL DEFAULT 10,
  retention_amount REAL,
  total_billed REAL DEFAULT 0,
  total_received REAL DEFAULT 0,
  outstanding_amount REAL DEFAULT 0,
  
  -- Status
  status TEXT DEFAULT 'ongoing', -- ongoing, completed, suspended, terminated
  completion_percentage REAL DEFAULT 0,
  
  -- Documents
  work_order_path TEXT,
  agreement_path TEXT,
  
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (tender_id) REFERENCES tenders(id) ON DELETE CASCADE,
  FOREIGN KEY (firm_id) REFERENCES firms(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS project_bills (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL,
  bill_type TEXT, -- advance, running, final, retention
  bill_number TEXT,
  bill_date TEXT,
  bill_amount REAL NOT NULL,
  deductions REAL DEFAULT 0,
  net_amount REAL,
  submission_date TEXT,
  approval_date TEXT,
  payment_date TEXT,
  payment_amount REAL,
  status TEXT DEFAULT 'pending', -- pending, submitted, approved, paid
  document_path TEXT,
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

-- ============================================
-- DOCUMENTS VAULT
-- ============================================
CREATE TABLE IF NOT EXISTS documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  firm_id INTEGER,
  tender_id INTEGER,
  project_id INTEGER,
  document_type TEXT NOT NULL, -- certificate, license, financial_statement, tender_doc, contract, etc
  document_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_size INTEGER,
  mime_type TEXT,
  issue_date TEXT,
  expiry_date TEXT,
  tags TEXT, -- comma-separated for search
  uploaded_by TEXT,
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (firm_id) REFERENCES firms(id) ON DELETE CASCADE,
  FOREIGN KEY (tender_id) REFERENCES tenders(id) ON DELETE CASCADE,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

-- ============================================
-- ALERTS & REMINDERS
-- ============================================
CREATE TABLE IF NOT EXISTS alerts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  alert_type TEXT NOT NULL, -- license_expiry, bg_expiry, tax_deadline, loan_payment, tender_deadline
  reference_type TEXT, -- license, enlistment, bank_guarantee, tender, loan_payment, tax_compliance
  reference_id INTEGER,
  firm_id INTEGER,
  title TEXT NOT NULL,
  message TEXT,
  alert_date TEXT NOT NULL,
  due_date TEXT,
  priority TEXT DEFAULT 'medium', -- high, medium, low
  status TEXT DEFAULT 'pending', -- pending, acknowledged, completed, dismissed
  notification_sent INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (firm_id) REFERENCES firms(id) ON DELETE CASCADE
);

-- ============================================
-- CONTACTS
-- ============================================
CREATE TABLE IF NOT EXISTS contacts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  firm_id INTEGER,
  contact_type TEXT, -- proprietor, partner, director, authorized_person, employee, vendor, client
  name TEXT NOT NULL,
  designation TEXT,
  department TEXT,
  email TEXT,
  phone TEXT,
  mobile TEXT,
  nid TEXT,
  address TEXT,
  authority_type TEXT, -- signatory, procurement, technical, financial
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (firm_id) REFERENCES firms(id) ON DELETE CASCADE
);

-- ============================================
-- USERS (For multi-user access)
-- ============================================
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL, -- hashed
  full_name TEXT,
  email TEXT,
  mobile TEXT,
  role TEXT DEFAULT 'user', -- admin, manager, user, viewer
  permissions TEXT, -- JSON: {firms: true, tenders: true, projects: true, etc}
  firm_access TEXT, -- comma-separated firm IDs or 'all'
  department TEXT,
  designation TEXT,
  photo_url TEXT,
  status TEXT DEFAULT 'active', -- active, inactive, suspended
  last_login DATETIME,
  login_attempts INTEGER DEFAULT 0,
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- ACTIVITY LOG
-- ============================================
CREATE TABLE IF NOT EXISTS activity_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  action TEXT NOT NULL,
  entity_type TEXT, -- firm, tender, project, license, etc
  entity_id INTEGER,
  description TEXT,
  ip_address TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

-- ============================================
-- TEAM MEMBERS
-- ============================================
CREATE TABLE IF NOT EXISTS team_members (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  designation TEXT,
  department TEXT, -- management, operations, accounts, documentation, field
  email TEXT,
  mobile TEXT,
  role TEXT NOT NULL, -- admin, manager, coordinator, accountant, document_handler, field_officer
  status TEXT DEFAULT 'active', -- active, inactive, on_leave
  joining_date DATE,
  photo_url TEXT,
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- TASKS
-- ============================================
CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  description TEXT,
  task_type TEXT NOT NULL, -- tender_preparation, document_collection, bank_work, site_visit, license_renewal, meeting, payment_followup, other
  priority TEXT DEFAULT 'medium', -- high, medium, low
  status TEXT DEFAULT 'pending', -- pending, in_progress, completed, cancelled, on_hold
  assigned_to INTEGER, -- team_member_id
  assigned_by INTEGER, -- team_member_id
  firm_id INTEGER,
  tender_id INTEGER,
  project_id INTEGER,
  due_date DATE,
  completed_date DATE,
  estimated_hours REAL,
  actual_hours REAL,
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (assigned_to) REFERENCES team_members(id) ON DELETE SET NULL,
  FOREIGN KEY (assigned_by) REFERENCES team_members(id) ON DELETE SET NULL,
  FOREIGN KEY (firm_id) REFERENCES firms(id) ON DELETE CASCADE,
  FOREIGN KEY (tender_id) REFERENCES tenders(id) ON DELETE CASCADE,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

-- ============================================
-- TASK COMMENTS
-- ============================================
CREATE TABLE IF NOT EXISTS task_comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id INTEGER NOT NULL,
  member_id INTEGER NOT NULL,
  comment TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
  FOREIGN KEY (member_id) REFERENCES team_members(id) ON DELETE CASCADE
);

-- ============================================
-- SUPPLIERS
-- ============================================
CREATE TABLE IF NOT EXISTS suppliers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  company_name TEXT,
  supplier_type TEXT NOT NULL, -- material, equipment, subcontractor, consultant, service_provider
  category TEXT, -- cement, steel, electrical, machinery, labor, etc.
  tin TEXT,
  trade_license TEXT,
  contact_person TEXT,
  designation TEXT,
  mobile TEXT,
  email TEXT,
  address TEXT,
  city TEXT,
  country TEXT DEFAULT 'Bangladesh',
  bank_name TEXT,
  account_number TEXT,
  payment_terms TEXT, -- cash, credit_7days, credit_15days, credit_30days
  credit_limit REAL,
  current_due REAL DEFAULT 0,
  rating INTEGER, -- 1-5 stars
  status TEXT DEFAULT 'active', -- active, inactive, blacklisted
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- SUPPLIER TRANSACTIONS
-- ============================================
CREATE TABLE IF NOT EXISTS supplier_transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  supplier_id INTEGER NOT NULL,
  project_id INTEGER,
  transaction_type TEXT NOT NULL, -- purchase, payment, return, adjustment
  transaction_date DATE NOT NULL,
  amount REAL NOT NULL,
  payment_method TEXT, -- cash, bank_transfer, cheque, pay_order
  reference_number TEXT,
  description TEXT,
  status TEXT DEFAULT 'completed', -- pending, completed, cancelled
  created_by INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE CASCADE,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

-- ============================================
-- CLIENTS
-- ============================================
CREATE TABLE IF NOT EXISTS clients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  organization_type TEXT NOT NULL, -- government, semi_government, private, ngo, international
  department TEXT, -- PWD, LGED, RHD, BWDB, etc.
  contact_person TEXT,
  designation TEXT,
  mobile TEXT,
  email TEXT,
  office_address TEXT,
  city TEXT,
  region TEXT, -- Dhaka, Chittagong, Rajshahi, Khulna, Sylhet, Barisal, Rangpur, Mymensingh
  postal_code TEXT,
  website TEXT,
  payment_reputation TEXT, -- excellent, good, average, poor
  average_payment_days INTEGER, -- average days to process payment
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- CLIENT CONTACTS
-- ============================================
CREATE TABLE IF NOT EXISTS client_contacts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  designation TEXT,
  department TEXT,
  mobile TEXT,
  email TEXT,
  is_primary INTEGER DEFAULT 0, -- 0=no, 1=yes
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
);

-- ============================================
-- TENDER SUMMARY BUILDER DATA
-- ============================================
CREATE TABLE IF NOT EXISTS tender_summaries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  
  -- Basic Tender Information (matching e-GP format)
  egp_tender_id TEXT, -- e-GP Tender ID: 1131373
  procuring_entity TEXT, -- Chief Controller of Stores, Pahartali
  official_inviting_tender TEXT, -- Name of official
  brief_description TEXT, -- Main description
  invitation_reference TEXT, -- Reference number
  invitation_date TEXT,
  
  -- Document & Submission Details
  document_price REAL,
  document_purchase_deadline TEXT,
  submission_deadline TEXT,
  tender_opening_date TEXT,
  
  -- Procurement Details
  procurement_type TEXT, -- NCT, OCT, RFQ, etc.
  procurement_method TEXT, -- OSTETM, OTM, LTM, etc.
  
  -- Financial Requirements
  tender_security_amount REAL,
  tender_security_in_favour_of TEXT,
  liquid_asset_requirement REAL,
  liquid_asset_in_favour_of TEXT,
  
  -- Inspection & Testing Details
  inspection_type TEXT,
  inspection_milestone TEXT,
  inspection_place TEXT,
  inspection_procedure TEXT,
  
  -- Analysis Fields
  estimated_tender_value REAL,
  our_estimated_cost REAL,
  profit_margin REAL,
  
  -- Resource Assessment
  manpower_required TEXT, -- JSON
  equipment_needed TEXT, -- JSON
  materials_cost REAL,
  labor_cost REAL,
  overhead_cost REAL,
  
  -- Timeline
  preparation_days INTEGER,
  execution_days INTEGER,
  
  -- Risk Assessment
  risk_level TEXT, -- low, medium, high
  risks TEXT, -- JSON array
  mitigation_plans TEXT, -- JSON array
  
  -- Decision Support
  executive_summary TEXT,
  recommendation TEXT, -- should_participate, risky, avoid
  confidence_level TEXT, -- high, medium, low
  notes TEXT,
  
  -- Metadata
  firm_id INTEGER,
  tender_id INTEGER,
  created_by INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (tender_id) REFERENCES tenders(id) ON DELETE CASCADE,
  FOREIGN KEY (firm_id) REFERENCES firms(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

-- Tender Summary Items (BOQ/Items - can add multiple)
CREATE TABLE IF NOT EXISTS tender_summary_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  summary_id INTEGER NOT NULL,
  item_no TEXT, -- 01, 02, etc.
  description TEXT, -- Wheel Set Guide, Item No: 104-00720
  technical_specification TEXT, -- Drawing No, hardness range, etc.
  quantity TEXT, -- 515 Nos.
  unit TEXT, -- Nos, MT, KG, etc.
  point_of_delivery TEXT, -- DCOS/INSP/PHT
  delivery_period TEXT, -- 120 days
  unit_rate REAL,
  total_amount REAL,
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (summary_id) REFERENCES tender_summaries(id) ON DELETE CASCADE
);

-- Tender Preparation Requirements (Checklist - add one by one)
CREATE TABLE IF NOT EXISTS tender_preparation_requirements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  summary_id INTEGER NOT NULL,
  requirement_no INTEGER, -- 1, 2, 3...
  requirement_text TEXT NOT NULL, -- General Experience: 5 years
  is_fulfilled BOOLEAN DEFAULT 0, -- checkbox
  notes TEXT,
  document_path TEXT, -- path to supporting document
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (summary_id) REFERENCES tender_summaries(id) ON DELETE CASCADE
);

-- ============================================
-- INDEXES for performance
-- ============================================
CREATE INDEX IF NOT EXISTS idx_licenses_firm ON licenses(firm_id);
CREATE INDEX IF NOT EXISTS idx_licenses_expiry ON licenses(expiry_date);
CREATE INDEX IF NOT EXISTS idx_enlistments_firm ON enlistments(firm_id);
CREATE INDEX IF NOT EXISTS idx_bg_firm ON bank_guarantees(firm_id);
CREATE INDEX IF NOT EXISTS idx_bg_expiry ON bank_guarantees(expiry_date);
CREATE INDEX IF NOT EXISTS idx_tenders_status ON tenders(status);
CREATE INDEX IF NOT EXISTS idx_tenders_firm ON tenders(assigned_firm_id);
CREATE INDEX IF NOT EXISTS idx_alerts_status ON alerts(status);
CREATE INDEX IF NOT EXISTS idx_alerts_date ON alerts(alert_date);
CREATE INDEX IF NOT EXISTS idx_tasks_assigned_to ON tasks(assigned_to);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON tasks(due_date);
CREATE INDEX IF NOT EXISTS idx_task_comments_task ON task_comments(task_id);
CREATE INDEX IF NOT EXISTS idx_suppliers_type ON suppliers(supplier_type);
CREATE INDEX IF NOT EXISTS idx_suppliers_status ON suppliers(status);
CREATE INDEX IF NOT EXISTS idx_tender_summary_items ON tender_summary_items(summary_id);
CREATE INDEX IF NOT EXISTS idx_tender_prep_requirements ON tender_preparation_requirements(summary_id);
CREATE INDEX IF NOT EXISTS idx_supplier_transactions_supplier ON supplier_transactions(supplier_id);
CREATE INDEX IF NOT EXISTS idx_supplier_transactions_project ON supplier_transactions(project_id);
CREATE INDEX IF NOT EXISTS idx_clients_type ON clients(organization_type);
CREATE INDEX IF NOT EXISTS idx_client_contacts_client ON client_contacts(client_id);
CREATE INDEX IF NOT EXISTS idx_tender_summaries_tender ON tender_summaries(tender_id);
CREATE INDEX IF NOT EXISTS idx_tender_summaries_firm ON tender_summaries(firm_id);

-- ============================================
-- LETTER HUB - Letter Templates & Management
-- ============================================
CREATE TABLE IF NOT EXISTS letter_categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE, -- Business, Legal, HR, Project, Compliance, General
  description TEXT,
  icon TEXT, -- emoji or icon name
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS letter_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  subject TEXT,
  content TEXT NOT NULL, -- Letter body with placeholders like {{company_name}}, {{date}}, etc.
  tags TEXT, -- Comma-separated tags for search
  language TEXT DEFAULT 'en', -- en, bn
  is_official BOOLEAN DEFAULT 1,
  usage_count INTEGER DEFAULT 0,
  created_by INTEGER,
  status TEXT DEFAULT 'active', -- active, archived
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (category_id) REFERENCES letter_categories(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS generated_letters (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  template_id INTEGER,
  firm_id INTEGER,
  project_id INTEGER,
  reference_number TEXT,
  recipient_name TEXT,
  recipient_designation TEXT,
  recipient_organization TEXT,
  recipient_address TEXT,
  subject TEXT,
  content TEXT NOT NULL, -- Final letter with placeholders replaced
  letter_date TEXT,
  generated_by INTEGER,
  sent_date TEXT,
  status TEXT DEFAULT 'draft', -- draft, sent, archived
  document_path TEXT, -- Path to PDF if generated
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (template_id) REFERENCES letter_templates(id),
  FOREIGN KEY (firm_id) REFERENCES firms(id),
  FOREIGN KEY (project_id) REFERENCES projects(id),
  FOREIGN KEY (generated_by) REFERENCES users(id)
);

-- ============================================
-- EXPENSE MANAGER
-- ============================================
CREATE TABLE IF NOT EXISTS expense_categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE, -- Office Rent, Utilities, Salaries, Travel, Materials, Equipment, etc.
  parent_id INTEGER, -- For subcategories
  description TEXT,
  budget_limit REAL, -- Monthly or yearly budget limit
  icon TEXT,
  is_active BOOLEAN DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (parent_id) REFERENCES expense_categories(id)
);

CREATE TABLE IF NOT EXISTS expenses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category_id INTEGER NOT NULL,
  firm_id INTEGER, -- Which firm/client this expense is for
  project_id INTEGER, -- Which project this expense relates to
  expense_date TEXT NOT NULL,
  amount REAL NOT NULL,
  payment_method TEXT, -- cash, bank_transfer, check, card, mobile_banking
  payment_reference TEXT, -- Check number, transaction ID, etc.
  vendor_name TEXT,
  vendor_contact TEXT,
  description TEXT NOT NULL,
  receipt_number TEXT,
  receipt_path TEXT, -- Path to uploaded receipt/invoice
  is_billable BOOLEAN DEFAULT 0, -- Can be billed to client
  is_reimbursable BOOLEAN DEFAULT 0,
  reimbursed BOOLEAN DEFAULT 0,
  reimbursement_date TEXT,
  approved_by INTEGER,
  approval_date TEXT,
  status TEXT DEFAULT 'pending', -- pending, approved, rejected, paid, reimbursed
  notes TEXT,
  created_by INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (category_id) REFERENCES expense_categories(id),
  FOREIGN KEY (firm_id) REFERENCES firms(id),
  FOREIGN KEY (project_id) REFERENCES projects(id),
  FOREIGN KEY (approved_by) REFERENCES users(id),
  FOREIGN KEY (created_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS expense_budgets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category_id INTEGER NOT NULL,
  project_id INTEGER,
  budget_amount REAL NOT NULL,
  period_type TEXT NOT NULL, -- monthly, quarterly, yearly
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  spent_amount REAL DEFAULT 0,
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (category_id) REFERENCES expense_categories(id),
  FOREIGN KEY (project_id) REFERENCES projects(id)
);

-- Indexes for new modules
CREATE INDEX IF NOT EXISTS idx_letter_templates_category ON letter_templates(category_id);
CREATE INDEX IF NOT EXISTS idx_letter_templates_status ON letter_templates(status);
CREATE INDEX IF NOT EXISTS idx_generated_letters_template ON generated_letters(template_id);
CREATE INDEX IF NOT EXISTS idx_generated_letters_firm ON generated_letters(firm_id);
CREATE INDEX IF NOT EXISTS idx_generated_letters_status ON generated_letters(status);
CREATE INDEX IF NOT EXISTS idx_expenses_category ON expenses(category_id);
CREATE INDEX IF NOT EXISTS idx_expenses_firm ON expenses(firm_id);
CREATE INDEX IF NOT EXISTS idx_expenses_project ON expenses(project_id);
CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(expense_date);
CREATE INDEX IF NOT EXISTS idx_expenses_status ON expenses(status);
CREATE INDEX IF NOT EXISTS idx_expense_budgets_category ON expense_budgets(category_id);
CREATE INDEX IF NOT EXISTS idx_expense_budgets_project ON expense_budgets(project_id);

-- ============================================
-- FIRM DOCUMENTS MANAGEMENT
-- ============================================
CREATE TABLE IF NOT EXISTS firm_documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  firm_id INTEGER NOT NULL,
  document_type TEXT NOT NULL, -- trade_license, tin_certificate, vat_certificate, enlistment, bank_statement, project_completion, financial_statement, moa, aoa, incorporation, partnership_deed, form_12, board_resolution, audit_report, balance_sheet, certificate, contract, agreement, misc
  document_name TEXT NOT NULL,
  document_number TEXT,
  description TEXT,
  issue_date TEXT,
  expiry_date TEXT, -- NULL for non-expiring documents
  issuing_authority TEXT,
  file_path TEXT, -- Path to uploaded file
  file_type TEXT, -- pdf, jpg, png, doc, xlsx
  file_size INTEGER, -- in bytes
  status TEXT DEFAULT 'active', -- active, expired, renewed, cancelled
  has_expiry BOOLEAN DEFAULT 0, -- 0 = no expiry, 1 = has expiry
  reminder_days INTEGER DEFAULT 30, -- Days before expiry to send reminder
  uploaded_by INTEGER,
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (firm_id) REFERENCES firms(id) ON DELETE CASCADE,
  FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE SET NULL
);

-- Indexes for firm documents
CREATE INDEX IF NOT EXISTS idx_firm_documents_firm ON firm_documents(firm_id);
CREATE INDEX IF NOT EXISTS idx_firm_documents_type ON firm_documents(document_type);
CREATE INDEX IF NOT EXISTS idx_firm_documents_status ON firm_documents(status);
CREATE INDEX IF NOT EXISTS idx_firm_documents_expiry ON firm_documents(expiry_date);
CREATE INDEX IF NOT EXISTS idx_firm_documents_has_expiry ON firm_documents(has_expiry);


