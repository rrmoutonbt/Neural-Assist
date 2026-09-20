require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const logger = require('./services/logger');
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

// Security middleware
app.use(helmet());
const corsOrigins = (process.env.CORS_ORIGINS || 'https://banc-of-el-trust-international.org')
  .split(',')
  .map(s => s.trim());
app.use(cors({
  origin: corsOrigins,
  credentials: true
}));

// Rate limiting with trust proxy validation disabled
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  validate: { trustProxy: false }
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  validate: { trustProxy: false }
});

const authSensitiveLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { success: false, message: 'Too many attempts, please try again later' },
  validate: { trustProxy: false }
});

app.use('/api/auth/login', loginLimiter);
app.use('/api/auth/register', authSensitiveLimiter);
app.use('/api/auth/forgot-password', authSensitiveLimiter);
app.use('/api/auth/reset-password', authSensitiveLimiter);
app.use(limiter);

// Body parser
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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

// MongoDB connection
mongoose.connect(process.env.MONGODB_URI)
  .then(() => logger.info('MongoDB connected'))
  .catch(err => logger.error('MongoDB connection error', { message: err.message }));

const PORT = process.env.PORT || 5000;
app.listen(PORT, '0.0.0.0', () => {
  logger.info(`API running on port ${PORT}`);
});
