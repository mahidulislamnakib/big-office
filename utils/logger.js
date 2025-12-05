// utils/logger.js - Winston logger configuration
const winston = require('winston');
const path = require('path');
const fs = require('fs');

// Create logs directory if it doesn't exist
const logsDir = path.join(__dirname, '..', 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Define log format
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.splat(),
  winston.format.json()
);

// Create logger instance
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: logFormat,
  defaultMeta: { service: 'big-office' },
  transports: [
    // Write all logs to combined.log
    new winston.transports.File({ 
      filename: path.join(logsDir, 'combined.log'),
      maxsize: 5242880, // 5MB
      maxFiles: 5
    }),
    // Write errors to error.log
    new winston.transports.File({ 
      filename: path.join(logsDir, 'error.log'),
      level: 'error',
      maxsize: 5242880,
      maxFiles: 5
    }),
    // Write security events to security.log
    new winston.transports.File({ 
      filename: path.join(logsDir, 'security.log'),
      level: 'warn',
      maxsize: 5242880,
      maxFiles: 10
    })
  ]
});

// In development, also log to console
if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.simple()
    )
  }));
}

// Log security events
logger.security = (message, meta = {}) => {
  logger.warn(message, { type: 'security', ...meta });
};

// Log authentication events
logger.auth = (message, meta = {}) => {
  logger.info(message, { type: 'auth', ...meta });
};

// Log authorization events  
logger.authz = (message, meta = {}) => {
  logger.info(message, { type: 'authz', ...meta });
};

module.exports = logger;
