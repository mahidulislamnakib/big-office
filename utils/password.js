// utils/password.js - Password hashing and validation utilities
const bcrypt = require('bcrypt');

const SALT_ROUNDS = 10;
const MIN_PASSWORD_LENGTH = parseInt(process.env.MIN_PASSWORD_LENGTH) || 8;

/**
 * Hash a password using bcrypt
 * @param {string} password - Plain text password
 * @returns {Promise<string>} Hashed password
 */
async function hashPassword(password) {
  if (!password) {
    throw new Error('Password is required');
  }
  
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
  }
  
  return await bcrypt.hash(password, SALT_ROUNDS);
}

/**
 * Compare password with hashed password
 * @param {string} password - Plain text password
 * @param {string} hashedPassword - Hashed password from database
 * @returns {Promise<boolean>} True if password matches
 */
async function comparePassword(password, hashedPassword) {
  if (!password || !hashedPassword) {
    return false;
  }
  
  return await bcrypt.compare(password, hashedPassword);
}

/**
 * Validate password strength
 * @param {string} password - Password to validate
 * @returns {Object} {valid: boolean, errors: []}
 */
function validatePasswordStrength(password) {
  const errors = [];
  
  if (!password) {
    errors.push('Password is required');
    return { valid: false, errors };
  }
  
  if (password.length < MIN_PASSWORD_LENGTH) {
    errors.push(`Password must be at least ${MIN_PASSWORD_LENGTH} characters long`);
  }
  
  if (!/[a-z]/.test(password)) {
    errors.push('Password must contain at least one lowercase letter');
  }
  
  if (!/[A-Z]/.test(password)) {
    errors.push('Password must contain at least one uppercase letter');
  }
  
  if (!/[0-9]/.test(password)) {
    errors.push('Password must contain at least one number');
  }
  
  // Check for common weak passwords
  const weakPasswords = ['password', '12345678', 'admin123', 'demo123'];
  if (weakPasswords.some(weak => password.toLowerCase().includes(weak))) {
    errors.push('Password is too common');
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}

module.exports = {
  hashPassword,
  comparePassword,
  validatePasswordStrength,
  MIN_PASSWORD_LENGTH
};
