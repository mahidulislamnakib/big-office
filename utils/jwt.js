// utils/jwt.js - JWT token generation and validation
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET;
const JWT_EXPIRY = process.env.JWT_EXPIRY || '1h';
const JWT_REFRESH_EXPIRY = process.env.JWT_REFRESH_EXPIRY || '7d';

if (!JWT_SECRET || !JWT_REFRESH_SECRET) {
  console.error('JWT secrets not configured! Check .env file');
  process.exit(1);
}

/**
 * Generate access token
 * @param {Object} user - User object
 * @returns {string} JWT access token
 */
function generateAccessToken(user) {
  const payload = {
    userId: user.id,
    username: user.username,
    role: user.role,
    firmAccess: user.firm_access
  };
  
  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: JWT_EXPIRY,
    issuer: 'big-office',
    subject: user.id.toString()
  });
}

/**
 * Generate refresh token
 * @param {Object} user - User object
 * @returns {string} JWT refresh token
 */
function generateRefreshToken(user) {
  const payload = {
    userId: user.id,
    username: user.username,
    type: 'refresh'
  };
  
  return jwt.sign(payload, JWT_REFRESH_SECRET, {
    expiresIn: JWT_REFRESH_EXPIRY,
    issuer: 'big-office',
    subject: user.id.toString()
  });
}

/**
 * Generate both access and refresh tokens
 * @param {Object} user - User object
 * @returns {Object} {accessToken, refreshToken, expiresIn}
 */
function generateTokenPair(user) {
  return {
    accessToken: generateAccessToken(user),
    refreshToken: generateRefreshToken(user),
    expiresIn: JWT_EXPIRY,
    tokenType: 'Bearer'
  };
}

/**
 * Verify access token
 * @param {string} token - JWT token
 * @returns {Object} Decoded payload
 */
function verifyAccessToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (err) {
    throw new Error(`Invalid token: ${err.message}`);
  }
}

/**
 * Verify refresh token
 * @param {string} token - JWT refresh token
 * @returns {Object} Decoded payload
 */
function verifyRefreshToken(token) {
  try {
    return jwt.verify(token, JWT_REFRESH_SECRET);
  } catch (err) {
    throw new Error(`Invalid refresh token: ${err.message}`);
  }
}

module.exports = {
  generateAccessToken,
  generateRefreshToken,
  generateTokenPair,
  verifyAccessToken,
  verifyRefreshToken
};
