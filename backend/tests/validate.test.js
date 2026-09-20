const { validateLogin, validateRegister, validateForgotPassword, validateResetPassword, validatePagination, validateTransactionFilters, validateAuditFilters } = require('../middleware/validate');

const mockRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

const mockNext = jest.fn();

beforeEach(() => {
  mockNext.mockClear();
});

describe('validateLogin', () => {
  test('rejects missing email', () => {
    const req = { body: { password: 'test' } };
    const res = mockRes();
    validateLogin(req, res, mockNext);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockNext).not.toHaveBeenCalled();
  });

  test('rejects invalid email', () => {
    const req = { body: { email: 'notanemail', password: 'test' } };
    const res = mockRes();
    validateLogin(req, res, mockNext);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('rejects missing password', () => {
    const req = { body: { email: 'user@example.com' } };
    const res = mockRes();
    validateLogin(req, res, mockNext);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('passes valid login', () => {
    const req = { body: { email: 'user@example.com', password: 'Test123!' } };
    const res = mockRes();
    validateLogin(req, res, mockNext);
    expect(mockNext).toHaveBeenCalled();
  });
});

describe('validateRegister', () => {
  test('rejects short password', () => {
    const req = { body: { email: 'a@b.com', password: '12', username: 'user1' } };
    const res = mockRes();
    validateRegister(req, res, mockNext);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('rejects invalid username', () => {
    const req = { body: { email: 'a@b.com', password: '123456', username: '<script>' } };
    const res = mockRes();
    validateRegister(req, res, mockNext);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('passes valid registration', () => {
    const req = { body: { email: 'a@b.com', password: '123456', username: 'user_1' } };
    const res = mockRes();
    validateRegister(req, res, mockNext);
    expect(mockNext).toHaveBeenCalled();
  });
});

describe('validateForgotPassword', () => {
  test('rejects missing email', () => {
    const req = { body: {} };
    const res = mockRes();
    validateForgotPassword(req, res, mockNext);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('passes valid email', () => {
    const req = { body: { email: 'test@example.com' } };
    const res = mockRes();
    validateForgotPassword(req, res, mockNext);
    expect(mockNext).toHaveBeenCalled();
  });
});

describe('validateResetPassword', () => {
  test('rejects short password', () => {
    const req = { body: { password: 'ab' } };
    const res = mockRes();
    validateResetPassword(req, res, mockNext);
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe('validatePagination', () => {
  test('caps limit at 100', () => {
    const req = { query: { page: '1', limit: '500' } };
    const res = mockRes();
    validatePagination(req, res, mockNext);
    expect(req.query.limit).toBe(100);
    expect(mockNext).toHaveBeenCalled();
  });

  test('defaults page and limit', () => {
    const req = { query: {} };
    const res = mockRes();
    validatePagination(req, res, mockNext);
    expect(req.query.page).toBe(1);
    expect(req.query.limit).toBe(50);
  });
});

describe('validateTransactionFilters', () => {
  test('rejects invalid type', () => {
    const req = { query: { type: 'hackertype' } };
    const res = mockRes();
    validateTransactionFilters(req, res, mockNext);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('passes valid type', () => {
    const req = { query: { type: 'deposit' } };
    const res = mockRes();
    validateTransactionFilters(req, res, mockNext);
    expect(mockNext).toHaveBeenCalled();
  });
});

describe('validateAuditFilters', () => {
  test('rejects invalid level', () => {
    const req = { query: { level: 'debug' } };
    const res = mockRes();
    validateAuditFilters(req, res, mockNext);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('passes valid filters', () => {
    const req = { query: { level: 'warning', entityType: 'compliance' } };
    const res = mockRes();
    validateAuditFilters(req, res, mockNext);
    expect(mockNext).toHaveBeenCalled();
  });
});
