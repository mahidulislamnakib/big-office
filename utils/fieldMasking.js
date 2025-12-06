// utils/fieldMasking.js - Comprehensive field-level masking with RBAC and audit
// Purpose: Enforce data privacy, GDPR compliance, and audit trail for sensitive fields

const { db, row, rows, run } = require('./database');
const logger = require('./logger');

/**
 * Masking utilities for different field types
 */
const maskPhone = (phone) => {
  if (!phone) return null;
  const cleaned = phone.replace(/\D/g, '');
  if (cleaned.length < 4) return '***-****';
  if (cleaned.length <= 6) return cleaned.slice(0, 2) + '***' + cleaned.slice(-2);
  // For Bangladeshi format: +8801712345678 -> +8801****5678
  if (cleaned.startsWith('880')) {
    return '+880' + cleaned.slice(3, 5) + '*****' + cleaned.slice(-3);
  }
  // For local format: 01712345678 -> 017*****678
  return cleaned.slice(0, 3) + '*****' + cleaned.slice(-3);
};

const maskEmail = (email) => {
  if (!email) return null;
  const [username, domain] = email.split('@');
  if (!username || !domain) return '***@***.***';
  const visibleChars = Math.min(2, username.length);
  const maskedUsername = username.slice(0, visibleChars) + '***';
  return maskedUsername + '@' + domain;
};

const maskNID = (nid) => {
  if (!nid) return null;
  if (nid.length < 4) return '****-****-****';
  // Show first 2 and last 4 digits: 1234567890123 -> 12****90123
  if (nid.length >= 10) {
    return nid.slice(0, 2) + '****' + nid.slice(-4);
  }
  return '****' + nid.slice(-4);
};

const maskString = (str, showChars = 2) => {
  if (!str) return null;
  if (str.length <= showChars) return '*'.repeat(str.length);
  return str.slice(0, showChars) + '***' + (str.length > showChars + 2 ? str.slice(-1) : '');
};

/**
 * Check if user has permission to view a field based on RBAC
 * @param {Object} user - User object with role
 * @param {string} fieldName - Name of the field
 * @param {string} visibilityLevel - Field visibility level (public/internal/restricted/private)
 * @returns {boolean}
 */
const hasViewPermission = (user, fieldName, visibilityLevel = 'internal') => {
  if (!user) {
    // Unauthenticated users - only public fields
    return visibilityLevel === 'public';
  }
  
  const userRole = user.role ? user.role.toLowerCase() : 'user';
  
  // First check visibility level (most restrictive)
  let visibilityAllows = false;
  switch (visibilityLevel) {
    case 'public':
      visibilityAllows = true;
      break;
    case 'internal':
      visibilityAllows = true; // Any authenticated user
      break;
    case 'restricted':
      visibilityAllows = ['admin', 'hr', 'manager'].includes(userRole);
      break;
    case 'private':
      visibilityAllows = userRole === 'admin';
      break;
    default:
      visibilityAllows = false;
  }
  
  // If visibility level denies access, return false immediately
  if (!visibilityAllows) {
    return false;
  }
  
  // Then check policy from database (may not exist in test environments)
  try {
    const policy = row(`
      SELECT can_view, can_unmask 
      FROM field_access_policies 
      WHERE field_name = ? AND role = ?
    `, [fieldName, userRole]);
    
    if (policy) {
      // Both visibility AND policy must allow access
      return policy.can_view === 1;
    }
  } catch (error) {
    // Table doesn't exist or DB error - fallback to visibility level logic already checked
  }
  
  // If no policy found, fallback to visibility level (already checked)
  return visibilityAllows;
};

/**
 * Check if user can request unmasking
 * @param {Object} user - User object
 * @param {string} fieldName - Field to unmask
 * @returns {Object} - { canUnmask, requiresMFA, requiresApproval, reason }
 */
const canRequestUnmask = (user, fieldName) => {
  if (!user) {
    return { canUnmask: false, reason: 'Authentication required' };
  }
  
  const userRole = user.role ? user.role.toLowerCase() : 'user';
  
  // Get policy
  const policy = row(`
    SELECT * FROM field_access_policies 
    WHERE field_name = ? AND role = ?
  `, [fieldName, userRole]);
  
  if (!policy) {
    // No policy = restricted access
    return { 
      canUnmask: userRole === 'admin', 
      requiresMFA: true,
      requiresApproval: true,
      reason: 'No access policy defined for this role'
    };
  }
  
  // Check daily limit
  const today = new Date().toISOString().split('T')[0];
  const todayRequests = row(`
    SELECT COUNT(*) as count 
    FROM unmask_requests 
    WHERE user_id = ? 
      AND field_name = ? 
      AND DATE(created_at) = ?
      AND status IN ('approved', 'pending')
  `, [user.id, fieldName, today]);
  
  if (todayRequests && todayRequests.count >= policy.max_requests_per_day) {
    return { 
      canUnmask: false, 
      reason: `Daily limit exceeded (${policy.max_requests_per_day} requests)` 
    };
  }
  
  return {
    canUnmask: policy.can_unmask === 1,
    requiresMFA: policy.requires_mfa === 1,
    requiresApproval: policy.requires_approval === 1,
    maxDailyRequests: policy.max_requests_per_day,
    remainingToday: policy.max_requests_per_day - (todayRequests?.count || 0)
  };
};

