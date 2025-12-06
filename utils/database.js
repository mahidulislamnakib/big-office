// utils/database.js - Centralized Database Connection & Transaction Support
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const logger = require('./logger');

const DB_FILE = path.join(__dirname, '..', 'data', 'tenders.db');

if (!fs.existsSync(DB_FILE)) {
  console.error('Database not found at:', DB_FILE);
  process.exit(1);
}

// Singleton database connection
let dbInstance = null;

/**
 * Get database instance (singleton)
 */
function getDatabase() {
  if (!dbInstance) {
    dbInstance = new Database(DB_FILE, {
      readonly: false,
      fileMustExist: true,
      timeout: 5000,
      verbose: process.env.NODE_ENV === 'development' ? console.log : null
    });
    
    // Enable WAL mode for better concurrency
    dbInstance.pragma('journal_mode = WAL');
    dbInstance.pragma('foreign_keys = ON');
    
    console.log('✅ Database connection established');
  }
  
  return dbInstance;
}

const db = getDatabase();

// Helper functions with prepared statements
const row = (sql, params = []) => db.prepare(sql).get(params);
const rows = (sql, params = []) => db.prepare(sql).all(params);
const run = (sql, params = []) => db.prepare(sql).run(params);

/**
 * Execute multiple operations in a transaction with enhanced logging
 * @param {Function} callback - Function containing database operations
 * @param {string} requestId - Optional request ID for logging
 * @returns {*} Result from callback
 */
function transaction(callback, requestId = null) {
  const txId = requestId || `tx-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const beginTransaction = db.prepare('BEGIN IMMEDIATE');
  const commitTransaction = db.prepare('COMMIT');
  const rollbackTransaction = db.prepare('ROLLBACK');
  
  try {
    logger.info(`[${txId}] Transaction BEGIN`, { requestId: txId });
    beginTransaction.run();
    
    const result = callback();
    
    commitTransaction.run();
    logger.info(`[${txId}] Transaction COMMIT`, { requestId: txId });
    return result;
  } catch (error) {
    rollbackTransaction.run();
    logger.error(`[${txId}] Transaction ROLLBACK`, { 
      requestId: txId, 
      error: error.message,
      stack: error.stack 
    });
    throw error;
  }
}

/**
 * Async transaction wrapper with enhanced logging
 * @param {Function} callback - Async function containing database operations
 * @param {string} requestId - Optional request ID for logging
 * @returns {Promise<*>} Result from callback
 */
async function asyncTransaction(callback, requestId = null) {
  const txId = requestId || `tx-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const beginTransaction = db.prepare('BEGIN IMMEDIATE');
  const commitTransaction = db.prepare('COMMIT');
  const rollbackTransaction = db.prepare('ROLLBACK');
  
  try {
    logger.info(`[${txId}] Async Transaction BEGIN`, { requestId: txId });
    beginTransaction.run();
    
    const result = await callback();
    
    commitTransaction.run();
    logger.info(`[${txId}] Async Transaction COMMIT`, { requestId: txId });
    return result;
  } catch (error) {
    rollbackTransaction.run();
    logger.error(`[${txId}] Async Transaction ROLLBACK`, { 
      requestId: txId, 
      error: error.message,
      stack: error.stack 
    });
    throw error;
  }
}

/**
 * Enhanced transaction wrapper with proper error handling and cleanup
 * This is the recommended method for all multi-step database operations
 * @param {Function} handler - Async/sync function containing database operations
 * @param {Object} options - Transaction options
 * @param {string} options.requestId - Request ID for logging correlation
 * @param {string} options.operation - Operation name for logging
 * @returns {Promise<*>} Result from handler
 */
