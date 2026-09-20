const validator = require('validator');

const sanitizeString = (str) => {
  if (typeof str !== 'string') return str;
  return validator.escape(validator.trim(str));
};

const sanitizeMongoQuery = (value) => {
  if (typeof value === 'object' && value !== null) {
    // Strip $ operators to prevent NoSQL injection
    const clean = {};
    for (const key of Object.keys(value)) {
      if (!key.startsWith('$')) {
        clean[key] = sanitizeMongoQuery(value[key]);
      }
    }
    return clean;
  }
  return value;
};

exports.validateLogin = (req, res, next) => {
  const { email, password } = req.body;

  if (!email || !validator.isEmail(String(email))) {
    return res.status(400).json({ success: false, message: 'Valid email is required' });
  }
  if (!password || typeof password !== 'string') {
    return res.status(400).json({ success: false, message: 'Password is required' });
  }

  req.body.email = validator.normalizeEmail(String(email));
  next();
};

exports.validateRegister = (req, res, next) => {
  const { email, password, username, firstName, lastName } = req.body;

  if (!email || !validator.isEmail(String(email))) {
    return res.status(400).json({ success: false, message: 'Valid email is required' });
  }
  if (!password || typeof password !== 'string' || password.length < 6) {
    return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });
  }
  if (!username || typeof username !== 'string' || !validator.isAlphanumeric(username.replace(/[_-]/g, ''))) {
    return res.status(400).json({ success: false, message: 'Valid username is required (alphanumeric, hyphens, underscores)' });
  }

  req.body.email = validator.normalizeEmail(String(email));
  req.body.username = validator.trim(String(username));
  if (firstName) req.body.firstName = sanitizeString(String(firstName));
  if (lastName) req.body.lastName = sanitizeString(String(lastName));
  next();
};

exports.validateForgotPassword = (req, res, next) => {
  const { email } = req.body;
  if (!email || !validator.isEmail(String(email))) {
    return res.status(400).json({ success: false, message: 'Valid email is required' });
  }
  req.body.email = validator.normalizeEmail(String(email));
  next();
};

exports.validateResetPassword = (req, res, next) => {
  const { password } = req.body;
  if (!password || typeof password !== 'string' || password.length < 6) {
    return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });
  }
  next();
};

exports.validatePagination = (req, res, next) => {
  const page = parseInt(req.query.page) || 1;
  const limit = Math.min(Math.max(parseInt(req.query.limit) || 50, 1), 100);

  req.query.page = page;
  req.query.limit = limit;
  next();
};

exports.validateTransactionFilters = (req, res, next) => {
  const validTypes = ['deposit', 'withdrawal', 'transfer', 'payment', 'fee', 'interest'];
  const validStatuses = ['completed', 'pending', 'failed', 'cancelled'];

  if (req.query.type && !validTypes.includes(req.query.type)) {
    return res.status(400).json({ success: false, message: 'Invalid transaction type' });
  }
  if (req.query.status && !validStatuses.includes(req.query.status)) {
    return res.status(400).json({ success: false, message: 'Invalid transaction status' });
  }
  if (req.query.accountId) {
    req.query.accountId = sanitizeString(String(req.query.accountId));
  }
  next();
};

exports.validateAuditFilters = (req, res, next) => {
  const validLevels = ['info', 'warning', 'error', 'critical'];
  const validEntityTypes = ['compliance', 'kyc', 'transaction', 'system', 'security'];

  if (req.query.level && !validLevels.includes(req.query.level)) {
    return res.status(400).json({ success: false, message: 'Invalid audit level' });
  }
  if (req.query.entityType && !validEntityTypes.includes(req.query.entityType)) {
    return res.status(400).json({ success: false, message: 'Invalid entity type' });
  }
  next();
};

exports.sanitizeMongoQuery = sanitizeMongoQuery;
