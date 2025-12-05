// ============================================
// OFFICERS DIRECTORY - PRIVACY & VISIBILITY FIELDS
// Big Office v3.2 - Phase 3 Enhancement
// Adds missing privacy, visibility, and consent fields
// ============================================

const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, 'data', 'tenders.db');
const db = new Database(dbPath);

console.log('🔒 Adding Privacy & Visibility Fields to Officers Directory...\n');

try {
  db.exec('BEGIN TRANSACTION');
  
  // ============================================
  // 1. ADD VISIBILITY CONTROL FIELDS
  // ============================================
  
  console.log('📋 Adding visibility control fields...');
  
  const visibilityFields = [
    {
      name: 'phone_visibility',
      type: 'TEXT',
      default: "'internal'",
      check: "CHECK(phone_visibility IN ('public', 'internal', 'restricted', 'private'))"
    },
    {
      name: 'email_visibility',
      type: 'TEXT',
      default: "'internal'",
      check: "CHECK(email_visibility IN ('public', 'internal', 'restricted', 'private'))"
    },
    {
      name: 'nid_visibility',
      type: 'TEXT',
      default: "'restricted'",
      check: "CHECK(nid_visibility IN ('public', 'internal', 'restricted', 'private'))"
    },
    {
      name: 'profile_published',
      type: 'BOOLEAN',
      default: '0',
      check: null
    },
    {
      name: 'verification_status',
      type: 'TEXT',
      default: "'pending'",
      check: "CHECK(verification_status IN ('pending', 'verified', 'rejected', 'needs_update'))"
    },
    {
      name: 'consent_record',
      type: 'TEXT',
      default: 'NULL',
      check: null
    }
  ];
  
  for (const field of visibilityFields) {
    try {
      let sql = `ALTER TABLE officers ADD COLUMN ${field.name} ${field.type}`;
      if (field.default) sql += ` DEFAULT ${field.default}`;
      if (field.check) sql += ` ${field.check}`;
      
      db.prepare(sql).run();
      console.log(`  ✅ Added: ${field.name}`);
    } catch (err) {
      if (err.message.includes('duplicate column name')) {
        console.log(`  ⏭️  Column ${field.name} already exists`);
      } else {
        throw err;
      }
    }
  }
  
  // ============================================
  // 2. SET DEFAULT VALUES FOR EXISTING RECORDS
  // ============================================
  
  console.log('\n📝 Setting default values for existing officers...');
  
  const updateDefaults = db.prepare(`
    UPDATE officers 
    SET 
      phone_visibility = COALESCE(phone_visibility, 'internal'),
      email_visibility = COALESCE(email_visibility, 'internal'),
      nid_visibility = COALESCE(nid_visibility, 'restricted'),
      profile_published = COALESCE(profile_published, 0),
      verification_status = COALESCE(verification_status, 'pending')
    WHERE id IS NOT NULL
  `);
  
  const result = updateDefaults.run();
  console.log(`  ✅ Updated ${result.changes} existing officer records`);
  
  // ============================================
  // 3. CREATE INDEXES FOR PERFORMANCE
  // ============================================
  
  console.log('\n🔍 Creating indexes for visibility queries...');
  
  const indexes = [
    'CREATE INDEX IF NOT EXISTS idx_officers_profile_published ON officers(profile_published)',
    'CREATE INDEX IF NOT EXISTS idx_officers_verification_status ON officers(verification_status)',
    'CREATE INDEX IF NOT EXISTS idx_officers_visibility ON officers(profile_published, verification_status)'
  ];
  
  for (const indexSQL of indexes) {
    db.prepare(indexSQL).run();
  }
  console.log('  ✅ Created visibility indexes');
  
  // ============================================
  // 4. VERIFY SCHEMA CHANGES
  // ============================================
  
  console.log('\n🔬 Verifying schema changes...');
  
  const columns = db.prepare("PRAGMA table_info(officers)").all();
  const addedColumns = columns.filter(col => 
    ['phone_visibility', 'email_visibility', 'nid_visibility', 'profile_published', 'verification_status', 'consent_record'].includes(col.name)
  );
  
  console.log(`  ✅ Verified ${addedColumns.length}/6 new columns:`);
  addedColumns.forEach(col => {
    console.log(`     • ${col.name} (${col.type})`);
  });
  
  db.exec('COMMIT');
  
  console.log('\n✅ Migration completed successfully!');
  console.log('\n📊 Privacy & Visibility Summary:');
  console.log('   • phone_visibility: Controls phone number access (public/internal/restricted/private)');
  console.log('   • email_visibility: Controls email address access (public/internal/restricted/private)');
  console.log('   • nid_visibility: Controls NID number access (public/internal/restricted/private)');
  console.log('   • profile_published: Officer profile published to public directory (0/1)');
  console.log('   • verification_status: Profile verification state (pending/verified/rejected/needs_update)');
  console.log('   • consent_record: JSON record of data sharing consents');
  console.log('\n🔐 Default Security Settings:');
  console.log('   • Phone: internal (visible to logged-in users only)');
  console.log('   • Email: internal (visible to logged-in users only)');
  console.log('   • NID: restricted (visible to admins only)');
  console.log('   • Profile: NOT published (internal directory only)');
  console.log('   • Status: pending verification\n');
  
} catch (error) {
  db.exec('ROLLBACK');
  console.error('\n❌ Migration failed:', error.message);
  console.error(error.stack);
  process.exit(1);
} finally {
  db.close();
}
