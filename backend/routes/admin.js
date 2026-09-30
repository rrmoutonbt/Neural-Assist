const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const { protect } = require('../controllers/authController');
const { validatePagination, validateAuditFilters } = require('../middleware/validate');

// Require authentication
router.use(protect);

// Require admin role for all admin routes
router.use((req, res, next) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ success: false, message: 'Admin access required' });
  }
  next();
});

// Compliance
router.get('/compliance', adminController.getCompliance);
router.get('/compliance/flagged', adminController.getFlaggedTransactions || adminController.getCompliance);
router.put('/compliance/flagged/:id', adminController.reviewFlaggedTransaction);
router.get('/compliance/kyc', adminController.getKYCQueue);
router.get('/compliance/kyc/:id', adminController.getKYCApplication);
router.put('/compliance/kyc/:id', adminController.reviewKYC);

// Audit
router.get('/audit/logs', validatePagination, validateAuditFilters, adminController.getAuditLogs);

// System
router.get('/system/health', adminController.getSystemHealth);
router.post('/system/action', adminController.systemAction);

module.exports = router;
