// middleware/audit.js - Audit Trail Middleware
const { run } = require('../utils/database');

/**
 * Log user actions for audit trail
 * @param {string} action - Action performed (create, update, delete, view)
 * @param {string} entity - Entity type (firm, tender, user, etc.)
 * @param {number} entityId - Entity ID
 */
const auditLog = (action, entity) => {
  return (req, res, next) => {
    // Store original functions
    const originalJson = res.json;
    const originalSend = res.send;
    
    // Override res.json to capture response
    res.json = function(data) {
      // Log successful operations (2xx status codes)
      if (res.statusCode >= 200 && res.statusCode < 300) {
        try {
          const entityId = req.params.id || data.id || null;
          const userId = req.userId || null;
          const ipAddress = req.ip || req.connection.remoteAddress;
          const userAgent = req.get('user-agent') || '';
          
          // Extract relevant data for audit (sanitize)
          const auditData = {
            method: req.method,
            path: req.path,
            query: JSON.stringify(req.query || {}),
            changes: action === 'update' ? JSON.stringify(req.body || {}) : null
          };
          
          // Insert audit log (async, don't wait)
          setImmediate(() => {
            try {
              run(`INSERT INTO audit_log 
                   (user_id, action, entity_type, entity_id, ip_address, user_agent, details, timestamp) 
                   VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
                [userId, action, entity, entityId, ipAddress, userAgent, JSON.stringify(auditData)]
              );
            } catch (err) {
              console.error('Audit log error:', err.message);
            }
          });
        } catch (err) {
          console.error('Audit logging failed:', err.message);
        }
      }
      
      // Call original json method
      return originalJson.call(this, data);
    };
    
    next();
  };
};

/**
 * Log authentication attempts
 */
const auditAuth = (success) => {
  return (req, res, next) => {
    const ipAddress = req.ip || req.connection.remoteAddress;
    const userAgent = req.get('user-agent') || '';
    const username = req.body.username || 'unknown';
    
    setImmediate(() => {
      try {
        run(`INSERT INTO auth_log 
             (username, success, ip_address, user_agent, timestamp) 
             VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)`,
          [username, success ? 1 : 0, ipAddress, userAgent]
        );
      } catch (err) {
        console.error('Auth log error:', err.message);
      }
    });
    
    next();
  };
};

/**
 * Get audit trail for an entity
 * @param {string} entityType - Entity type
 * @param {number} entityId - Entity ID
 * @param {number} limit - Number of records to return
 */
function getAuditTrail(entityType, entityId, limit = 50) {
  const { rows } = require('../utils/database');
  
  return rows(`
    SELECT 
      al.*,
      u.username,
      u.role
    FROM audit_log al
    LEFT JOIN users u ON al.user_id = u.id
    WHERE al.entity_type = ? AND al.entity_id = ?
    ORDER BY al.timestamp DESC
    LIMIT ?
  `, [entityType, entityId, limit]);
}

/**
 * Get failed login attempts for monitoring
 * @param {number} minutes - Look back period in minutes
 */
function getFailedLogins(minutes = 15) {
  const { rows } = require('../utils/database');
  
  return rows(`
    SELECT 
      username,
      ip_address,
      COUNT(*) as attempts,
      MAX(timestamp) as last_attempt
    FROM auth_log
    WHERE success = 0
      AND timestamp > datetime('now', '-${minutes} minutes')
    GROUP BY username, ip_address
    HAVING attempts >= 3
    ORDER BY attempts DESC
  `);
}

module.exports = {
  auditLog,
  auditAuth,
  getAuditTrail,
  getFailedLogins
};
