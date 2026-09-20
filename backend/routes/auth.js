const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { validateLogin, validateRegister, validateForgotPassword, validateResetPassword } = require('../middleware/validate');

router.post('/register', validateRegister, authController.register);
router.post('/login', validateLogin, authController.login);
router.post('/logout', authController.logout);
router.get('/verify/:token', authController.verifyEmail);
router.post('/forgot-password', validateForgotPassword, authController.forgotPassword);
router.post('/reset-password/:token', validateResetPassword, authController.resetPassword);
router.get('/me', authController.protect, authController.getMe);

module.exports = router;
