const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, 'data', 'tenders.db');
const db = new Database(dbPath);

console.log('🔄 Adding officer deeds tracking tables...\n');

try {
  // Create officer_deeds table
  db.exec(`
    CREATE TABLE IF NOT EXISTS officer_deeds (
      id TEXT PRIMARY KEY,
      officer_id TEXT NOT NULL,
      deed_type TEXT NOT NULL CHECK(deed_type IN ('good', 'bad')),
      title TEXT NOT NULL,
      description TEXT,
      deed_date DATE NOT NULL,
      severity TEXT CHECK(severity IN ('minor', 'moderate', 'major', 'critical')),
      points INTEGER DEFAULT 0,
      category TEXT,
      reported_by TEXT,
      verified_by TEXT,
      verification_date DATE,
      verification_status TEXT DEFAULT 'pending' CHECK(verification_status IN ('pending', 'verified', 'rejected')),
      attachments TEXT,
      remarks TEXT,
      is_confidential INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (officer_id) REFERENCES officers(id) ON DELETE CASCADE
    )
  `);
  console.log('✅ Created officer_deeds table');

  // Create indexes for performance
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_officer_deeds_officer ON officer_deeds(officer_id);
    CREATE INDEX IF NOT EXISTS idx_officer_deeds_type ON officer_deeds(deed_type);
    CREATE INDEX IF NOT EXISTS idx_officer_deeds_date ON officer_deeds(deed_date);
    CREATE INDEX IF NOT EXISTS idx_officer_deeds_status ON officer_deeds(verification_status);
  `);
  console.log('✅ Created indexes on officer_deeds');

  // Create deed_categories table for predefined categories
  db.exec(`
    CREATE TABLE IF NOT EXISTS deed_categories (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      type TEXT NOT NULL CHECK(type IN ('good', 'bad')),
      default_points INTEGER DEFAULT 0,
      description TEXT,
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  console.log('✅ Created deed_categories table');

  // Insert default good deed categories
  const goodCategories = [
    { id: 'good-excellence', name: 'Excellence in Work', points: 10, desc: 'Outstanding performance and quality of work' },
    { id: 'good-leadership', name: 'Leadership', points: 15, desc: 'Demonstrated leadership and team guidance' },
    { id: 'good-innovation', name: 'Innovation', points: 12, desc: 'Innovative ideas and problem-solving' },
    { id: 'good-teamwork', name: 'Teamwork', points: 8, desc: 'Exceptional collaboration and team support' },
    { id: 'good-punctuality', name: 'Punctuality', points: 5, desc: 'Consistent punctuality and attendance' },
    { id: 'good-initiative', name: 'Initiative', points: 10, desc: 'Taking initiative beyond assigned duties' },
    { id: 'good-mentorship', name: 'Mentorship', points: 12, desc: 'Mentoring and training colleagues' },
    { id: 'good-customer', name: 'Customer Service', points: 10, desc: 'Excellent customer/client service' },
    { id: 'good-safety', name: 'Safety Compliance', points: 8, desc: 'Promoting workplace safety' },
    { id: 'good-award', name: 'Award/Recognition', points: 20, desc: 'External awards or recognition' }
  ];

  const insertGood = db.prepare(`
    INSERT OR IGNORE INTO deed_categories (id, name, type, default_points, description)
    VALUES (?, ?, 'good', ?, ?)
  `);

  for (const cat of goodCategories) {
    insertGood.run(cat.id, cat.name, cat.points, cat.desc);
  }
  console.log('✅ Inserted good deed categories');

  // Insert default bad deed categories
  const badCategories = [
    { id: 'bad-tardiness', name: 'Tardiness/Absence', points: -5, desc: 'Late arrival or unauthorized absence' },
    { id: 'bad-misconduct', name: 'Misconduct', points: -15, desc: 'Inappropriate behavior or conduct' },
    { id: 'bad-negligence', name: 'Negligence', points: -10, desc: 'Negligence in duties or responsibilities' },
    { id: 'bad-insubordination', name: 'Insubordination', points: -12, desc: 'Failure to follow instructions' },
    { id: 'bad-safety', name: 'Safety Violation', points: -15, desc: 'Violation of safety protocols' },
    { id: 'bad-ethics', name: 'Ethics Violation', points: -20, desc: 'Breach of code of ethics' },
    { id: 'bad-policy', name: 'Policy Violation', points: -10, desc: 'Violation of company policies' },
    { id: 'bad-quality', name: 'Poor Work Quality', points: -8, desc: 'Below standard work quality' },
    { id: 'bad-complaint', name: 'Formal Complaint', points: -12, desc: 'Formal complaint received' },
    { id: 'bad-disciplinary', name: 'Disciplinary Action', points: -25, desc: 'Official disciplinary action taken' }
  ];

  const insertBad = db.prepare(`
    INSERT OR IGNORE INTO deed_categories (id, name, type, default_points, description)
    VALUES (?, ?, 'bad', ?, ?)
  `);

  for (const cat of badCategories) {
    insertBad.run(cat.id, cat.name, cat.points, cat.desc);
  }
  console.log('✅ Inserted bad deed categories');

  // Add deed summary columns to officers table
  db.exec(`
    ALTER TABLE officers ADD COLUMN good_deeds_count INTEGER DEFAULT 0;
  `).catch(() => console.log('⚠️  good_deeds_count column already exists'));

  db.exec(`
    ALTER TABLE officers ADD COLUMN bad_deeds_count INTEGER DEFAULT 0;
  `).catch(() => console.log('⚠️  bad_deeds_count column already exists'));

  db.exec(`
    ALTER TABLE officers ADD COLUMN deed_points_total INTEGER DEFAULT 0;
  `).catch(() => console.log('⚠️  deed_points_total column already exists'));

  db.exec(`
    ALTER TABLE officers ADD COLUMN performance_rating TEXT;
  `).catch(() => console.log('⚠️  performance_rating column already exists'));

  console.log('✅ Added deed tracking columns to officers table');

  console.log('\n✅ Migration completed successfully!');
  console.log('\n📊 Deed Tracking System:');
  console.log('   - Good deeds: Excellence, Leadership, Innovation, etc.');
  console.log('   - Bad deeds: Misconduct, Negligence, Policy violations, etc.');
  console.log('   - Point-based performance rating system');
  console.log('   - Verification workflow (pending → verified → rejected)');
  console.log('   - Confidential deed tracking option\n');

} catch (err) {
  console.error('❌ Migration failed:', err.message);
  process.exit(1);
} finally {
  db.close();
}
