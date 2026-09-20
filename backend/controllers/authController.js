const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const User = require('../models/User');
const sendEmail = require('../services/emailService');
const logger = require('../services/logger');

const TOKEN_EXPIRY = process.env.JWT_EXPIRES_IN || '24h';

const signToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: TOKEN_EXPIRY
  });
};

const createSendToken = (user, statusCode, res) => {
  const token = signToken(user._id);
  user.password = undefined;
  res.status(statusCode).json({
    success: true,
    accessToken: token,
    expiresIn: TOKEN_EXPIRY,
    user: {
      id: user._id,
      email: user.email,
      username: user.username,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      isVerified: user.isVerified
    }
  });
};

exports.register = async (req, res) => {
  try {
    const { email, password, username, firstName, lastName } = req.body;

    // Registration is permanently closed
    return res.status(403).json({
      success: false,
      message: "Registration is closed. No new accounts are being accepted."
    });
    
    const existingUser = await User.findOne({ $or: [{ email }, { username }] });
    if (existingUser) {
      return res.status(400).json({ 
        success: false, 
        message: existingUser.email === email ? 'Email already registered' : 'Username already taken'
      });
    }
    
    const verificationToken = crypto.randomBytes(32).toString('hex');
    const user = await User.create({
      email,
      password,
      username,
      firstName,
      lastName,
      verificationToken,
      verificationExpires: Date.now() + 24 * 60 * 60 * 1000
    });
    
    try {
      const verifyUrl = `${process.env.CLIENT_URL}/verify.html?token=${verificationToken}`;
      await sendEmail({
        to: email,
        subject: 'Verify your Banc of El account',
        html: `<h1>Welcome to Banc of El</h1><p>Click <a href="${verifyUrl}">here</a> to verify your email.</p>`
      });
    } catch (emailErr) {
      logger.error('Email send failed:', emailErr);
    }
    
    createSendToken(user, 201, res);
  } catch (error) {
    logger.error('Register error:', error);
    res.status(500).json({ success: false, message: 'Registration failed' });
  }
};

exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Please provide email and password' });
    }
    
    const user = await User.findOne({ email }).select('+password');
    
    if (!user || !(await user.comparePassword(password))) {
      return res.status(401).json({ success: false, message: 'Invalid email or password' });
    }
    
    if (!user.isActive) {
      return res.status(401).json({ success: false, message: 'Account is deactivated' });
    }
    
    if (user.isLocked()) {
      return res.status(423).json({ success: false, message: 'Account temporarily locked' });
    }
    
    user.lastLogin = new Date();
    user.loginAttempts = 0;
    await user.save({ validateBeforeSave: false });
    
    createSendToken(user, 200, res);
  } catch (error) {
    logger.error('Login error:', error);
    res.status(500).json({ success: false, message: 'Login failed' });
  }
};

exports.logout = (req, res) => {
  res.json({ success: true, message: 'Logged out successfully' });
};

exports.verifyEmail = async (req, res) => {
  try {
    const user = await User.findOne({
      verificationToken: req.params.token,
      verificationExpires: { $gt: Date.now() }
    });
    
    if (!user) {
      return res.status(400).json({ success: false, message: 'Invalid or expired token' });
    }
    
    user.isVerified = true;
    user.verificationToken = undefined;
    user.verificationExpires = undefined;
    await user.save({ validateBeforeSave: false });
    
    res.json({ success: true, message: 'Email verified successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Verification failed' });
  }
};

exports.forgotPassword = async (req, res) => {
  try {
    const user = await User.findOne({ email: req.body.email });
    if (!user) {
      return res.json({ success: true, message: 'If email exists, reset link sent' });
    }
    
    const resetToken = crypto.randomBytes(32).toString('hex');
    user.resetPasswordToken = crypto.createHash('sha256').update(resetToken).digest('hex');
    user.resetPasswordExpires = Date.now() + 60 * 60 * 1000;
    await user.save({ validateBeforeSave: false });
    
    const resetUrl = `${process.env.CLIENT_URL}/reset-password.html?token=${resetToken}`;
    await sendEmail({
      to: user.email,
      subject: 'Password Reset - Banc of El',
      html: `<p>Click <a href="${resetUrl}">here</a> to reset your password. Valid for 1 hour.</p>`
    });
    
    res.json({ success: true, message: 'If email exists, reset link sent' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Could not send reset email' });
  }
};

exports.resetPassword = async (req, res) => {
  try {
    const hashedToken = crypto.createHash('sha256').update(req.params.token).digest('hex');
    const user = await User.findOne({
      resetPasswordToken: hashedToken,
      resetPasswordExpires: { $gt: Date.now() }
    });
    
    if (!user) {
      return res.status(400).json({ success: false, message: 'Invalid or expired token' });
    }
    
    user.password = req.body.password;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    await user.save();
    
    createSendToken(user, 200, res);
  } catch (error) {
    res.status(500).json({ success: false, message: 'Password reset failed' });
  }
};

exports.protect = async (req, res, next) => {
  try {
    let token;
    if (req.headers.authorization?.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    }
    
    if (!token) {
      return res.status(401).json({ success: false, message: 'Not authenticated' });
    }
    
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id);
    
    if (!user) {
      return res.status(401).json({ success: false, message: 'User no longer exists' });
    }
    
    req.user = user;
    next();
  } catch (error) {
    res.status(401).json({ success: false, message: 'Invalid token' });
  }
};

exports.getMe = async (req, res) => {
  res.json({ success: true, user: req.user });
};
