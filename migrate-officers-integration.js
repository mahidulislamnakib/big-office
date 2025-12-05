/**
 * Migration: Add officer integration to tenders and projects
 * This adds officer_id fields to link officers with tenders and projects
 */

const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, 'data', 'tenders.db'));

console.log('🔄 Starting officer integration migration...\n');

try {
  // Add officer_id to tenders table (for the official/contact person)
  console.log('1. Adding officer_id to tenders table...');
  try {
    db.exec(`
      ALTER TABLE tenders ADD COLUMN officer_id TEXT 
      REFERENCES officers(id) ON DELETE SET NULL
    `);
    console.log('✅ Added officer_id to tenders');
  } catch (err) {
    if (err.message.includes('duplicate column')) {
      console.log('ℹ️  Column officer_id already exists in tenders');
    } else {
      throw err;
    }
  }

  // Add coordinator_id to projects table
  console.log('\n2. Adding coordinator_id to projects table...');
  try {
    db.exec(`
      ALTER TABLE projects ADD COLUMN coordinator_id TEXT 
      REFERENCES officers(id) ON DELETE SET NULL
    `);
    console.log('✅ Added coordinator_id to projects');
  } catch (err) {
    if (err.message.includes('duplicate column')) {
      console.log('ℹ️  Column coordinator_id already exists in projects');
    } else {
      throw err;
    }
  }

  // Create index for better query performance
  console.log('\n3. Creating indexes...');
  try {
    db.exec(`CREATE INDEX IF NOT EXISTS idx_tenders_officer ON tenders(officer_id)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_projects_coordinator ON projects(coordinator_id)`);
    console.log('✅ Indexes created');
  } catch (err) {
    console.log('ℹ️  Indexes may already exist');
  }

  console.log('\n✅ Migration completed successfully!');
  console.log('\nChanges made:');
  console.log('- Added officer_id field to tenders table');
  console.log('- Added coordinator_id field to projects table');
  console.log('- Created performance indexes');
  console.log('\nYou can now link officers to tenders and projects in the UI.');

} catch (err) {
  console.error('❌ Migration failed:', err.message);
  process.exit(1);
} finally {
  db.close();
}