/**
 * Record audit trail for sensitive field access
 * @param {Object} params - Audit parameters
 * @returns {number} - Audit record ID
 */
const recordAuditRead = (params) => {
  const {
    userId,
    userRole,
    userName,
    officerId,
    officerName,
    fieldName,
    fieldValueMasked,
    accessType = 'view',
    accessReason = null,
    ipAddress = null,
    userAgent = null,
    requestId = null,
    mfaVerified = 0
  } = params;
  
  try {
    const result = run(`
      INSERT INTO audit_reads (
        user_id, user_role, user_name,
        officer_id, officer_name,
        field_name, field_value_masked,
        access_type, access_reason,
        ip_address, user_agent, request_id,
        mfa_verified
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      userId, userRole, userName,
      officerId, officerName,
      fieldName, fieldValueMasked,
      accessType, accessReason,
      ipAddress, userAgent, requestId,
      mfaVerified
    ]);
    
    logger.info('Audit read recorded', {
      auditId: result.lastInsertRowid,
      userId,
      officerId,
      fieldName,
      accessType,
      requestId
    });
    
    return result.lastInsertRowid;
  } catch (error) {
    logger.error('Failed to record audit read', error, {
      userId,
      officerId,
      fieldName
    });
    throw error;
  }
};

/**
 * Filter officer data based on user permissions and visibility settings
 * Main function for applying field-level security
 * @param {Object} officer - Raw officer data from database
 * @param {Object} user - User object (null if unauthenticated)
 * @param {Object} options - Additional options
 * @returns {Object} - Filtered officer data with masked fields
 */
const filterOfficerByPermissions = (officer, user = null, options = {}) => {
  if (!officer) return null;
  
  const {
    includeMaskedFields = true,
    recordAudit = false,
    requestId = null,
    ipAddress = null,
    userAgent = null
  } = options;
  
  // Clone to avoid mutation
  const filtered = { ...officer };
  
  // Always visible fields (public profile data)
  const alwaysVisible = [
    'id', 'full_name', 'name_bangla', 'employee_id',
    'designation_id', 'designation_title', 'designation_title_bangla',
    'position_id', 'position_title',
    'office_id', 'office_name', 'office_code',
    'department', 'employment_status', 'photo_url',
    'joining_date', 'created_at', 'updated_at'
  ];
  
  // Check if profile is published
  if (!officer.profile_published && !user) {
    return null; // Hide entire profile from public
  }
  
  // Track what we're accessing for audit
  const accessedFields = [];
  
  // Handle phone fields
  const phoneVisibility = officer.phone_visibility || 'internal';
  if (!hasViewPermission(user, 'personal_mobile', phoneVisibility)) {
    delete filtered.personal_mobile;
    delete filtered.official_mobile;
  } else if (includeMaskedFields) {
    if (filtered.personal_mobile) {
      const maskedValue = maskPhone(filtered.personal_mobile);
      accessedFields.push({
        field: 'personal_mobile',
        masked: maskedValue,
        visibility: phoneVisibility
      });
      filtered.personal_mobile = maskedValue;
      filtered._personal_mobile_masked = true;
    }
    if (filtered.official_mobile) {
      const maskedValue = maskPhone(filtered.official_mobile);
      filtered.official_mobile = maskedValue;
      filtered._official_mobile_masked = true;
    }
  }
  
  // Handle email fields
  const emailVisibility = officer.email_visibility || 'internal';
  if (!hasViewPermission(user, 'personal_email', emailVisibility)) {
    delete filtered.personal_email;
    delete filtered.official_email;
  } else if (includeMaskedFields) {
    if (filtered.personal_email) {
      const maskedValue = maskEmail(filtered.personal_email);
      accessedFields.push({
        field: 'personal_email',
        masked: maskedValue,
        visibility: emailVisibility
      });
      filtered.personal_email = maskedValue;
      filtered._personal_email_masked = true;
    }
    if (filtered.official_email) {
      const maskedValue = maskEmail(filtered.official_email);
      filtered.official_email = maskedValue;
      filtered._official_email_masked = true;
    }
  }
  
  // Handle NID and sensitive ID numbers
  const nidVisibility = officer.nid_visibility || 'restricted';
  if (!hasViewPermission(user, 'nid_number', nidVisibility)) {
    delete filtered.nid_number;
    delete filtered.passport_number;
    delete filtered.tin_number;
  } else if (includeMaskedFields) {
    if (filtered.nid_number) {
      const maskedValue = maskNID(filtered.nid_number);
      accessedFields.push({
        field: 'nid_number',
        masked: maskedValue,
        visibility: nidVisibility
      });
      filtered.nid_number = maskedValue;
      filtered._nid_number_masked = true;
    }
    if (filtered.passport_number) {
      filtered.passport_number = maskString(filtered.passport_number);
      filtered._passport_number_masked = true;
    }
    if (filtered.tin_number) {
      filtered.tin_number = maskString(filtered.tin_number);
      filtered._tin_number_masked = true;
    }
  }
  
  // Sensitive personal info - restricted by default
  const sensitivePersonalFields = [
    'father_name', 'mother_name', 'date_of_birth', 'blood_group',
    'religion', 'marital_status', 'spouse_name', 'children_count',
    'emergency_contact_name', 'emergency_contact_phone', 'emergency_contact_relation',
    'present_address', 'permanent_address', 'district', 'division', 'post_code'
  ];
  
  const userRole = user?.role?.toLowerCase() || 'anonymous';
  const canViewSensitive = ['admin', 'hr', 'manager'].includes(userRole);
  
  if (!canViewSensitive) {
    sensitivePersonalFields.forEach(field => delete filtered[field]);
  }
  
  // Financial data - admins and HR only
  const financialFields = [
    'current_grade', 'current_scale', 'basic_salary', 'current_salary',
    'performance_rating', 'last_appraisal_date',
    'bank_name', 'bank_account_name', 'bank_account_number', 'bank_branch'
  ];
  
  const canViewFinancial = ['admin', 'hr'].includes(userRole);
  
  if (!canViewFinancial) {
    financialFields.forEach(field => delete filtered[field]);
  } else if (includeMaskedFields) {
    // Mask bank account number even for authorized users
    if (filtered.bank_account_number) {
      filtered.bank_account_number = maskString(filtered.bank_account_number, 3);
      filtered._bank_account_number_masked = true;
    }
  }
  
  // Internal metadata - admins only
  const metadataFields = [
    'created_by', 'updated_by', 'notes', 'internal_notes',
    'phone_visibility', 'email_visibility', 'nid_visibility',
    'verification_status', 'consent_record', 'profile_published'
  ];
  
  if (userRole !== 'admin') {
    metadataFields.forEach(field => delete filtered[field]);
  }
  
  // Add unmask capability info if user can unmask
  if (user && includeMaskedFields) {
    const maskingInfo = {
      phone: filtered._personal_mobile_masked ? canRequestUnmask(user, 'personal_mobile') : null,
      email: filtered._personal_email_masked ? canRequestUnmask(user, 'personal_email') : null,
      nid: filtered._nid_number_masked ? canRequestUnmask(user, 'nid_number') : null
    };
    
    // Remove null entries
    filtered._unmask_info = Object.fromEntries(
      Object.entries(maskingInfo).filter(([_, v]) => v !== null)
    );
  }
  
  // Record audit trail
  if (recordAudit && user && accessedFields.length > 0) {
    for (const { field, masked, visibility } of accessedFields) {
      try {
        recordAuditRead({
          userId: user.id,
          userRole: user.role,
          userName: user.username || user.full_name,
          officerId: officer.id,
          officerName: officer.full_name,
          fieldName: field,
          fieldValueMasked: masked,
          accessType: 'view',
          ipAddress,
          userAgent,
          requestId,
          mfaVerified: 0
        });
      } catch (error) {
        // Log but don't fail the request
        logger.error('Failed to record audit', error);
      }
    }
  }
  
  return filtered;
};

/**
 * Apply filtering to a list of officers
 * @param {Array} officers - Array of officer objects
 * @param {Object} user - User object
 * @param {Object} options - Options
 * @returns {Array} - Filtered officers
 */
const filterOfficersListByPermissions = (officers, user = null, options = {}) => {
  if (!Array.isArray(officers)) return [];
  
  return officers
    .map(officer => filterOfficerByPermissions(officer, user, options))
    .filter(officer => officer !== null);
};

/**
 * Generate MFA code for unmask request
 * @returns {string} - 6-digit code
 */
const generateMFACode = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

/**
 * Verify MFA code
 * @param {string} requestId - Unmask request ID
 * @param {string} code - Code to verify
 * @returns {boolean}
 */
const verifyMFACode = (requestId, code) => {
  const request = row(`
    SELECT mfa_code, mfa_code_expires_at 
    FROM unmask_requests 
    WHERE request_id = ?
  `, [requestId]);
  
  if (!request) return false;
  
  // Check expiration
  const expiresAt = new Date(request.mfa_code_expires_at);
  if (expiresAt < new Date()) return false;
  
  // Check code
  return request.mfa_code === code;
};

module.exports = {
  // Masking utilities
  maskPhone,
  maskEmail,
  maskNID,
  maskString,
  
  // Permission checks
  hasViewPermission,
  canRequestUnmask,
  
  // Audit
  recordAuditRead,
  
  // Main filtering functions
  filterOfficerByPermissions,
  filterOfficersListByPermissions,
  
  // MFA
  generateMFACode,
  verifyMFACode
};
