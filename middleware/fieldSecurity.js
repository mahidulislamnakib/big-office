// ============================================
// FIELD-LEVEL SECURITY MIDDLEWARE
// Big Office v3.2 - Phase 10
// Enforces visibility rules for officer data
// ============================================

/**
 * Field masking utilities
 */
const maskPhone = (phone) => {
  if (!phone) return null;
  const cleaned = phone.replace(/\D/g, '');
  if (cleaned.length < 4) return 'XXX-XXXX';
  return cleaned.slice(0, -4).replace(/\d/g, 'X') + '-' + cleaned.slice(-4);
};

const maskEmail = (email) => {
  if (!email) return null;
  const [username, domain] = email.split('@');
  if (!username || !domain) return 'XXX@XXX.com';
  const visibleChars = Math.min(3, username.length);
  return username.slice(0, visibleChars) + '***@' + domain;
};

const maskNID = (nid) => {
  if (!nid) return null;
  if (nid.length < 4) return 'XXXX-XXXX-XXXX';
  return 'XXXX-XXXX-' + nid.slice(-4);
};

/**
 * Check if user has permission for a visibility level
 * @param {Object} user - User object from JWT token
 * @param {string} visibilityLevel - Field visibility level
 * @returns {boolean}
 */
const hasPermission = (user, visibilityLevel) => {
  if (!user) {
    // Not logged in - only public fields visible
    return visibilityLevel === 'public';
  }
  
  const userRole = user.role ? user.role.toLowerCase() : 'user';
  
  switch (visibilityLevel) {
    case 'public':
      return true;
    
    case 'internal':
      // Any logged-in user
      return true;
    
    case 'restricted':
      // Admins, HR, and managers only
      return ['admin', 'hr', 'manager'].includes(userRole);
    
    case 'private':
      // Only admins
      return userRole === 'admin';
    
    default:
      // Unknown level - treat as private
      return userRole === 'admin';
  }
};

/**
 * Apply field-level security to a single officer record
 * @param {Object} officer - Officer data from database
 * @param {Object} user - User object from JWT (null if not authenticated)
 * @param {boolean} maskSensitive - Whether to mask visible sensitive fields
 * @returns {Object} Filtered officer data
 */
const applyFieldSecurity = (officer, user = null, maskSensitive = false) => {
  if (!officer) return null;
  
  // Clone to avoid mutating original
  const filtered = { ...officer };
  
  // Always visible fields (no restrictions)
  const alwaysVisible = [
    'id', 'full_name', 'name_bangla', 'employee_id',
    'designation_id', 'designation_title', 'position_id', 'position_title',
    'office_id', 'office_name', 'department', 'employment_status',
    'photo_url', 'joining_date', 'created_at', 'updated_at'
  ];
  
  // Apply phone visibility
  if (!hasPermission(user, officer.phone_visibility || 'internal')) {
    delete filtered.personal_mobile;
    delete filtered.official_mobile;
  } else if (maskSensitive && officer.phone_visibility !== 'public') {
    if (filtered.personal_mobile) filtered.personal_mobile = maskPhone(filtered.personal_mobile);
    if (filtered.official_mobile) filtered.official_mobile = maskPhone(filtered.official_mobile);
  }
  
  // Apply email visibility
  if (!hasPermission(user, officer.email_visibility || 'internal')) {
    delete filtered.personal_email;
    delete filtered.official_email;
  } else if (maskSensitive && officer.email_visibility !== 'public') {
    if (filtered.personal_email) filtered.personal_email = maskEmail(filtered.personal_email);
    if (filtered.official_email) filtered.official_email = maskEmail(filtered.official_email);
  }
  
  // Apply NID visibility (default: restricted)
  if (!hasPermission(user, officer.nid_visibility || 'restricted')) {
    delete filtered.nid_number;
    delete filtered.passport_number;
    delete filtered.tin_number;
  } else if (maskSensitive && officer.nid_visibility !== 'public') {
    if (filtered.nid_number) filtered.nid_number = maskNID(filtered.nid_number);
  }
  
  // Sensitive personal info - restricted by default
  const sensitiveFields = [
    'father_name', 'mother_name', 'date_of_birth', 'blood_group',
    'religion', 'marital_status', 'nationality',
    'emergency_contact', 'emergency_contact_name', 'emergency_contact_phone',
    'present_address', 'permanent_address', 'district', 'division', 'post_code'
  ];
  
  if (!hasPermission(user, 'restricted')) {
    sensitiveFields.forEach(field => delete filtered[field]);
  }
  
  // Financial data - restricted to admins and HR
  const financialFields = [
    'current_grade', 'current_scale', 'basic_salary',
    'current_salary', 'performance_rating', 'last_appraisal_date'
  ];
  
  if (!hasPermission(user, 'restricted')) {
    financialFields.forEach(field => delete filtered[field]);
  }
  
  // Internal metadata - admins only
  const metadataFields = [
    'consent_record', 'notes', 'created_by', 'updated_by',
    'phone_visibility', 'email_visibility', 'nid_visibility',
    'verification_status', 'signature_url'
  ];
  
  if (!hasPermission(user, 'private')) {
    metadataFields.forEach(field => delete filtered[field]);
  }
  
  // Profile published check - if not published, only internal users can see
  if (!officer.profile_published && !user) {
    return null; // Hide entire profile from public
  }
  
  return filtered;
};

