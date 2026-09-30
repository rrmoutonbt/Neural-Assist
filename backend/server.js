require('dotenv').config();
let Sentry;
try { Sentry = require('@sentry/node'); } catch { Sentry = null; }
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const logger = require('./services/logger');

// Sentry error tracking — set SENTRY_DSN in .env to enable
if (Sentry && process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV || 'development',
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.2 : 1.0,
  });
}
const authRoutes = require('./routes/auth');
const bankingRoutes = require('./routes/banking');
const kpisRoutes = require('./routes/kpis');
const cryptoRoutes = require('./routes/crypto');
const tradingRoutes = require('./routes/trading');
const walletRoutes = require('./routes/wallet');
const unifiedRoutes = require('./routes/unified');
const adminRoutes = require('./routes/admin');
const reportsRoutes = require('./routes/reports');

const app = express();

// Trust proxy - use 1 for single nginx proxy
app.set('trust proxy', 1);

// Sentry request handler (must be first middleware)
if (Sentry && process.env.SENTRY_DSN) {
  app.use(Sentry.Handlers.requestHandler());
}

// Security middleware
app.use(helmet());
const corsOrigins = (process.env.CORS_ORIGINS || 'https://banc-of-el-trust-international.org')
  .split(',')
  .map(s => s.trim());
app.use(cors({
  origin: corsOrigins,
  credentials: true
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { success: false, message: 'Too many login attempts, please try again later' }
});

const authSensitiveLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { success: false, message: 'Too many attempts, please try again later' }
});

const financialLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: { success: false, message: 'Too many financial operations, please try again later' }
});

const reportLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  message: { success: false, message: 'Too many report requests, please try again later' }
});

app.use('/api/auth/login', loginLimiter);
app.use('/api/auth/register', authSensitiveLimiter);
app.use('/api/auth/forgot-password', authSensitiveLimiter);
app.use('/api/auth/reset-password', authSensitiveLimiter);
app.use('/api/banking/transfers', financialLimiter);
app.use('/api/banking/reset', authSensitiveLimiter);
app.use('/api/wallet/send', financialLimiter);
app.use('/api/trading/orders', financialLimiter);
app.use('/api/reports', reportLimiter);
app.use('/api/admin', financialLimiter);
app.use(limiter);

// Body parser with size limits
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/banking', bankingRoutes);
app.use('/api/kpis', kpisRoutes);
app.use('/api/crypto', cryptoRoutes);
app.use('/api/trading', tradingRoutes);
app.use('/api/wallet', walletRoutes);
app.use('/api/unified', unifiedRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/reports', reportsRoutes);

// Proxy to Python Trading Service (GXT Trading Engine)
const TRADING_SERVICE_URL = process.env.TRADING_SERVICE_URL || 'http://127.0.0.1:5100';
app.use('/api/trading-engine', async (req, res) => {
  try {
    const http = require('http');
    const targetUrl = `${TRADING_SERVICE_URL}/api/trading${req.url}`;
    const url = new URL(targetUrl);

    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: req.method,
      headers: { 'Content-Type': 'application/json' },
      timeout: 30000,
    };

    const proxyReq = http.request(options, (proxyRes) => {
      let data = '';
      proxyRes.on('data', chunk => data += chunk);
      proxyRes.on('end', () => {
        res.status(proxyRes.statusCode);
        try { res.json(JSON.parse(data)); } catch { res.send(data); }
      });
    });

    proxyReq.on('error', () => {
      res.status(503).json({ error: 'Trading service unavailable', offline: true });
    });

    proxyReq.on('timeout', () => {
      proxyReq.destroy();
      res.status(504).json({ error: 'Trading service timeout' });
    });

    if (req.body && Object.keys(req.body).length > 0) {
      proxyReq.write(JSON.stringify(req.body));
    }

    proxyReq.end();
  } catch (err) {
    res.status(503).json({ error: 'Trading service unavailable' });
  }
});

// Sentry error handler (must be before custom error handler)
if (Sentry && process.env.SENTRY_DSN) {
  app.use(Sentry.Handlers.errorHandler());
}

// Error handler
app.use((err, req, res, next) => {
  logger.error('Unhandled error', {
    method: req.method,
    path: req.path,
    message: err.message,
    ...(process.env.NODE_ENV !== 'production' && { stack: err.stack })
  });
  res.status(500).json({ success: false, message: 'Internal server error' });
});

// Unhandled rejection / uncaught exception handlers
process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled Rejection', { message: reason?.message || String(reason) });
  process.exit(1);
});
process.on('uncaughtException', (err) => {
  logger.error('Uncaught Exception', { message: err.message });
  process.exit(1);
});

// Validate required secrets at startup
const requiredEnv = ['JWT_SECRET', 'MONGODB_URI'];
for (const key of requiredEnv) {
  if (!process.env[key] || process.env[key] === 'changeme' || process.env[key] === 'CHANGE_ME_IN_PRODUCTION') {
    logger.error(`FATAL: ${key} is not set or uses a placeholder value. Refusing to start.`);
    process.exit(1);
  }
}

// MongoDB connection — block server start on failure
const PORT = process.env.PORT || 5000;
mongoose.connect(process.env.MONGODB_URI)
  .then(() => {
    logger.info('MongoDB connected');
    app.listen(PORT, '0.0.0.0', () => {
      logger.info(`API running on port ${PORT}`);
    });
  })
  .catch(err => {
    logger.error('MongoDB connection failed — exiting', { message: err.message });
    process.exit(1);
  });
