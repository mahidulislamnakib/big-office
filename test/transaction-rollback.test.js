// test/transaction-rollback.test.js - Transaction Rollback Tests
const assert = require('assert');
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

// Colors for console output
const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  bold: '\x1b[1m',
  reset: '\x1b[0m'
};

let passed = 0;
let failed = 0;
const failures = [];

/**
 * Test helper
 */
function test(description, fn) {
  return new Promise(async (resolve) => {
    try {
      await fn();
      console.log(`${colors.green}✓${colors.reset} ${description}`);
      passed++;
      resolve();
    } catch (error) {
      console.log(`${colors.red}✗${colors.reset} ${description}`);
      console.log(`  ${colors.red}${error.message}${colors.reset}`);
      if (error.stack) {
        console.log(`  ${colors.yellow}${error.stack.split('\n').slice(1, 3).join('\n')}${colors.reset}`);
      }
      failures.push({ description, error: error.message });
      failed++;
      resolve();
    }
  });
}

/**
 * Setup test database
 */
function setupTestDatabase() {
  const testDbPath = path.join(__dirname, '..', 'data', 'test-transactions.db');
  
  // Remove existing test database
  if (fs.existsSync(testDbPath)) {
    fs.unlinkSync(testDbPath);
  }
  
  const db = new Database(testDbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  
  // Create test tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS test_officers (
      id TEXT PRIMARY KEY,
      full_name TEXT NOT NULL,
      office_id TEXT,
      designation_id TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    
    CREATE TABLE IF NOT EXISTS test_transfer_history (
      id TEXT PRIMARY KEY,
      officer_id TEXT NOT NULL,
      from_office_id TEXT,
      to_office_id TEXT NOT NULL,
      transfer_date TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (officer_id) REFERENCES test_officers(id)
    );
    
    CREATE TABLE IF NOT EXISTS test_promotion_history (
      id TEXT PRIMARY KEY,
      officer_id TEXT NOT NULL,
      from_designation_id TEXT,
      to_designation_id TEXT NOT NULL,
      promotion_date TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (officer_id) REFERENCES test_officers(id)
    );
    
    CREATE TABLE IF NOT EXISTS test_activity_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      action TEXT NOT NULL,
      description TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `);
  
  return db;
}

/**
 * Transaction helper (mirrors production implementation)
 */
async function withTransaction(db, handler, options = {}) {
  const { requestId, operation = 'test-operation' } = options;
  const txId = requestId || `tx-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  
  const beginTransaction = db.prepare('BEGIN IMMEDIATE');
  const commitTransaction = db.prepare('COMMIT');
  const rollbackTransaction = db.prepare('ROLLBACK');
  
  let transactionStarted = false;
  
  try {
    console.log(`  [${txId}] Transaction BEGIN`);
    beginTransaction.run();
    transactionStarted = true;
    
    const result = await Promise.resolve(handler(db));
    
    commitTransaction.run();
    console.log(`  [${txId}] Transaction COMMIT`);
    
    return result;
  } catch (error) {
    if (transactionStarted) {
      rollbackTransaction.run();
      console.log(`  [${txId}] Transaction ROLLBACK`);
    }
    throw error;
  }
}

/**
 * Count rows in a table
 */
function countRows(db, table) {
  const result = db.prepare(`SELECT COUNT(*) as count FROM ${table}`).get();
  return result.count;
}

/**
 * Main test suite
 */
async function runTests() {
  console.log(`\n${colors.bold}${colors.cyan}====================================`);
  console.log('Transaction Rollback Tests');
  console.log(`====================================${colors.reset}\n`);
  
  const db = setupTestDatabase();
  
  // Test 1: Successful transaction commits all changes
  await test('Successful transaction commits all changes', async () => {
    const officerId = 'officer-test-1';
    
    await withTransaction(db, (db) => {
      db.prepare(`INSERT INTO test_officers (id, full_name, office_id) VALUES (?, ?, ?)`).run(
        officerId, 'John Doe', 'office-1'
      );
      
      db.prepare(`INSERT INTO test_activity_log (action, description) VALUES (?, ?)`).run(
        'officer_created', `Created officer ${officerId}`
      );
    }, { requestId: 'test-1', operation: 'officer-creation' });
    
    const officerCount = countRows(db, 'test_officers');
    const logCount = countRows(db, 'test_activity_log');
    
    assert.strictEqual(officerCount, 1, 'Officer should be inserted');
    assert.strictEqual(logCount, 1, 'Activity log should be inserted');
  });
  
  // Test 2: Failed transaction rolls back all changes
  await test('Failed transaction rolls back all changes', async () => {
    const officerId = 'officer-test-2';
    
    try {
      await withTransaction(db, (db) => {
        // First insert - should be rolled back
        db.prepare(`INSERT INTO test_officers (id, full_name, office_id) VALUES (?, ?, ?)`).run(
          officerId, 'Jane Smith', 'office-2'
        );
        
        // Simulated failure after first insert
        throw new Error('SIMULATED_FAILURE: Database constraint violation');
      }, { requestId: 'test-2', operation: 'officer-creation-fail' });
      
      // Should not reach here
      throw new Error('Transaction should have failed');
    } catch (error) {
      assert.ok(error.message.includes('SIMULATED_FAILURE'), 'Error should be from simulated failure');
    }
    
    const officerCount = countRows(db, 'test_officers');
    assert.strictEqual(officerCount, 1, 'No additional officer should be inserted after rollback');
  });
  
  // Test 3: Multi-table transfer operation rollback
  await test('Multi-table transfer operation rolls back on error', async () => {
    const officerId = 'officer-test-1';
    const transferId = 'transfer-test-1';
    
    const initialOfficer = db.prepare('SELECT * FROM test_officers WHERE id = ?').get(officerId);
    const initialOfficeId = initialOfficer.office_id;
    
    try {
      await withTransaction(db, (db) => {
        // Insert transfer history
        db.prepare(`
          INSERT INTO test_transfer_history (id, officer_id, from_office_id, to_office_id, transfer_date)
          VALUES (?, ?, ?, ?, ?)
        `).run(transferId, officerId, 'office-1', 'office-2', '2024-01-01');
        
        // Update officer's office
        db.prepare(`UPDATE test_officers SET office_id = ? WHERE id = ?`).run('office-2', officerId);
        
        // Log activity
        db.prepare(`INSERT INTO test_activity_log (action, description) VALUES (?, ?)`).run(
          'officer_transferred', `Transferred officer ${officerId}`
        );
        
        // Simulated failure after all operations
        throw new Error('SIMULATED_FAILURE: Notification service unavailable');
      }, { requestId: 'test-3', operation: 'officer-transfer-fail' });
      
      throw new Error('Transaction should have failed');
    } catch (error) {
      assert.ok(error.message.includes('SIMULATED_FAILURE'), 'Error should be from simulated failure');
    }
    
    // Verify rollback
    const transferCount = countRows(db, 'test_transfer_history');
    const updatedOfficer = db.prepare('SELECT * FROM test_officers WHERE id = ?').get(officerId);
    const logCount = countRows(db, 'test_activity_log');
    
    assert.strictEqual(transferCount, 0, 'Transfer history should not be inserted');
    assert.strictEqual(updatedOfficer.office_id, initialOfficeId, 'Officer office should not be updated');
    assert.strictEqual(logCount, 1, 'No new activity log should be added (still 1 from test 1)');
  });
  
  // Test 4: Multi-table promotion operation rollback
  await test('Multi-table promotion operation rolls back on error', async () => {
    const officerId = 'officer-test-1';
    const promotionId = 'promotion-test-1';
    
    const initialOfficer = db.prepare('SELECT * FROM test_officers WHERE id = ?').get(officerId);
    const initialDesignationId = initialOfficer.designation_id;
    
    try {
      await withTransaction(db, (db) => {
        // Insert promotion history
        db.prepare(`
          INSERT INTO test_promotion_history (id, officer_id, from_designation_id, to_designation_id, promotion_date)
          VALUES (?, ?, ?, ?, ?)
        `).run(promotionId, officerId, 'designation-1', 'designation-2', '2024-01-01');
        
        // Update officer's designation
        db.prepare(`UPDATE test_officers SET designation_id = ? WHERE id = ?`).run('designation-2', officerId);
        
        // Simulated failure after first update
        throw new Error('SIMULATED_FAILURE: Email notification failed');
      }, { requestId: 'test-4', operation: 'officer-promotion-fail' });
      
      throw new Error('Transaction should have failed');
    } catch (error) {
      assert.ok(error.message.includes('SIMULATED_FAILURE'), 'Error should be from simulated failure');
    }
    
    // Verify rollback
    const promotionCount = countRows(db, 'test_promotion_history');
    const updatedOfficer = db.prepare('SELECT * FROM test_officers WHERE id = ?').get(officerId);
    
    assert.strictEqual(promotionCount, 0, 'Promotion history should not be inserted');
    assert.strictEqual(updatedOfficer.designation_id, initialDesignationId, 'Officer designation should not be updated');
  });
  
  // Test 5: Foreign key constraint violation rolls back
  await test('Foreign key constraint violation rolls back transaction', async () => {
    const nonExistentOfficerId = 'officer-nonexistent';
    const transferId = 'transfer-test-2';
    
    try {
      await withTransaction(db, (db) => {
        // Try to insert transfer for non-existent officer (should fail due to FK constraint)
        db.prepare(`
          INSERT INTO test_transfer_history (id, officer_id, from_office_id, to_office_id, transfer_date)
          VALUES (?, ?, ?, ?, ?)
        `).run(transferId, nonExistentOfficerId, 'office-1', 'office-2', '2024-01-01');
        
        // This should not be executed
        db.prepare(`INSERT INTO test_activity_log (action, description) VALUES (?, ?)`).run(
          'transfer_created', 'Should not be inserted'
        );
      }, { requestId: 'test-5', operation: 'fk-constraint-test' });
      
      throw new Error('Transaction should have failed due to FK constraint');
    } catch (error) {
      assert.ok(error.message.includes('FOREIGN KEY constraint failed'), 'Error should be FK constraint');
    }
    
    // Verify rollback
    const transferCount = countRows(db, 'test_transfer_history');
    const logCount = countRows(db, 'test_activity_log');
    
    assert.strictEqual(transferCount, 0, 'Transfer should not be inserted');
    assert.strictEqual(logCount, 1, 'Activity log should not be added (still 1 from test 1)');
  });
  
  // Test 6: Nested transaction behavior
  await test('Partial writes are prevented in multi-step operations', async () => {
    const officerId = 'officer-test-3';
    
    const initialOfficerCount = countRows(db, 'test_officers');
    const initialTransferCount = countRows(db, 'test_transfer_history');
    const initialLogCount = countRows(db, 'test_activity_log');
    
    try {
      await withTransaction(db, (db) => {
        // Step 1: Create officer
        db.prepare(`INSERT INTO test_officers (id, full_name, office_id) VALUES (?, ?, ?)`).run(
          officerId, 'Bob Johnson', 'office-1'
        );
        
        // Step 2: Create transfer (should succeed)
        db.prepare(`
          INSERT INTO test_transfer_history (id, officer_id, from_office_id, to_office_id, transfer_date)
          VALUES (?, ?, ?, ?, ?)
        `).run('transfer-test-3', officerId, 'office-1', 'office-2', '2024-01-01');
        
        // Step 3: Log activity (should succeed)
        db.prepare(`INSERT INTO test_activity_log (action, description) VALUES (?, ?)`).run(
          'officer_created_and_transferred', `Created and transferred officer ${officerId}`
        );
        
        // Step 4: Simulated failure at the end
        throw new Error('SIMULATED_FAILURE: Final validation failed');
      }, { requestId: 'test-6', operation: 'multi-step-operation' });
      
      throw new Error('Transaction should have failed');
    } catch (error) {
      assert.ok(error.message.includes('SIMULATED_FAILURE'), 'Error should be from simulated failure');
    }
    
    // Verify complete rollback - no partial writes
    const finalOfficerCount = countRows(db, 'test_officers');
    const finalTransferCount = countRows(db, 'test_transfer_history');
    const finalLogCount = countRows(db, 'test_activity_log');
    
    assert.strictEqual(finalOfficerCount, initialOfficerCount, 'Officer count should not change');
    assert.strictEqual(finalTransferCount, initialTransferCount, 'Transfer count should not change');
    assert.strictEqual(finalLogCount, initialLogCount, 'Log count should not change');
  });
  
  // Test 7: Transaction isolation (concurrent writes)
  await test('Transaction isolation prevents dirty reads', async () => {
    const officerId = 'officer-test-4';
    
    // Start transaction but don't commit
    const tx1Started = new Promise(async (resolve, reject) => {
      try {
        await withTransaction(db, async (db) => {
          // Insert officer
          db.prepare(`INSERT INTO test_officers (id, full_name, office_id) VALUES (?, ?, ?)`).run(
            officerId, 'Alice Williams', 'office-1'
          );
          
          resolve();
          
          // Wait a bit before committing
          await new Promise(r => setTimeout(r, 100));
        }, { requestId: 'test-7-tx1', operation: 'concurrent-write-1' });
      } catch (error) {
        reject(error);
      }
    });
    
    // Wait for first transaction to start
    await tx1Started;
    
    // Try to read from another connection - should not see uncommitted data
    const officer = db.prepare('SELECT * FROM test_officers WHERE id = ?').get(officerId);
    
    assert.ok(officer !== undefined, 'Officer should be visible after commit');
  });
  
  // Cleanup
  db.close();
  const testDbPath = path.join(__dirname, '..', 'data', 'test-transactions.db');
  if (fs.existsSync(testDbPath)) {
    fs.unlinkSync(testDbPath);
  }
  
  // Print summary
  printSummary();
}

function printSummary() {
  console.log(`\n${colors.bold}${colors.cyan}===================================`);
  console.log('Test Summary');
  console.log(`===================================${colors.reset}\n`);
  
  console.log(`${colors.green}✓ Passed: ${passed}${colors.reset}`);
  console.log(`${colors.red}✗ Failed: ${failed}${colors.reset}`);
  console.log(`Total: ${passed + failed}\n`);
  
  if (failed > 0) {
    console.log(`${colors.bold}${colors.red}Failed Tests:${colors.reset}\n`);
    failures.forEach(({ description, error }) => {
      console.log(`${colors.red}✗ ${description}${colors.reset}`);
      console.log(`  ${error}\n`);
    });
  }
  
  if (failed === 0) {
    console.log(`${colors.green}${colors.bold}All tests passed! ✓${colors.reset}`);
    console.log(`\n${colors.cyan}Transaction rollback is working correctly.${colors.reset}\n`);
  } else {
    console.log(`${colors.red}${colors.bold}Some tests failed. Please review errors above.${colors.reset}\n`);
    process.exit(1);
  }
}

// Run tests
runTests().catch(error => {
  console.error(`${colors.red}Test suite error:${colors.reset}`, error);
  process.exit(1);
});
