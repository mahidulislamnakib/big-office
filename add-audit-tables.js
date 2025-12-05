// add-audit-tables.js - Add audit logging tables to existing database
require('dotenv').config();
const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const DB_FILE = path.join(__dirname, 'data', 'tenders.db');

if (!fs.existsSync(DB_FILE)) {
  console.error('❌ Database not found at:', DB_FILE);
  console.error('Run `npm run init-db` first');
  process.exit(1);
}

const db = new Database(DB_FILE, { readonly: false });

console.log('🔧 Adding audit logging tables...\n');

try {
  // Read audit tables SQL
  const auditSQL = fs.readFileSync(path.join(__dirname, 'audit-tables.sql'), 'utf8');
  
  // Execute the entire SQL file at once
  db.exec(auditSQL);
  
  console.log('✅ Audit tables SQL executed successfully');
  
  // Verify tables exist
  const tables = db.prepare(`
    SELECT name FROM sqlite_master 
    WHERE type='table' AND name IN ('audit_log', 'auth_log')
  `).all();
  
  console.log('\\n📋 Audit tables created:');
  tables.forEach(t => console.log(`   - ${t.name}`));
  
  // Verify indexes
  const indexes = db.prepare(`
    SELECT name FROM sqlite_master 
    WHERE type='index' AND name LIKE 'idx_audit%' OR name LIKE 'idx_auth%'
  `).all();
  
  console.log('\\n🔍 Indexes created:', indexes.length);
  
  // Verify views
  const views = db.prepare(`
    SELECT name FROM sqlite_master 
    WHERE type='view' AND (name LIKE '%audit%' OR name LIKE '%auth%')
  `).all();
  
  console.log('\\n👁️  Views created:');
  views.forEach(v => console.log(`   - ${v.name}`));
  
  console.log('\\n✅ Audit logging is now enabled!');
  console.log('\\n📊 You can now:');
  console.log('   - Track all data modifications');
  console.log('   - Monitor authentication attempts');
  console.log('   - View audit history in dashboard');
  console.log('   - Detect suspicious activity\\n');
  
} catch (err) {
  console.error('❌ Error adding audit tables:', err.message);
  process.exit(1);
} finally {
  db.close();
}
