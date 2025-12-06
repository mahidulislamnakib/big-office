// middleware/uploadSafe.js - Robust file upload handling with error recovery
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const logger = require('../utils/logger');

// Configuration from environment variables
const MAX_FILE_SIZE = parseInt(process.env.MAX_FILE_SIZE || '10485760', 10); // 10MB default
const MAX_LETTERHEAD_SIZE = parseInt(process.env.MAX_LETTERHEAD_SIZE || '5242880', 10); // 5MB default
const MAX_PHOTO_SIZE = parseInt(process.env.MAX_PHOTO_SIZE || '2097152', 10); // 2MB default

// Allowed MIME types configuration
const MIME_TYPES = {
  documents: {
    'application/pdf': ['.pdf'],
    'image/jpeg': ['.jpg', '.jpeg'],
    'image/png': ['.png'],
    'application/msword': ['.doc'],
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
    'application/vnd.ms-excel': ['.xls'],
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx']
  },
  images: {
    'image/jpeg': ['.jpg', '.jpeg'],
    'image/png': ['.png']
  }
};

/**
 * Create upload directory with proper error handling
 * @param {string} dirPath - Directory path to create
 * @returns {Object} - { success: boolean, error: string }
 */
const ensureUploadDir = (dirPath) => {
  try {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true, mode: 0o755 });
      logger.info(`Created upload directory: ${dirPath}`);
    }
    
    // Verify write permissions
    const testFile = path.join(dirPath, '.write-test');
    fs.writeFileSync(testFile, 'test');
    fs.unlinkSync(testFile);
    
    return { success: true };
  } catch (error) {
    logger.error('Failed to create/verify upload directory', {
      dirPath,
      error: error.message,
      code: error.code
    });
    
    if (error.code === 'ENOSPC') {
      return { success: false, error: 'Disk space full. Please contact administrator.' };
    } else if (error.code === 'EACCES') {
      return { success: false, error: 'Permission denied. Upload directory not accessible.' };
    }
    return { success: false, error: 'Failed to create upload directory.' };
  }
};

/**
 * Generate secure filename with sanitization
 * @param {string} originalName - Original filename
 * @returns {string} - Sanitized unique filename
 */
const generateSecureFilename = (originalName) => {
  const ext = path.extname(originalName).toLowerCase();
  const timestamp = Date.now();
  const randomBytes = crypto.randomBytes(8).toString('hex');
  const sanitizedBase = path.basename(originalName, ext)
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .substring(0, 50); // Limit length
  
  return `${timestamp}-${randomBytes}-${sanitizedBase}${ext}`;
};

/**
 * Validate file type against allowed MIME types
 * @param {Object} file - Multer file object
 * @param {string} category - 'documents' or 'images'
 * @returns {Object} - { valid: boolean, error: string }
 */
const validateFileType = (file, category = 'documents') => {
  const allowedMimes = MIME_TYPES[category];
  
  if (!allowedMimes) {
    return { valid: false, error: 'Invalid file category' };
  }
  
  const fileMime = file.mimetype.toLowerCase();
  const fileExt = path.extname(file.originalname).toLowerCase();
  
  // Check if MIME type is allowed
  if (!allowedMimes[fileMime]) {
    return { 
      valid: false, 
      error: `Invalid file type. Allowed types: ${Object.keys(allowedMimes).join(', ')}` 
    };
  }
  
  // Check if extension matches MIME type
  const allowedExtensions = allowedMimes[fileMime];
  if (!allowedExtensions.includes(fileExt)) {
    return { 
      valid: false, 
      error: `File extension (${fileExt}) does not match MIME type (${fileMime})` 
    };
  }
  
  return { valid: true };
};

/**
 * Cleanup uploaded file on error
 * @param {string} filePath - Path to file to cleanup
 */
const cleanupFile = async (filePath) => {
  if (!filePath) return;
  
  try {
    if (fs.existsSync(filePath)) {
      await fs.promises.unlink(filePath);
      logger.info(`Cleaned up file: ${filePath}`);
    }
  } catch (error) {
    logger.error(`Failed to cleanup file: ${filePath}`, {
      error: error.message
    });
  }
};

/**
 * Create multer storage configuration with error handling
 * @param {string} baseDir - Base directory for uploads
 * @param {Function} subDirFn - Function to generate subdirectory from req
 * @returns {Object} - Multer storage configuration
 */
const createSafeStorage = (baseDir, subDirFn = null) => {
  return multer.diskStorage({
    destination: function (req, file, cb) {
      try {
        const subDir = subDirFn ? subDirFn(req) : '';
        const fullPath = path.join(__dirname, '..', 'uploads', baseDir, subDir);
        
        const dirResult = ensureUploadDir(fullPath);
        if (!dirResult.success) {
          return cb(new Error(dirResult.error));
        }
        
        cb(null, fullPath);
      } catch (error) {
        logger.error('Upload destination error', { error: error.message });
        cb(new Error('Failed to prepare upload destination'));
      }
    },
    filename: function (req, file, cb) {
      try {
        const secureFilename = generateSecureFilename(file.originalname);
        cb(null, secureFilename);
      } catch (error) {
        logger.error('Filename generation error', { error: error.message });
        cb(new Error('Failed to generate secure filename'));
      }
    }
  });
};

