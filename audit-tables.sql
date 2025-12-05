-- audit-tables.sql - Audit Trail Tables
-- Run this to add audit logging capability

-- Audit log for all data modifications
CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  action TEXT NOT NULL, -- create, update, delete, view
  entity_type TEXT NOT NULL, -- firm, tender, user, document, etc.
  entity_id INTEGER,
  ip_address TEXT,
  user_agent TEXT,
  details TEXT, -- JSON with additional context
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_log(timestamp);
CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_log(action);

-- Authentication log for security monitoring
CREATE TABLE IF NOT EXISTS auth_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL,
  success INTEGER NOT NULL DEFAULT 0, -- 0=failed, 1=success
  ip_address TEXT,
  user_agent TEXT,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_auth_username ON auth_log(username);
CREATE INDEX IF NOT EXISTS idx_auth_timestamp ON auth_log(timestamp);
CREATE INDEX IF NOT EXISTS idx_auth_success ON auth_log(success);
CREATE INDEX IF NOT EXISTS idx_auth_ip ON auth_log(ip_address);

-- Add updated_at trigger for firms table (example)
CREATE TRIGGER IF NOT EXISTS firms_updated_at 
AFTER UPDATE ON firms
FOR EACH ROW
BEGIN
  UPDATE firms SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

-- View for recent audit activity
CREATE VIEW IF NOT EXISTS recent_audit_activity AS
SELECT 
  al.id,
  al.action,
  al.entity_type,
  al.entity_id,
  u.username,
  u.role,
  al.ip_address,
  al.timestamp
FROM audit_log al
LEFT JOIN users u ON al.user_id = u.id
ORDER BY al.timestamp DESC
LIMIT 100;

-- View for failed login attempts
CREATE VIEW IF NOT EXISTS failed_login_attempts AS
SELECT 
  username,
  ip_address,
  COUNT(*) as attempts,
  MAX(timestamp) as last_attempt,
  MIN(timestamp) as first_attempt
FROM auth_log
WHERE success = 0
  AND timestamp > datetime('now', '-1 hour')
GROUP BY username, ip_address
HAVING attempts >= 3
ORDER BY attempts DESC;