async function withTransaction(handler, options = {}) {
  const { requestId, operation = 'database-operation' } = options;
  const txId = requestId || `tx-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  
  const beginTransaction = db.prepare('BEGIN IMMEDIATE');
  const commitTransaction = db.prepare('COMMIT');
  const rollbackTransaction = db.prepare('ROLLBACK');
  
  let transactionStarted = false;
  
  try {
    logger.info(`[${txId}] Transaction BEGIN`, { 
      requestId: txId, 
      operation,
      timestamp: new Date().toISOString()
    });
    
    beginTransaction.run();
    transactionStarted = true;
    
    // Execute handler (can be async or sync)
    const result = await Promise.resolve(handler(db));
    
    commitTransaction.run();
    logger.info(`[${txId}] Transaction COMMIT`, { 
      requestId: txId, 
      operation,
      timestamp: new Date().toISOString()
    });
    
    return result;
  } catch (error) {
    if (transactionStarted) {
      try {
        rollbackTransaction.run();
        logger.error(`[${txId}] Transaction ROLLBACK`, { 
          requestId: txId, 
          operation,
          error: error.message,
          errorCode: error.code,
          timestamp: new Date().toISOString()
        });
      } catch (rollbackError) {
        logger.error(`[${txId}] Transaction ROLLBACK FAILED`, { 
          requestId: txId, 
          operation,
          originalError: error.message,
          rollbackError: rollbackError.message,
          timestamp: new Date().toISOString()
        });
      }
    }
    
    // Re-throw the original error
    throw error;
  }
}

/**
 * Pagination helper
 * @param {string} baseQuery - Base SQL query without LIMIT/OFFSET
 * @param {Array} params - Query parameters
 * @param {number} page - Page number (1-based)
 * @param {number} limit - Items per page
 * @returns {Object} {data, pagination}
 */
function paginate(baseQuery, params = [], page = 1, limit = 50) {
  // Get total count
  const countQuery = `SELECT COUNT(*) as total FROM (${baseQuery})`;
  const { total } = db.prepare(countQuery).get(params);
  
  // Calculate pagination
  const offset = (page - 1) * limit;
  const totalPages = Math.ceil(total / limit);
  
  // Get paginated data
  const paginatedQuery = `${baseQuery} LIMIT ? OFFSET ?`;
  const data = db.prepare(paginatedQuery).all([...params, limit, offset]);
  
  return {
    data,
    pagination: {
      page,
      limit,
      total,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1
    }
  };
}

/**
 * Batch insert with transaction
 * @param {string} table - Table name
 * @param {Array} records - Array of records to insert
 * @param {Array} columns - Column names
 */
function batchInsert(table, records, columns) {
  if (!records || records.length === 0) return;
  
  const placeholders = columns.map(() => '?').join(', ');
  const sql = `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})`;
  const stmt = db.prepare(sql);
  
  return transaction(() => {
    const results = [];
    for (const record of records) {
      const values = columns.map(col => record[col]);
      results.push(stmt.run(values));
    }
    return results;
  });
}

/**
 * Soft delete helper
 * @param {string} table - Table name
 * @param {number} id - Record ID
 * @param {number} userId - User performing the deletion
 */
function softDelete(table, id, userId) {
  return transaction(() => {
    // Update record
    run(`UPDATE ${table} SET status = 'deleted', updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [id]);
    
    // Log in audit trail
    run(`INSERT INTO audit_log (table_name, record_id, action, user_id, timestamp) 
         VALUES (?, ?, 'delete', ?, CURRENT_TIMESTAMP)`, [table, id, userId]);
  });
}

/**
 * Backup database
 * @param {string} backupPath - Path to backup file
 */
function backup(backupPath) {
  return db.backup(backupPath);
}

/**
 * Close database connection
 */
function close() {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
    console.log('Database connection closed');
  }
}

// Graceful shutdown
process.on('SIGINT', () => {
  close();
  process.exit(0);
});

process.on('SIGTERM', () => {
  close();
  process.exit(0);
});

module.exports = {
  db,
  getDatabase,
  row,
  rows,
  run,
  transaction,
  asyncTransaction,
  withTransaction,
  paginate,
  batchInsert,
  softDelete,
  backup,
  close
};
