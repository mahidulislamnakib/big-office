// create-new-users.js - Remove old users and create new ones
require('dotenv').config();
const Database = require('better-sqlite3');
const path = require('path');
const { hashPassword } = require('./utils/password');

const DB_FILE = process.env.DB_PATH || path.join(__dirname, 'data', 'tenders.db');
const db = new Database(DB_FILE, { readonly: false });

const run = (sql, params = []) => db.prepare(sql).run(params);

async function createNewUsers() {
  console.log('🔄 Removing old users and creating new ones...\n');
  
  try {
    // Disable foreign key checks temporarily
    db.pragma('foreign_keys = OFF');
    
    // Delete all users
    run('DELETE FROM users');
    console.log('✅ All old users deleted\n');
    
    // Re-enable foreign keys
    db.pragma('foreign_keys = ON');
    
    // Define new users
    const users = [
      {
        username: 'admin',
        password: 'admin123',
        full_name: 'System Administrator',
        email: 'admin@bigoffice.com',
        role: 'admin',
        status: 'active',
        firm_access: 'all'
      },
      {
        username: 'manager',
        password: 'manager123',
        full_name: 'Rafiq Ahmed',
        email: 'rafiq@bigoffice.com',
        role: 'manager',
        status: 'active',
        firm_access: '1'
      },
      {
        username: 'accounts',
        password: 'accounts123',
        full_name: 'Sultana Begum',
        email: 'sultana@bigoffice.com',
        role: 'user',
        status: 'active',
        firm_access: 'all'
      }
    ];
    
    console.log('🔐 Creating new users with hashed passwords...\n');
    
    for (const user of users) {
      // Hash the password
      const hashedPassword = await hashPassword(user.password);
      
      // Insert user
      run(`INSERT INTO users (username, password, full_name, email, role, status, firm_access, login_attempts) 
           VALUES (?, ?, ?, ?, ?, ?, ?, 0)`,
          [user.username, hashedPassword, user.full_name, user.email, user.role, user.status, user.firm_access]);
      
      console.log(`✅ ${user.username} created (password: ${user.password})`);
    }
    
    console.log('\n✅ All users created successfully!\n');
    console.log('========================================');
    console.log('LOGIN CREDENTIALS:');
    console.log('========================================');
    console.log('Admin:    username: admin    password: admin123');
    console.log('Manager:  username: manager  password: manager123');
    console.log('User:     username: accounts password: accounts123');
    console.log('========================================\n');
    console.log('Access at: http://localhost:3000\n');
    
  } catch (err) {
    console.error('❌ Error:', err);
    process.exit(1);
  } finally {
    db.close();
  }
}

// Run the script
createNewUsers();
