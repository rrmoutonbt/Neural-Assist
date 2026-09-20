const winston = require('winston');

const isProduction = process.env.NODE_ENV === 'production';

const logger = winston.createLogger({
  level: isProduction ? 'info' : 'debug',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: !isProduction }),
    isProduction
      ? winston.format.json()
      : winston.format.combine(winston.format.colorize(), winston.format.simple())
  ),
  defaultMeta: { service: 'banc-api' },
  transports: [
    new winston.transports.Console()
  ]
});

// Audit logger for compliance-sensitive operations
logger.audit = (action, details) => {
  logger.info('AUDIT', { action, ...details, audit: true });
};

module.exports = logger;
