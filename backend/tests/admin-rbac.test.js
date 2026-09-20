describe('Admin RBAC middleware', () => {
  let adminRouter;

  beforeEach(() => {
    jest.resetModules();
    // Mock authController.protect to pass through with a user
    jest.mock('../controllers/authController', () => ({
      protect: (req, res, next) => {
        req.user = req._testUser || { role: 'user' };
        next();
      }
    }));
    jest.mock('../controllers/adminController', () => ({
      getCompliance: (req, res) => res.json({ success: true }),
      getAuditLogs: (req, res) => res.json({ success: true }),
      reviewFlaggedTransaction: (req, res) => res.json({ success: true }),
      getKYCQueue: (req, res) => res.json({ success: true }),
      getKYCApplication: (req, res) => res.json({ success: true }),
      reviewKYC: (req, res) => res.json({ success: true }),
      getSystemHealth: (req, res) => res.json({ success: true }),
      systemAction: (req, res) => res.json({ success: true }),
    }));
    adminRouter = require('../routes/admin');
  });

  const express = require('express');

  const makeApp = (userRole) => {
    const app = express();
    app.use((req, res, next) => {
      req._testUser = { role: userRole };
      next();
    });
    app.use('/api/admin', adminRouter);
    return app;
  };

  test('blocks non-admin users with 403', async () => {
    const app = makeApp('user');
    const http = require('http');
    const server = app.listen(0);
    const port = server.address().port;

    const res = await new Promise((resolve) => {
      http.get(`http://localhost:${port}/api/admin/compliance`, (r) => {
        let data = '';
        r.on('data', c => data += c);
        r.on('end', () => resolve({ status: r.statusCode, body: JSON.parse(data) }));
      });
    });

    server.close();
    expect(res.status).toBe(403);
    expect(res.body.message).toBe('Admin access required');
  });

  test('allows admin users', async () => {
    const app = makeApp('admin');
    const http = require('http');
    const server = app.listen(0);
    const port = server.address().port;

    const res = await new Promise((resolve) => {
      http.get(`http://localhost:${port}/api/admin/compliance`, (r) => {
        let data = '';
        r.on('data', c => data += c);
        r.on('end', () => resolve({ status: r.statusCode, body: JSON.parse(data) }));
      });
    });

    server.close();
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});
