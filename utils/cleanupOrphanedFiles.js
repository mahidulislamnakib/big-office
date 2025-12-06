// utils/cleanupOrphanedFiles.js - Cleanup orphaned temp files
const fs = require('fs').promises;
const path = require('path');
const logger = require('./logger');

const UPLOAD_BASE_DIR = path.join(__dirname, '..', 'uploads');
const MAX_FILE_AGE = parseInt(process.env.UPLOAD_TEMP_MAX_AGE || '3600000', 10); // 1 hour default

/**
 * Get file age in milliseconds
 * @param {string} filePath - Path to file
 * @returns {Promise<number>} - Age in milliseconds
 */
async function getFileAge(filePath) {
  try {
    const stats = await fs.stat(filePath);
    return Date.now() - stats.mtimeMs;
  } catch (error) {
    logger.error('Failed to get file age', { filePath, error: error.message });
    return 0;
  }
}

/**
 * Check if file is orphaned (in temp directory and old)
 * @param {string} filePath - Path to file
 * @param {string} parentDir - Parent directory name
 * @returns {Promise<boolean>} - True if file should be cleaned up
 */
async function isOrphanedFile(filePath, parentDir) {
  // Only cleanup files in 'temp' subdirectories
  if (!parentDir.includes('temp')) {
    return false;
  }
  
  const age = await getFileAge(filePath);
  return age > MAX_FILE_AGE;
}

/**
 * Recursively scan directory for orphaned files
 * @param {string} dirPath - Directory to scan
 * @param {Array} orphanedFiles - Accumulator for orphaned files
 * @returns {Promise<Array>} - List of orphaned file paths
 */
async function scanDirectory(dirPath, orphanedFiles = []) {
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      
      if (entry.isDirectory()) {
        // Recursively scan subdirectories
        await scanDirectory(fullPath, orphanedFiles);
      } else if (entry.isFile()) {
        // Check if file is orphaned
        const parentDir = path.basename(path.dirname(fullPath));
        if (await isOrphanedFile(fullPath, parentDir)) {
          orphanedFiles.push(fullPath);
        }
      }
    }
    
    return orphanedFiles;
  } catch (error) {
    if (error.code !== 'ENOENT') {
      logger.error('Failed to scan directory', { dirPath, error: error.message });
    }
    return orphanedFiles;
  }
}

/**
 * Delete orphaned file with error handling
 * @param {string} filePath - Path to file to delete
 * @returns {Promise<Object>} - { success: boolean, error: string }
 */
async function deleteOrphanedFile(filePath) {
  try {
    await fs.unlink(filePath);
    logger.info('Deleted orphaned file', { filePath });
    return { success: true };
  } catch (error) {
    logger.error('Failed to delete orphaned file', { 
      filePath, 
      error: error.message,
      code: error.code 
    });
    return { success: false, error: error.message };
  }
}

/**
 * Cleanup empty temp directories
 * @param {string} dirPath - Directory to check
 * @returns {Promise<void>}
 */
async function cleanupEmptyTempDirs(dirPath) {
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const fullPath = path.join(dirPath, entry.name);
        
        // Recursively cleanup subdirectories first
        await cleanupEmptyTempDirs(fullPath);
        
        // If directory name contains 'temp', try to remove if empty
        if (entry.name.includes('temp')) {
          try {
            const contents = await fs.readdir(fullPath);
            if (contents.length === 0) {
              await fs.rmdir(fullPath);
              logger.info('Removed empty temp directory', { dirPath: fullPath });
            }
          } catch (error) {
            // Directory not empty or other error - ignore
          }
        }
      }
    }
  } catch (error) {
    if (error.code !== 'ENOENT') {
      logger.error('Failed to cleanup empty directories', { 
        dirPath, 
        error: error.message 
      });
    }
  }
}

/**
 * Main cleanup function - scan and delete orphaned files
 * @returns {Promise<Object>} - Cleanup statistics
 */
async function cleanupOrphanedFiles() {
  const startTime = Date.now();
  logger.info('Starting orphaned file cleanup', { 
    uploadDir: UPLOAD_BASE_DIR,
    maxAge: `${MAX_FILE_AGE}ms` 
  });
  
  try {
    // Ensure upload directory exists
    try {
      await fs.access(UPLOAD_BASE_DIR);
    } catch (error) {
      logger.warn('Upload directory does not exist', { uploadDir: UPLOAD_BASE_DIR });
      return { 
        scanned: 0, 
        deleted: 0, 
        failed: 0, 
        duration: Date.now() - startTime 
      };
    }
    
    // Scan for orphaned files
    const orphanedFiles = await scanDirectory(UPLOAD_BASE_DIR);
    logger.info(`Found ${orphanedFiles.length} orphaned files`);
    
    // Delete orphaned files
    let deleted = 0;
    let failed = 0;
    
    for (const filePath of orphanedFiles) {
      const result = await deleteOrphanedFile(filePath);
      if (result.success) {
        deleted++;
      } else {
        failed++;
      }
    }
    
    // Cleanup empty temp directories
    await cleanupEmptyTempDirs(UPLOAD_BASE_DIR);
    
    const duration = Date.now() - startTime;
    const stats = {
      scanned: orphanedFiles.length,
      deleted,
      failed,
      duration
    };
    
    logger.info('Orphaned file cleanup completed', stats);
    return stats;
    
  } catch (error) {
    logger.error('Orphaned file cleanup failed', { 
      error: error.message,
      stack: error.stack 
    });
    throw error;
  }
}

/**
 * Start periodic cleanup job
 * @param {number} interval - Interval in milliseconds
 * @returns {NodeJS.Timer} - Interval timer
 */
function startCleanupJob(interval = null) {
  const cleanupInterval = interval || parseInt(process.env.UPLOAD_CLEANUP_INTERVAL || '3600000', 10);
  
  logger.info('Starting periodic file cleanup job', { 
    interval: `${cleanupInterval}ms (${cleanupInterval / 1000 / 60} minutes)` 
  });
  
  // Run immediately on start
  cleanupOrphanedFiles().catch(error => {
    logger.error('Initial cleanup failed', { error: error.message });
  });
  
  // Schedule periodic cleanup
  const timer = setInterval(async () => {
    try {
      await cleanupOrphanedFiles();
    } catch (error) {
      logger.error('Scheduled cleanup failed', { error: error.message });
    }
  }, cleanupInterval);
  
  // Ensure cleanup runs before process exit
  process.on('SIGTERM', async () => {
    logger.info('SIGTERM received, running final cleanup');
    clearInterval(timer);
    try {
      await cleanupOrphanedFiles();
    } catch (error) {
      logger.error('Final cleanup failed', { error: error.message });
    }
  });
  
  return timer;
}

module.exports = {
  cleanupOrphanedFiles,
  startCleanupJob,
  getFileAge,
  isOrphanedFile
};
