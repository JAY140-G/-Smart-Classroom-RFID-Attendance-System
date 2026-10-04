'use strict';

const assert = require('node:assert/strict');
const { afterEach, test } = require('node:test');
const express = require('express');
const authService = require('../services/authService');
const authentication = require('../middleware/authentication');
const User = require('../models/User');
const AuthSession = require('../models/AuthSession');
const createEntityRouter = require('../routes/entityRoutes');

const originalAuthenticateToken = authService.authenticateToken;
const originalDeviceKey = process.env.AUTH_DEVICE_KEY;
const originalUserFindOne = User.findOne;
const originalSessionCreate = AuthSession.create;

afterEach(() => {
  authService.authenticateToken = originalAuthenticateToken;
  User.findOne = originalUserFindOne;
  AuthSession.create = originalSessionCreate;
  if (originalDeviceKey === undefined) delete process.env.AUTH_DEVICE_KEY;
  else process.env.AUTH_DEVICE_KEY = originalDeviceKey;
});

test('passwords are stored as salted scrypt hashes and verified without plaintext storage', async () => {
  const password = 'correct-horse-battery-7';
  const encoded = await authService.hashPassword(password);

  assert.match(encoded, /^scrypt\$16384\$8\$1\$/);
  assert.notEqual(encoded, password);
  assert.equal(await authService.verifyPassword(password, encoded), true);
  assert.equal(await authService.verifyPassword('wrong-password', encoded), false);
  assert.equal(await authService.verifyPassword(password, 'AUTH_NOT_IMPLEMENTED'), false);
});

test('login creates a time-limited session and returns only the public user fields', async () => {
  const password = 'correct-horse-battery-7';
  const user = {
    _id: 'admin-1',
    name: 'Administrator',
    email: 'admin@example.test',
    role: 'ADMIN',
    password: await authService.hashPassword(password)
  };
  let savedSession;
  User.findOne = () => ({ select: async () => user });
  AuthSession.create = async (session) => { savedSession = session; };

  const result = await authService.login({ email: ' ADMIN@example.test ', password });

  assert.equal(result.user.id, 'admin-1');
  assert.equal(result.user.role, 'ADMIN');
  assert.equal(Object.hasOwn(result.user, 'password'), false);
  assert.equal(result.token.length, 43);
  assert.notEqual(savedSession.tokenHash, result.token);
  assert.ok(savedSession.expiresAt > new Date());
  assert.ok(savedSession.expiresAt.getTime() - Date.now() <= authService.SESSION_TTL_MS);
});

test('login rejects an incorrect password without creating a session', async () => {
  const user = {
    _id: 'admin-1',
    name: 'Administrator',
    email: 'admin@example.test',
    role: 'ADMIN',
    password: await authService.hashPassword('correct-horse-battery-7')
  };
  User.findOne = () => ({ select: async () => user });
  AuthSession.create = async () => assert.fail('invalid credentials must not create a session');

  await assert.rejects(
    authService.login({ email: 'admin@example.test', password: 'incorrect-password' }),
    { statusCode: 401, message: 'Invalid email or password' }
  );
});

test('authentication rejects a missing bearer token', async () => {
  const errors = [];
  await authentication.requireAuth({ get: () => undefined }, {}, (error) => errors.push(error));

  assert.equal(errors.length, 1);
  assert.equal(errors[0].statusCode, 401);
});

test('authentication attaches the resolved session and user for a valid token', async (t) => {
  authService.authenticateToken = async (token) => ({
    session: { expiresAt: new Date('2026-10-05T00:00:00.000Z') },
    user: { _id: 'user-1', role: 'TEACHER', tokenUsed: token }
  });
  const req = { get: () => 'Bearer A'.replace('A', 'a'.repeat(43)) };
  let continued = false;

  await authentication.requireAuth(req, {}, (error) => {
    assert.equal(error, undefined);
    continued = true;
  });

  assert.equal(continued, true);
  assert.equal(req.auth.user.role, 'TEACHER');
  assert.equal(req.auth.token.length, 43);
});

test('role guard allows only configured roles', () => {
  const allow = authentication.allowRoles('ADMIN');
  const deny = authentication.allowRoles('ADMIN');
  let allowed = false;
  const errors = [];

  allow({ auth: { user: { role: 'ADMIN' } } }, {}, (error) => {
    assert.equal(error, undefined);
    allowed = true;
  });
  deny({ auth: { user: { role: 'STUDENT' } } }, {}, (error) => errors.push(error));

  assert.equal(allowed, true);
  assert.equal(errors[0].statusCode, 403);
});

test('setup CRUD routes reject anonymous and non-admin users before database access', async (t) => {
  authService.authenticateToken = async () => ({
    session: { expiresAt: new Date(Date.now() + 60_000) },
    user: { _id: 'teacher-1', role: 'TEACHER' }
  });
  const app = express();
  app.use('/api/students', createEntityRouter('students'));
  app.use((error, req, res, next) => res.status(error.statusCode || 500).json({ message: error.message }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const address = server.address();
  const base = `http://127.0.0.1:${address.port}/api/students`;

  const anonymous = await fetch(base);
  assert.equal(anonymous.status, 401);
  const nonAdmin = await fetch(base, { headers: { Authorization: `Bearer ${'a'.repeat(43)}` } });
  assert.equal(nonAdmin.status, 403);
});

test('attendance device access fails closed when no device key is configured', () => {
  delete process.env.AUTH_DEVICE_KEY;
  const errors = [];

  authentication.requireDeviceKey({ get: () => 'not-a-configured-key' }, {}, (error) => errors.push(error));

  assert.equal(errors[0].statusCode, 503);
});
