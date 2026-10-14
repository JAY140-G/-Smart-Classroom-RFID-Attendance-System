'use strict';

const assert = require('node:assert/strict');
const { afterEach, test } = require('node:test');
const express = require('express');
const mongoose = require('mongoose');
const authService = require('../services/authService');
const User = require('../models/User');
const AuthSession = require('../models/AuthSession');
const authRoutes = require('../routes/authRoutes');

const BOOTSTRAP_KEY = 'password-reset-test-key-that-is-long-enough';
const originalBootstrapKey = process.env.AUTH_BOOTSTRAP_KEY;
const originalNodeEnv = process.env.NODE_ENV;
const originalUserFindOne = User.findOne;
const originalStartSession = mongoose.startSession;
const originalSessionDeleteMany = AuthSession.deleteMany;
const originalSessionCreate = AuthSession.create;

afterEach(() => {
  User.findOne = originalUserFindOne;
  mongoose.startSession = originalStartSession;
  AuthSession.deleteMany = originalSessionDeleteMany;
  AuthSession.create = originalSessionCreate;
  if (originalBootstrapKey === undefined) delete process.env.AUTH_BOOTSTRAP_KEY;
  else process.env.AUTH_BOOTSTRAP_KEY = originalBootstrapKey;
  if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = originalNodeEnv;
});

function mockTransaction() {
  const transactionSession = {
    withTransaction: async (callback) => callback(),
    endSession: async () => {}
  };
  mongoose.startSession = async () => transactionSession;
  return transactionSession;
}

function mockAdminLookup(admin) {
  let filter;
  let querySession;
  User.findOne = (query) => {
    filter = query;
    return {
      session: async (session) => {
        querySession = session;
        return admin;
      }
    };
  };
  return {
    get filter() { return filter; },
    get querySession() { return querySession; }
  };
}

function configureValidSecret() {
  process.env.AUTH_BOOTSTRAP_KEY = BOOTSTRAP_KEY;
}

test('admin password reset updates only the admin password and invalidates its sessions', async () => {
  configureValidSecret();
  const transactionSession = mockTransaction();
  const admin = {
    _id: 'admin-1',
    email: 'admin@example.test',
    role: 'ADMIN',
    password: 'old-password-hash',
    save: async ({ session }) => {
      assert.equal(session, transactionSession);
      admin.savedPassword = admin.password;
    }
  };
  const lookup = mockAdminLookup(admin);
  const operations = [];
  AuthSession.deleteMany = async (filter, options) => {
    operations.push({ type: 'invalidate', filter, options });
  };

  const result = await authService.resetAdminPassword({
    email: ' ADMIN@example.test ',
    password: 'new-admin-password-42',
    bootstrapKey: BOOTSTRAP_KEY
  });

  assert.deepEqual(lookup.filter, { email: 'admin@example.test', role: 'ADMIN' });
  assert.equal(lookup.querySession, transactionSession);
  assert.match(admin.savedPassword, /^scrypt\$16384\$8\$1\$/);
  assert.equal(await authService.verifyPassword('new-admin-password-42', admin.savedPassword), true);
  assert.deepEqual(operations, [{
    type: 'invalidate',
    filter: { userId: admin._id },
    options: { session: transactionSession }
  }]);
  assert.deepEqual(result, { email: 'admin@example.test' });
});

test('admin login works with the password after reset', async () => {
  configureValidSecret();
  mockTransaction();
  const admin = {
    _id: 'admin-1',
    name: 'Administrator',
    email: 'admin@example.test',
    role: 'ADMIN',
    password: await authService.hashPassword('old-admin-password-42'),
    save: async () => {}
  };
  User.findOne = (query) => {
    if (query.role === 'ADMIN') return { session: async () => admin };
    return { select: async () => admin };
  };
  AuthSession.deleteMany = async () => {};
  AuthSession.create = async () => {};

  await authService.resetAdminPassword({
    email: admin.email,
    password: 'new-admin-password-42',
    bootstrapKey: BOOTSTRAP_KEY
  });
  const session = await authService.login({ email: admin.email, password: 'new-admin-password-42' });

  assert.equal(session.user.email, admin.email);
  assert.equal(session.user.role, 'ADMIN');
});

test('admin password reset rejects an invalid secret before database access', async () => {
  configureValidSecret();
  mongoose.startSession = async () => assert.fail('invalid secret must not start a database transaction');

  await assert.rejects(
    authService.resetAdminPassword({
      email: 'admin@example.test',
      password: 'new-admin-password-42',
      bootstrapKey: 'incorrect-secret'
    }),
    { statusCode: 403, message: 'Invalid bootstrap key' }
  );
});