/**
 * Apply field-level security to an array of officers
 * @param {Array} officers - Array of officer data
 * @param {Object} user - User object from JWT
 * @param {boolean} maskSensitive - Whether to mask visible sensitive fields
 * @returns {Array} Filtered officers array
 */
const applyFieldSecurityToList = (officers, user = null, maskSensitive = false) => {
  if (!Array.isArray(officers)) return [];
  
  return officers
    .map(officer => applyFieldSecurity(officer, user, maskSensitive))
    .filter(officer => officer !== null); // Remove hidden profiles
};

/**
 * Express middleware to apply field security to officer responses
 * Usage: app.get('/api/officers', authenticate, applyOfficerSecurity, ...)
 */
const applyOfficerSecurity = (req, res, next) => {
  // Store original json method
  const originalJson = res.json.bind(res);
  
  // Override json method
  res.json = function(data) {
    const user = req.user || null;
    
    // Check if response contains officer data
    if (data && data.officer) {
      data.officer = applyFieldSecurity(data.officer, user);
    }
    
    if (data && data.officers) {
      data.officers = applyFieldSecurityToList(data.officers, user);
    }
    
    if (data && Array.isArray(data)) {
      data = applyFieldSecurityToList(data, user);
    }
    
    // Call original json method with filtered data
    return originalJson(data);
  };
  
  next();
};

/**
 * Log sensitive field access for audit trail
 * @param {Object} db - Database connection
 * @param {number} userId - User ID accessing the data
 * @param {string} officerId - Officer ID being accessed
 * @param {Array} fieldsAccessed - Array of field names accessed
 * @param {string} ipAddress - IP address of request
 */
const logFieldAccess = (db, userId, officerId, fieldsAccessed, ipAddress) => {
  try {
    const sensitiveFields = fieldsAccessed.filter(field => 
      ['nid_number', 'passport_number', 'tin_number', 'basic_salary', 
       'current_salary', 'personal_mobile', 'personal_email'].includes(field)
    );
    
    if (sensitiveFields.length === 0) return;
    
    // Check if activity_logs table exists
    const tableExists = db.prepare(`
      SELECT name FROM sqlite_master 
      WHERE type='table' AND name='activity_logs'
    `).get();
    
    if (!tableExists) {
      console.log('Activity logs table not found - skipping field access logging');
      return;
    }
    
    const stmt = db.prepare(`
      INSERT INTO activity_logs (
        user_id, action_type, target_type, target_id, 
        description, ip_address, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
    `);
    
    stmt.run(
      userId || null,
      'sensitive_field_access',
      'officer',
      officerId,
      `Accessed sensitive fields: ${sensitiveFields.join(', ')}`,
      ipAddress
    );
  } catch (err) {
    console.error('Field access logging error:', err.message);
  }
};

module.exports = {
  applyFieldSecurity,
  applyFieldSecurityToList,
  applyOfficerSecurity,
  hasPermission,
  maskPhone,
  maskEmail,
  maskNID,
  logFieldAccess
};
