const express = require('express');
const router = express.Router();
const bankingController = require('../controllers/bankingController');
const loansController = require('../controllers/loansController');
const { protect } = require('../controllers/authController');
const { validatePagination, validateTransactionFilters } = require('../middleware/validate');

router.use(protect);

// Accounts
router.get('/accounts', bankingController.getAccounts);
router.get('/accounts/:id', bankingController.getAccount);
router.post('/accounts', bankingController.createAccount);
router.post('/accounts/:id/deposit', bankingController.deposit);
router.post('/accounts/:id/withdraw', bankingController.withdraw);

// Reset all accounts to zero
router.post('/reset', bankingController.resetAccounts);

// Transactions
router.get('/transactions', validatePagination, validateTransactionFilters, bankingController.getTransactions);

// Transfers
router.post('/transfers', bankingController.transfer);

// Loans
router.get('/loans', validatePagination, loansController.getAll);
router.get('/loans/:id', loansController.get);
router.post('/loans/apply', loansController.apply);
router.get('/loans/:id/payments', validatePagination, loansController.getPayments);
router.post('/loans/:id/payments', loansController.makePayment);

module.exports = router;
