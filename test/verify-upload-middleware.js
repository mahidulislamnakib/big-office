// Verification script for upload middleware components
const fs = require('fs');
const path = require('path');

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

function check(description, condition) {
  if (condition) {
    console.log(`${colors.green}✓${colors.reset} ${description}`);
    passed++;
  } else {
    console.log(`${colors.red}✗${colors.reset} ${description}`);
    failed++;
  }
}

console.log(`\n${colors.bold}${colors.cyan}====================================`);
console.log('Upload Middleware Verification');
console.log(`====================================${colors.reset}\n`);

// 1. Check middleware module exists and loads
console.log(`${colors.cyan}1. Module Structure${colors.reset}\n`);
try {
  const uploadSafe = require('../middleware/uploadSafe');
  check('uploadSafe module loads successfully', true);
  check('uploadFirmDocument middleware exists', uploadSafe.uploadFirmDocument !== undefined);
  check('uploadLetterhead middleware exists', uploadSafe.uploadLetterhead !== undefined);
  check('uploadOfficerPhoto middleware exists', uploadSafe.uploadOfficerPhoto !== undefined);
  check('uploadOfficerDoc middleware exists', uploadSafe.uploadOfficerDoc !== undefined);
  check('uploadGenericDoc middleware exists', uploadSafe.uploadGenericDoc !== undefined);
  check('handleMulterError middleware exists', typeof uploadSafe.handleMulterError === 'function');
  check('MAX_FILE_SIZE constant defined', typeof uploadSafe.MAX_FILE_SIZE === 'number');
  check('MIME_TYPES configuration exists', typeof uploadSafe.MIME_TYPES === 'object');
  check('ensureUploadDir utility exists', typeof uploadSafe.ensureUploadDir === 'function');
  check('cleanupFile utility exists', typeof uploadSafe.cleanupFile === 'function');
} catch (error) {
  check('uploadSafe module loads', false);
  console.error(`${colors.red}Error:${colors.reset}`, error.message);
}

// 2. Check cleanup utility exists and loads
console.log(`\n${colors.cyan}2. Cleanup Utility${colors.reset}\n`);
try {
  const cleanup = require('../utils/cleanupOrphanedFiles');
  check('cleanupOrphanedFiles module loads successfully', true);
  check('cleanupOrphanedFiles function exists', typeof cleanup.cleanupOrphanedFiles === 'function');
  check('startCleanupJob function exists', typeof cleanup.startCleanupJob === 'function');
} catch (error) {
  check('cleanupOrphanedFiles module loads', false);
  console.error(`${colors.red}Error:${colors.reset}`, error.message);
}

// 3. Check configuration values
console.log(`\n${colors.cyan}3. Configuration${colors.reset}\n`);
try {
  const uploadSafe = require('../middleware/uploadSafe');
  check('MAX_FILE_SIZE is 10MB (10485760 bytes)', uploadSafe.MAX_FILE_SIZE === 10485760);
  check('MIME_TYPES has documents category', uploadSafe.MIME_TYPES.documents !== undefined);
  check('MIME_TYPES has images category', uploadSafe.MIME_TYPES.images !== undefined);
  check('Documents include PDF', uploadSafe.MIME_TYPES.documents['application/pdf'] !== undefined);
  check('Documents include JPEG', uploadSafe.MIME_TYPES.documents['image/jpeg'] !== undefined);
  check('Images include PNG', uploadSafe.MIME_TYPES.images['image/png'] !== undefined);
} catch (error) {
  console.error(`${colors.red}Error:${colors.reset}`, error.message);
}

// 4. Check upload directories can be created
console.log(`\n${colors.cyan}4. Directory Creation${colors.reset}\n`);
try {
  const uploadSafe = require('../middleware/uploadSafe');
  const testDir = path.join(__dirname, '../uploads/test-verification');
  
  // Test directory creation
  uploadSafe.ensureUploadDir(testDir);
  check('Test directory created successfully', fs.existsSync(testDir));
  
  // Cleanup test directory
  if (fs.existsSync(testDir)) {
    fs.rmdirSync(testDir);
    check('Test directory cleaned up', !fs.existsSync(testDir));
  }
} catch (error) {
  check('Directory creation works', false);
  console.error(`${colors.red}Error:${colors.reset}`, error.message);
}

// 5. Check file cleanup utility
console.log(`\n${colors.cyan}5. File Cleanup Function${colors.reset}\n`);
try {
  const uploadSafe = require('../middleware/uploadSafe');
  const testFile = path.join(__dirname, '../uploads/test-cleanup-file.txt');
  
  // Create test file
  fs.writeFileSync(testFile, 'test content');
  check('Test file created', fs.existsSync(testFile));
  
  // Test cleanup
  uploadSafe.cleanupFile(testFile);
  
  // Wait a moment for async cleanup
  setTimeout(() => {
    check('Test file cleaned up', !fs.existsSync(testFile));
    
    // Print summary
    printSummary();
  }, 100);
} catch (error) {
  check('File cleanup works', false);
  console.error(`${colors.red}Error:${colors.reset}`, error.message);
  printSummary();
}

function printSummary() {
  console.log(`\n${colors.bold}${colors.cyan}===================================`);
  console.log('Verification Summary');
  console.log(`===================================${colors.reset}\n`);
  
  console.log(`${colors.green}✓ Passed: ${passed}${colors.reset}`);
  console.log(`${colors.red}✗ Failed: ${failed}${colors.reset}`);
  console.log(`Total: ${passed + failed}\n`);
  
  if (failed === 0) {
    console.log(`${colors.green}${colors.bold}All checks passed! ✓${colors.reset}`);
    console.log(`\n${colors.cyan}Upload middleware is ready for use.${colors.reset}\n`);
  } else {
    console.log(`${colors.red}${colors.bold}Some checks failed. Please review errors above.${colors.reset}\n`);
    process.exit(1);
  }
}