/**
 * Create file filter with validation
 * @param {string} category - 'documents' or 'images'
 * @returns {Function} - Multer file filter function
 */
const createFileFilter = (category) => {
  return function (req, file, cb) {
    const validation = validateFileType(file, category);
    
    if (!validation.valid) {
      logger.warn('File validation failed', {
        filename: file.originalname,
        mimetype: file.mimetype,
        error: validation.error,
        requestId: req.id
      });
      return cb(new Error(validation.error), false);
    }
    
    cb(null, true);
  };
};

/**
 * Multer error handler middleware
 * Converts multer errors to user-friendly messages
 */
const handleMulterError = (error, req, res, next) => {
  // Cleanup any uploaded file if error occurred
  if (req.file) {
    cleanupFile(req.file.path);
  }
  if (req.files) {
    const files = Array.isArray(req.files) ? req.files : Object.values(req.files).flat();
    files.forEach(file => cleanupFile(file.path));
  }
  
  if (error instanceof multer.MulterError) {
    logger.warn('Multer error', {
      code: error.code,
      field: error.field,
      requestId: req.id
    });
    
    switch (error.code) {
      case 'LIMIT_FILE_SIZE':
        return res.status(413).json({
          error: 'File too large',
          message: `Maximum file size is ${(MAX_FILE_SIZE / 1024 / 1024).toFixed(1)}MB`,
          code: 'FILE_TOO_LARGE'
        });
      case 'LIMIT_FILE_COUNT':
        return res.status(400).json({
          error: 'Too many files',
          message: 'Only one file can be uploaded at a time',
          code: 'TOO_MANY_FILES'
        });
      case 'LIMIT_UNEXPECTED_FILE':
        return res.status(400).json({
          error: 'Unexpected file field',
          message: 'Invalid file field name',
          code: 'INVALID_FIELD'
        });
      default:
        return res.status(400).json({
          error: 'Upload failed',
          message: error.message,
          code: 'UPLOAD_ERROR'
        });
    }
  }
  
  if (error) {
    logger.error('Upload error', {
      error: error.message,
      stack: error.stack,
      requestId: req.id
    });
    
    // Check for disk space errors
    if (error.code === 'ENOSPC') {
      return res.status(507).json({
        error: 'Insufficient storage',
        message: 'Server storage is full. Please contact administrator.',
        code: 'DISK_FULL'
      });
    }
    
    // Check for permission errors
    if (error.code === 'EACCES') {
      return res.status(500).json({
        error: 'Permission denied',
        message: 'Server cannot write files. Please contact administrator.',
        code: 'PERMISSION_DENIED'
      });
    }
    
    return res.status(400).json({
      error: 'Upload failed',
      message: error.message,
      code: 'UPLOAD_ERROR'
    });
  }
  
  next();
};

// ============================================
// Pre-configured upload middleware instances
// ============================================

/**
 * Firm documents upload (PDF, images, Office docs)
 */
const uploadFirmDocument = multer({
  storage: createSafeStorage('firm_documents', (req) => `firm_${req.params.firmId || 'temp'}`),
  limits: {
    fileSize: MAX_FILE_SIZE,
    files: 1
  },
  fileFilter: createFileFilter('documents')
});

/**
 * Letterhead assets upload (images only)
 */
const uploadLetterhead = multer({
  storage: createSafeStorage('letterheads', (req) => `firm_${req.params.firmId || 'temp'}`),
  limits: {
    fileSize: MAX_LETTERHEAD_SIZE,
    files: 1
  },
  fileFilter: createFileFilter('images')
});

/**
 * Officer photo upload (images only)
 */
const uploadOfficerPhoto = multer({
  storage: createSafeStorage('officers'),
  limits: {
    fileSize: MAX_PHOTO_SIZE,
    files: 1
  },
  fileFilter: createFileFilter('images')
});

/**
 * Officer documents upload (PDF, images, Office docs)
 */
const uploadOfficerDoc = multer({
  storage: createSafeStorage('officer_documents', (req) => req.params.id || 'temp'),
  limits: {
    fileSize: MAX_FILE_SIZE,
    files: 1
  },
  fileFilter: createFileFilter('documents')
});

/**
 * Generic document upload
 */
const uploadGenericDoc = multer({
  storage: createSafeStorage('documents'),
  limits: {
    fileSize: MAX_FILE_SIZE,
    files: 1
  },
  fileFilter: createFileFilter('documents')
});

module.exports = {
  // Middleware instances
  uploadFirmDocument,
  uploadLetterhead,
  uploadOfficerPhoto,
  uploadOfficerDoc,
  uploadGenericDoc,
  
  // Error handler
  handleMulterError,
  
  // Utilities
  cleanupFile,
  ensureUploadDir,
  generateSecureFilename,
  validateFileType,
  
  // Constants
  MAX_FILE_SIZE,
  MAX_LETTERHEAD_SIZE,
  MAX_PHOTO_SIZE,
  MIME_TYPES
};
