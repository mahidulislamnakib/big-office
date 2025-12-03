// init-db.js
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const dbDir = path.join(__dirname, 'data');
const dbFile = path.join(dbDir, 'tenders.db');
const schemaFile = path.join(__dirname, 'schema.sql');

if (!fs.existsSync(schemaFile)) {
  console.error('schema.sql not found in project root.');
  process.exit(1);
}

const schema = fs.readFileSync(schemaFile, 'utf8');
if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir);

const db = new Database(dbFile);
try {
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec(schema);
  console.log('DB initialized at', dbFile);
} finally {
  db.close();
}
