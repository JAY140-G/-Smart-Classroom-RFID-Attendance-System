'use strict';

const { promisify } = require('node:util');
const { randomBytes, scrypt: scryptCallback, timingSafeEqual, createHash } = require('node:crypto');
const mongoose = require('mongoose');
const User = require('../models/User');
const AuthSession = require('../models/AuthSession');
const AdminBootstrap = require('../models/AdminBootstrap');
const AppError = require('../utils/AppError');

const scrypt = promisify(scryptCallback);
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const SCRYPT_OPTIONS = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const BOOTSTRAP_ID = 'initial-admin-created';

function normalizeEmail(email) {
  return typeof email === 'string' ? email.trim().toLowerCase() : '';
}

function validateCredentials({ name, email, password }, { requireName = false } = {}) {
  if (requireName && (typeof name !== 'string' || !name.trim())) {
    throw new AppError('name is required', 400);
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(email))) {
    throw new AppError('A valid email is required', 400);
  }
  if (typeof password !== 'string' || password.length < 12 || password.length > 256) {
    throw new AppError('Password must be between 12 and 256 characters', 400);
  }
}

async function hashPassword(password) {
  const salt = randomBytes(16);
  const derivedKey = await scrypt(password, salt, 64, SCRYPT_OPTIONS);
  return `scrypt$16384$8$1$${salt.toString('base64url')}$${derivedKey.toString('base64url')}`;
}

async function verifyPassword(password, encoded) {
  if (typeof password !== 'string' || typeof encoded !== 'string') return false;
  const parts = encoded.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt' || parts[1] !== '16384' || parts[2] !== '8' || parts[3] !== '1') return false;

  let salt;
  let expected;
  try {
    salt = Buffer.from(parts[4], 'base64url');
    expected = Buffer.from(parts[5], 'base64url');
  } catch {
    return false;
  }
  if (salt.length !== 16 || expected.length !== 64) return false;
  const actual = await scrypt(password, salt, expected.length, SCRYPT_OPTIONS);
  return timingSafeEqual(actual, expected);
}

function publicUser(user) {
  return { id: String(user._id), name: user.name, email: user.email, role: user.role };
}

function tokenDigest(token) {
  return createHash('sha256').update(token).digest('hex');
}

async function createSession(user) {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await AuthSession.create({ tokenHash: tokenDigest(token), userId: user._id, expiresAt });
  return { token, expiresAt, user: publicUser(user) };
}

async function login({ email, password } = {}) {
  if (typeof password !== 'string' || !normalizeEmail(email)) {
    throw new AppError('Invalid email or password', 401);
  }
  const user = await User.findOne({ email: normalizeEmail(email) }).select('+password');
  if (!user) {
    await scrypt(password, Buffer.alloc(16), 64, SCRYPT_OPTIONS);
    throw new AppError('Invalid email or password', 401);
  }
  if (!(await verifyPassword(password, user.password))) {
    throw new AppError('Invalid email or password', 401);
  }
  if (user.role === 'STUDENT') {
    const Student = require('../models/Student');
    if (!await Student.exists({ userId: user._id, isActive: true })) {
      throw new AppError('Account is inactive', 403);
    }
  } else if (user.role === 'TEACHER') {
    const Teacher = require('../models/Teacher');
    if (!await Teacher.exists({ userId: user._id })) {
      throw new AppError('Teacher account is not linked', 403);
    }
  }
  return createSession(user);
}

async function bootstrapAdmin({ name, email, password, bootstrapKey }) {
  validateCredentials({ name, email, password }, { requireName: true });
  const configuredKey = process.env.AUTH_BOOTSTRAP_KEY;
  if (typeof configuredKey !== 'string' || configuredKey.length < 32) {
    throw new AppError('Admin bootstrap is not configured', 503);
  }
  if (typeof bootstrapKey !== 'string') throw new AppError('Invalid bootstrap key', 403);
  const suppliedDigest = createHash('sha256').update(bootstrapKey).digest();
  const configuredDigest = createHash('sha256').update(configuredKey).digest();
  if (!timingSafeEqual(suppliedDigest, configuredDigest)) throw new AppError('Invalid bootstrap key', 403);

  const hashedPassword = await hashPassword(password);
  const session = await mongoose.startSession();
  let user;
  try {
    await session.withTransaction(async () => {
      const existingBootstrap = await AdminBootstrap.findById(BOOTSTRAP_ID).session(session);
      const existingAdmin = await User.exists({ role: 'ADMIN' }).session(session);
      if (existingBootstrap || existingAdmin) throw new AppError('Initial admin has already been created', 409);

      await AdminBootstrap.create([{ _id: BOOTSTRAP_ID, completedAt: new Date() }], { session });
      const created = await User.create([{
        name: name.trim(),
        email: normalizeEmail(email),
        password: hashedPassword,
        role: 'ADMIN'
      }], { session });
      user = created[0];
    });
  } catch (error) {
    if (error.code === 11000) throw new AppError('Initial admin has already been created or the email is already registered', 409);
    throw error;
  } finally {
    await session.endSession();
  }
  return createSession(user);
}

async function authenticateToken(token) {
  const authSession = await AuthSession.findOne({
    tokenHash: tokenDigest(token),
    expiresAt: { $gt: new Date() }
  }).populate({ path: 'userId', select: 'name email role' });
  if (!authSession?.userId) return null;
  return { session: authSession, user: authSession.userId };
}

async function logout(token) {
  await AuthSession.deleteOne({ tokenHash: tokenDigest(token) });
}

module.exports = {
  SESSION_TTL_MS,
  hashPassword,
  verifyPassword,
  publicUser,
  login,
  bootstrapAdmin,
  authenticateToken,
  logout
};
