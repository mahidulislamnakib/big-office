// middleware/validator.js - Input Validation Middleware
const Joi = require('joi');

/**
 * Validation middleware factory
 * @param {Object} schema - Joi validation schema
 * @param {string} property - Request property to validate ('body', 'query', 'params')
 */
const validate = (schema, property = 'body') => {
  return (req, res, next) => {
    const { error, value } = schema.validate(req[property], {
      abortEarly: false,
      stripUnknown: true
    });

    if (error) {
      const errors = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message
      }));
      
      return res.status(400).json({
        error: 'Validation failed',
        details: errors
      });
    }

    // Replace request data with validated and sanitized data
    req[property] = value;
    next();
  };
};

// Common validation schemas
const schemas = {
  // Firm validation
  firm: Joi.object({
    id: Joi.number().integer().positive().optional(),
    name: Joi.string().trim().min(2).max(200).required(),
    business_type: Joi.string().valid('proprietorship', 'partnership', 'private_ltd', 'public_ltd').optional(),
    category: Joi.string().trim().max(500).optional(),
    tin: Joi.string().trim().max(50).optional().allow(''),
    bin: Joi.string().trim().max(50).optional().allow(''),
    address: Joi.string().trim().max(500).optional().allow(''),
    city: Joi.string().trim().max(100).optional().allow(''),
    postal_code: Joi.string().trim().max(20).optional().allow(''),
    email: Joi.string().email().trim().max(100).optional().allow(''),
    phone: Joi.string().trim().max(20).optional().allow(''),
    mobile: Joi.string().trim().max(20).optional().allow(''),
    website: Joi.string().uri().trim().max(200).optional().allow(''),
    established_date: Joi.string().isoDate().optional().allow(''),
    proprietor_name: Joi.string().trim().max(100).optional().allow(''),
    contact_person: Joi.string().trim().max(100).optional().allow(''),
    contact_designation: Joi.string().trim().max(100).optional().allow(''),
    status: Joi.string().valid('active', 'inactive', 'suspended').default('active'),
    notes: Joi.string().trim().max(1000).optional().allow('')
  }),

  // License validation
  license: Joi.object({
    id: Joi.number().integer().positive().optional(),
    firm_id: Joi.number().integer().positive().required(),
    license_type: Joi.string().trim().max(50).required(),
    license_number: Joi.string().trim().max(100).optional().allow(''),
    issuing_authority: Joi.string().trim().max(200).optional().allow(''),
    issue_date: Joi.string().isoDate().optional().allow(''),
    expiry_date: Joi.string().isoDate().optional().allow(''),
    renewal_date: Joi.string().isoDate().optional().allow(''),
    amount: Joi.number().min(0).optional(),
    status: Joi.string().valid('active', 'expired', 'under_renewal', 'cancelled').default('active'),
    document_path: Joi.string().trim().max(500).optional().allow(''),
    notes: Joi.string().trim().max(1000).optional().allow('')
  }),

  // User validation
  user: Joi.object({
    id: Joi.number().integer().positive().optional(),
    username: Joi.string().alphanum().trim().min(3).max(50).required(),
    email: Joi.string().email().trim().max(100).optional().allow(''),
    password: Joi.string().min(6).max(100).optional(),
    role: Joi.string().valid('admin', 'manager', 'user', 'accounts').required(),
    firm_access: Joi.string().trim().max(500).optional().allow(''),
    status: Joi.string().valid('active', 'inactive', 'suspended').default('active')
  }),

  // Login validation
  login: Joi.object({
    username: Joi.string().required(),
    password: Joi.string().required()
  }),

  // Tender validation
  tender: Joi.object({
    id: Joi.number().integer().positive().optional(),
    tender_no: Joi.string().trim().max(100).required(),
    project_name: Joi.string().trim().min(3).max(300).required(),
    procuring_entity: Joi.string().trim().max(200).required(),
    tender_type: Joi.string().trim().max(100).optional().allow(''),
    package_no: Joi.string().trim().max(100).optional().allow(''),
    tender_value: Joi.number().min(0).optional(),
    source: Joi.string().trim().max(100).optional().allow(''),
    publication_date: Joi.string().isoDate().optional().allow(''),
    submission_deadline: Joi.string().isoDate().optional().allow(''),
    opening_date: Joi.string().isoDate().optional().allow(''),
    assigned_firm_id: Joi.number().integer().positive().optional().allow(null),
    status: Joi.string().valid('new', 'in_progress', 'submitted', 'won', 'lost', 'cancelled').default('new'),
    notes: Joi.string().trim().max(2000).optional().allow('')
  }),

  // Project validation
  project: Joi.object({
    id: Joi.number().integer().positive().optional(),
    firm_id: Joi.number().integer().positive().required(),
    tender_id: Joi.number().integer().positive().optional().allow(null),
    project_name: Joi.string().trim().min(3).max(300).required(),
    project_type: Joi.string().trim().max(100).optional().allow(''),
    client_name: Joi.string().trim().max(200).optional().allow(''),
    location: Joi.string().trim().max(200).optional().allow(''),
    contract_value: Joi.number().min(0).optional(),
    contract_date: Joi.string().isoDate().optional().allow(''),
    start_date: Joi.string().isoDate().optional().allow(''),
    completion_date: Joi.string().isoDate().optional().allow(''),
    status: Joi.string().valid('planning', 'ongoing', 'completed', 'on_hold', 'cancelled').default('planning'),
    notes: Joi.string().trim().max(2000).optional().allow('')
  }),

  // Bank account validation
  bankAccount: Joi.object({
    id: Joi.number().integer().positive().optional(),
    firm_id: Joi.number().integer().positive().required(),
    bank_name: Joi.string().trim().max(100).required(),
    branch_name: Joi.string().trim().max(100).optional().allow(''),
    account_number: Joi.string().trim().max(50).required(),
    account_type: Joi.string().valid('current', 'savings', 'od', 'cc').required(),
    account_title: Joi.string().trim().max(200).required(),
    currency: Joi.string().trim().max(10).default('BDT'),
    current_balance: Joi.number().optional(),
    status: Joi.string().valid('active', 'inactive', 'closed').default('active'),
    notes: Joi.string().trim().max(1000).optional().allow('')
  }),

  // Task validation
  task: Joi.object({
    id: Joi.number().integer().positive().optional(),
    title: Joi.string().trim().min(3).max(200).required(),
    description: Joi.string().trim().max(2000).optional().allow(''),
    assigned_to: Joi.number().integer().positive().optional().allow(null),
    priority: Joi.string().valid('low', 'medium', 'high', 'urgent').default('medium'),
    status: Joi.string().valid('pending', 'in_progress', 'completed', 'cancelled').default('pending'),
    due_date: Joi.string().isoDate().optional().allow(''),
    related_entity: Joi.string().trim().max(50).optional().allow(''),
    related_id: Joi.number().integer().positive().optional().allow(null),
    notes: Joi.string().trim().max(1000).optional().allow('')
  }),

  // Pagination validation
  pagination: Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(50),
    sort: Joi.string().trim().max(50).optional(),
    order: Joi.string().valid('asc', 'desc', 'ASC', 'DESC').default('desc')
  }),

  // ID parameter validation
  id: Joi.object({
    id: Joi.number().integer().positive().required()
  })
};

module.exports = {
  validate,
  schemas
};
