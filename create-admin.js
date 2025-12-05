// create-admin.js - Create default admin user
const Database = require('better-sqlite3');
const path = require('path');
const { hashPassword } = require('./utils/password');

const dbFile = path.join(__dirname, 'data', 'tenders.db');
const db = new Database(dbFile);

async function createUsers() {
  try {
    // Check if admin exists
    const existing = db.prepare('SELECT id FROM users WHERE username = ?').get('admin');
    
    if (existing) {
      console.log('Admin user already exists. Updating password...');
      const hashedPassword = await hashPassword('admin123');
      db.prepare('UPDATE users SET password = ? WHERE username = ?').run(hashedPassword, 'admin');
      console.log('✅ Admin password updated');
    } else {
      console.log('Creating admin user...');
      const hashedPassword = await hashPassword('admin123');
      db.prepare(`
        INSERT INTO users (username, password, email, full_name, role, status)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run('admin', hashedPassword, 'admin@bigoffice.com', 'System Administrator', 'admin', 'active');
      console.log('✅ Admin user created');
    }
    
    // Create other default users
    const manager = db.prepare('SELECT id FROM users WHERE username = ?').get('manager');
    if (!manager) {
      const hashedPassword = await hashPassword('manager123');
      db.prepare(`
        INSERT INTO users (username, password, email, full_name, role, status)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run('manager', hashedPassword, 'manager@bigoffice.com', 'Office Manager', 'manager', 'active');
      console.log('✅ Manager user created');
    }
    
    const accounts = db.prepare('SELECT id FROM users WHERE username = ?').get('accounts');
    if (!accounts) {
      const hashedPassword = await hashPassword('accounts123');
      db.prepare(`
        INSERT INTO users (username, password, email, full_name, role, status)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run('accounts', hashedPassword, 'accounts@bigoffice.com', 'Accounts User', 'user', 'active');
      console.log('✅ Accounts user created');
    }
    
    console.log('\n📋 Default Users:');
    console.log('Username: admin    | Password: admin123    | Role: admin');
    console.log('Username: manager  | Password: manager123  | Role: manager');
    console.log('Username: accounts | Password: accounts123 | Role: user');
    
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  } finally {
    db.close();
  }
}

createUsers();
