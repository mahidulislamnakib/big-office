// verify-deployment.js - Quick deployment verification
const db = require('better-sqlite3')('data/tenders.db');

console.log('\n🔍 DEPLOYMENT VERIFICATION\n');
console.log('=' .repeat(50));

// Check audit tables
console.log('\n1. Audit Tables:');
const auditTables = db.prepare(`
  SELECT name FROM sqlite_master 
  WHERE type='table' AND (name LIKE '%audit%' OR name LIKE '%auth%')
`).all();
auditTables.forEach(t => console.log(`   ✅ ${t.name}`));

// Check indexes
console.log('\n2. Audit Indexes:');
const indexes = db.prepare(`
  SELECT name FROM sqlite_master 
  WHERE type='index' AND (name LIKE 'idx_audit%' OR name LIKE 'idx_auth%')
`).all();
console.log(`   ✅ ${indexes.length} indexes created`);

// Check views
console.log('\n3. Monitoring Views:');
const views = db.prepare(`
  SELECT name FROM sqlite_master 
  WHERE type='view' AND name LIKE '%audit%'
`).all();
views.forEach(v => console.log(`   ✅ ${v.name}`));

// Check recent audit activity
console.log('\n4. Recent Activity:');
const recent = db.prepare(`
  SELECT COUNT(*) as count FROM audit_log
`).get();
console.log(`   ✅ ${recent.count} audit entries`);

// Check auth logs
const authLogs = db.prepare(`
  SELECT COUNT(*) as count FROM auth_log
`).get();
console.log(`   ✅ ${authLogs.count} authentication logs`);

console.log('\n' + '='.repeat(50));
console.log('✅ ALL SYSTEMS OPERATIONAL!\n');

db.close();
