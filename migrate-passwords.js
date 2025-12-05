// migrate-passwords.js - Hash existing plain text passwords
require('dotenv').config();
const Database = require('better-sqlite3');
const path = require('path');
const { hashPassword } = require('./utils/password');

const DB_FILE = process.env.DB_PATH || path.join(__dirname, 'data', 'tenders.db');
const db = new Database(DB_FILE, { readonly: false });

const row = (sql, params = []) => db.prepare(sql).get(params);
const rows = (sql, params = []) => db.prepare(sql).all(params);
const run = (sql, params = []) => db.prepare(sql).run(params);

async function migratePasswords() {
  console.log('🔐 Starting password migration...\n');
  
  try {
    // Get all users
    const users = rows('SELECT id, username, password FROM users');
    
    console.log(`Found ${users.length} users\n`);
    
    for (const user of users) {
      // Check if password is already hashed (bcrypt hashes start with $2b$)
      if (user.password && user.password.startsWith('$2b$')) {
        console.log(`✅ ${user.username}: Already hashed`);
        continue;
      }
      
      // If password is too short, upgrade it
      let passwordToHash = user.password;
      if (!passwordToHash || passwordToHash.length < 8) {
        passwordToHash = 'Demo@123456'; // Secure default password
        console.log(`⚠️  ${user.username}: Password upgraded to secure default`);
      }
      
      // Hash the password
      const hashedPassword = await hashPassword(passwordToHash);
      
      // Update database
      run('UPDATE users SET password = ?, login_attempts = 0 WHERE id = ?', [hashedPassword, user.id]);
      
      console.log(`🔒 ${user.username}: Password hashed`);
    }
    
    console.log('\n✅ Password migration completed successfully!');
    console.log('\n⚠️  IMPORTANT NOTES:');
    console.log('   • All users with weak passwords now use: Demo@123456');
    console.log('   • Users MUST change their password on first login');
    console.log('   • Passwords are now securely hashed with bcrypt');
    console.log('   • Login attempts counter has been reset\n');
    
  } catch (err) {
    console.error('❌ Migration error:', err);
    process.exit(1);
  } finally {
    db.close();
  }
}

// Run migration
migratePasswords();
