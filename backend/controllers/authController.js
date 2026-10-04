'use strict';

const authService = require('../services/authService');

async function login(req, res) {
  const data = await authService.login(req.body);
  res.status(200).json({ success: true, data });
}

async function bootstrap(req, res) {
  const data = await authService.bootstrapAdmin({ ...req.body, bootstrapKey: req.get('X-Bootstrap-Key') });
  res.status(201).json({ success: true, message: 'Initial admin created', data });
}

async function current(req, res) {
  res.status(200).json({ success: true, data: { user: authService.publicUser(req.auth.user), expiresAt: req.auth.session.expiresAt } });
}

async function logout(req, res) {
  await authService.logout(req.auth.token);
  res.status(200).json({ success: true, message: 'Logged out' });
}

module.exports = { login, bootstrap, current, logout };
