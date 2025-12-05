// middleware/auth.js - Authentication & Authorization Middleware
const jwt = require('jsonwebtoken');
const Database = require('better-sqlite3');
const path = require('path');

const DB_FILE = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'tenders.db');
const db = new Database(DB_FILE, { readonly: false });

const row = (sql, params = []) => db.prepare(sql).get(params);
const run = (sql, params = []) => db.prepare(sql).run(params);

/**
 * Authentication Middleware
 * Verifies JWT token and attaches user to request
 */
const authenticate = (req, res, next) => {
  try {
    // Get token from Authorization header
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ 
        error: 'Authentication required',
        code: 'NO_TOKEN' 
      });
    }
    
    const token = authHeader.substring(7); // Remove 'Bearer ' prefix
    
    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Check if user still exists and is active
    const user = row('SELECT * FROM users WHERE id = ? AND status = ?', [decoded.userId, 'active']);
    
    if (!user) {
      return res.status(401).json({ 
        error: 'User not found or inactive',
        code: 'INVALID_USER' 
      });
    }
    
    // Attach user to request (excluding password)
    const { password, ...userInfo } = user;
    req.user = userInfo;
    req.userId = user.id;
    req.userRole = user.role;
    
    next();
  } catch (err) {
    if (err.name === 'JsonWebTokenError') {
      return res.status(401).json({ 
        error: 'Invalid token',
        code: 'INVALID_TOKEN' 
      });
    }
    
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ 
        error: 'Token expired',
        code: 'TOKEN_EXPIRED' 
      });
    }
    
    console.error('Auth middleware error:', err);
    return res.status(500).json({ 
      error: 'Authentication error',
      code: 'AUTH_ERROR' 
    });
  }
};

/**
 * Role-Based Authorization Middleware
 * @param {Array} allowedRoles - Array of roles that can access the route
 */
const authorize = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ 
        error: 'Authentication required',
        code: 'NOT_AUTHENTICATED' 
      });
    }
    
    if (!allowedRoles.includes(req.user.role)) {
      // Log unauthorized attempt
      logActivity(req.user.id, 'unauthorized_access', null, null, 
        `Attempted to access ${req.method} ${req.path} without permission`, req.ip);
      
      return res.status(403).json({ 
        error: 'Insufficient permissions',
        code: 'FORBIDDEN',
        required: allowedRoles,
        current: req.user.role
      });
    }
    
    next();
  };
};

/**
 * Firm Access Control Middleware
 * Ensures user can only access their assigned firms
 */
const checkFirmAccess = (req, res, next) => {
  try {
    // Admin can access all firms
    if (req.user.role === 'admin') {
      return next();
    }
    
    // Get firm ID from params or body
    const firmId = req.params.firmId || req.body.firm_id;
    
    if (!firmId) {
      return next(); // No firm restriction if no firm ID provided
    }
    
    // Check if user has access to this firm
    const firmAccess = req.user.firm_access || '';
    
    if (firmAccess === 'all') {
      return next();
    }
    
    const allowedFirms = firmAccess.split(',').map(id => id.trim());
    
    if (!allowedFirms.includes(firmId.toString())) {
      return res.status(403).json({ 
        error: 'You do not have access to this firm',
        code: 'FIRM_ACCESS_DENIED',
        firmId 
      });
    }
    
    next();
  } catch (err) {
    console.error('Firm access check error:', err);
    return res.status(500).json({ error: 'Authorization error' });
  }
};

/**
 * Resource Ownership Middleware
 * Ensures users can only modify their own created resources (unless admin)
 */
const checkOwnership = (resourceType) => {
  return (req, res, next) => {
    try {
      // Admin bypasses ownership check
      if (req.user.role === 'admin') {
        return next();
      }
      
      const resourceId = req.params.id;
      
      if (!resourceId) {
        return next();
      }
      
      // Check ownership based on resource type
      const tableName = getTableName(resourceType);
      const resource = row(`SELECT created_by FROM ${tableName} WHERE id = ?`, [resourceId]);
      
      if (!resource) {
        return res.status(404).json({ error: 'Resource not found' });
      }
      
      if (resource.created_by && resource.created_by !== req.user.id) {
        return res.status(403).json({ 
          error: 'You can only modify your own resources',
          code: 'NOT_OWNER' 
        });
      }
      
      next();
    } catch (err) {
      console.error('Ownership check error:', err);
      // If table doesn't have created_by, allow access
      next();
    }
  };
};

/**
 * Log user activity
 */
const logActivity = (userId, action, entityType, entityId, description, ipAddress) => {
  try {
    run(`INSERT INTO activity_log (user_id, action, entity_type, entity_id, description, ip_address)
         VALUES (?, ?, ?, ?, ?, ?)`,
      [userId, action, entityType, entityId, description, ipAddress]);
  } catch (err) {
    console.error('Activity log error:', err);
  }
};

/**
 * Activity Logging Middleware
 */
const logRequest = (req, res, next) => {
  if (req.user && req.method !== 'GET') {
    const action = `${req.method}_${req.path}`;
    const description = `${req.method} ${req.path}`;
    logActivity(req.user.id, action, null, null, description, req.ip);
  }
  next();
};

/**
 * Helper: Get table name from resource type
 */
const getTableName = (resourceType) => {
  const tableMap = {
    'task': 'tasks',
    'contact': 'contacts',
    'supplier': 'suppliers',
    'client': 'clients',
    'document': 'firm_documents'
  };
  return tableMap[resourceType] || resourceType + 's';
};

module.exports = {
  authenticate,
  authorize,
  checkFirmAccess,
  checkOwnership,
  logActivity,
  logRequest
};