test('admin password reset rejects a missing configured secret', async () => {
  delete process.env.AUTH_BOOTSTRAP_KEY;
  mongoose.startSession = async () => assert.fail('missing secret must not start a database transaction');

  await assert.rejects(
    authService.resetAdminPassword({
      email: 'admin@example.test',
      password: 'new-admin-password-42',
      bootstrapKey: BOOTSTRAP_KEY
    }),
    { statusCode: 503, message: 'Admin password reset is not configured' }
  );
});

test('admin password reset rejects an email without an admin account', async () => {
  configureValidSecret();
  mockTransaction();
  mockAdminLookup(null);
  AuthSession.deleteMany = async () => assert.fail('missing admin must not invalidate sessions');

  await assert.rejects(
    authService.resetAdminPassword({
      email: 'missing@example.test',
      password: 'new-admin-password-42',
      bootstrapKey: BOOTSTRAP_KEY
    }),
    { statusCode: 404, message: 'Admin account not found' }
  );
});

test('admin password reset never targets a non-admin account', async () => {
  configureValidSecret();
  mockTransaction();
  const lookup = mockAdminLookup(null);
  AuthSession.deleteMany = async () => assert.fail('non-admin account must not invalidate sessions');

  await assert.rejects(
    authService.resetAdminPassword({
      email: 'student@example.test',
      password: 'new-admin-password-42',
      bootstrapKey: BOOTSTRAP_KEY
    }),
    { statusCode: 404, message: 'Admin account not found' }
  );
  assert.deepEqual(lookup.filter, { email: 'student@example.test', role: 'ADMIN' });
});

test('admin password reset rejects an invalid email', async () => {
  mongoose.startSession = async () => assert.fail('invalid email must not start a database transaction');

  await assert.rejects(
    authService.resetAdminPassword({
      email: 'not-an-email',
      password: 'new-admin-password-42',
      bootstrapKey: BOOTSTRAP_KEY
    }),
    { statusCode: 400, message: 'A valid email is required' }
  );
});

test('admin password reset rejects a password shorter than 12 characters', async () => {
  mongoose.startSession = async () => assert.fail('invalid password must not start a database transaction');

  await assert.rejects(
    authService.resetAdminPassword({
      email: 'admin@example.test',
      password: 'short',
      bootstrapKey: BOOTSTRAP_KEY
    }),
    { statusCode: 400, message: 'Password must be between 12 and 256 characters' }
  );
});

test('admin password reset rejects a password longer than 256 characters', async () => {
  mongoose.startSession = async () => assert.fail('invalid password must not start a database transaction');

  await assert.rejects(
    authService.resetAdminPassword({
      email: 'admin@example.test',
      password: 'x'.repeat(257),
      bootstrapKey: BOOTSTRAP_KEY
    }),
    { statusCode: 400, message: 'Password must be between 12 and 256 characters' }
  );
});

test('password reset route passes the secret header and does not require an existing admin session', async (t) => {
  process.env.NODE_ENV = 'test';
  const originalReset = authService.resetAdminPassword;
  let received;
  authService.resetAdminPassword = async (input) => {
    received = input;
    return { email: input.email };
  };
  t.after(() => { authService.resetAdminPassword = originalReset; });

  const app = express();
  app.use(express.json());
  app.use('/api/auth', authRoutes);
  app.use((error, req, res, next) => res.status(error.statusCode || 500).json({ success: false, message: error.message }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  t.after(() => new Promise((resolve) => server.close(resolve)));

  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/auth/admin/password-reset`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Bootstrap-Key': BOOTSTRAP_KEY },
    body: JSON.stringify({ email: 'admin@example.test', password: 'new-admin-password-42' })
  });

  assert.equal(response.status, 200);
  assert.deepEqual(received, {
    email: 'admin@example.test',
    password: 'new-admin-password-42',
    bootstrapKey: BOOTSTRAP_KEY
  });
  assert.deepEqual(await response.json(), {
    success: true,
    message: 'Admin password reset',
    data: { email: 'admin@example.test' }
  });
});

test('password reset route is unavailable in production', async (t) => {
  process.env.NODE_ENV = 'production';
  const originalReset = authService.resetAdminPassword;
  authService.resetAdminPassword = async () => assert.fail('production must not invoke password reset');
  t.after(() => { authService.resetAdminPassword = originalReset; });

  const app = express();
  app.use(express.json());
  app.use('/api/auth', authRoutes);
  app.use((error, req, res, next) => res.status(error.statusCode || 500).json({ success: false, message: error.message }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  t.after(() => new Promise((resolve) => server.close(resolve)));

  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/auth/admin/password-reset`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@example.test', password: 'new-admin-password-42' })
  });

  assert.equal(response.status, 404);
});
