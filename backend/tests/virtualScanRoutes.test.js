'use strict';

const assert = require('node:assert/strict');
const { after, before, test } = require('node:test');
const express = require('express');
const { createServer } = require('node:http');
const authService = require('../services/authService');
const liveScanService = require('../services/attendance/liveScanService');
const attendanceRoutes = require('../routes/attendanceRoutes');

const TOKEN = 'a'.repeat(43);
const SCAN_ID = '123e4567-e89b-42d3-a456-426614174000';
const VIRTUAL_UID = 'V-64B000000000000000000001';
const originals = {
  authenticateToken: authService.authenticateToken,
  getVirtualStudents: liveScanService.getVirtualStudents,
  createVirtualScan: liveScanService.createVirtualScan,
  getRecentVirtualScans: liveScanService.getRecentVirtualScans,
  getVirtualScanStatus: liveScanService.getVirtualScanStatus
};

let app;
let server;
let baseUrl;
let userRole = 'ADMIN';
const calls = [];

before(async () => {
  authService.authenticateToken = async () => ({
    session: { expiresAt: new Date(Date.now() + 60_000) },
    user: { _id: 'admin-1', role: userRole }
  });
  liveScanService.getVirtualStudents = async () => [{ studentId: 'student-1', virtualRfidUid: VIRTUAL_UID }];
  liveScanService.createVirtualScan = async (input) => {
    calls.push(input);
    return {
      scanId: SCAN_ID,
      status: 'WAITING_CAMERA',
      virtualRfidUid: input.virtualRfidUid,
      expiresAt: new Date(Date.now() + 30_000)
    };
  };
  liveScanService.getRecentVirtualScans = async () => [];
  liveScanService.getVirtualScanStatus = async (scanId) => ({
    protocolVersion: 1,
    scanId,
    status: 'WAITING_CAMERA',
    source: 'VIRTUAL',
    virtualRfidUid: VIRTUAL_UID
  });

  app = express();
  app.use(express.json());
  app.use('/api/attendance', attendanceRoutes);
  app.use((error, req, res, next) => {
    res.status(error.statusCode || 500).json({ success: false, message: error.message });
  });
  server = createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}/api/attendance/virtual-scans`;
});

after(async () => {
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  authService.authenticateToken = originals.authenticateToken;
  liveScanService.getVirtualStudents = originals.getVirtualStudents;
  liveScanService.createVirtualScan = originals.createVirtualScan;
  liveScanService.getRecentVirtualScans = originals.getRecentVirtualScans;
  liveScanService.getVirtualScanStatus = originals.getVirtualScanStatus;
});

function authHeaders(extra = {}) {
  return { Authorization: `Bearer ${TOKEN}`, ...extra };
}

test('virtual roster requires an authenticated administrator', async () => {
  const anonymous = await fetch(`${baseUrl}/students`);
  assert.equal(anonymous.status, 401);

  userRole = 'TEACHER';
  const forbidden = await fetch(`${baseUrl}/students`, { headers: authHeaders() });
  assert.equal(forbidden.status, 403);

  userRole = 'ADMIN';
  const allowed = await fetch(`${baseUrl}/students`, { headers: authHeaders() });
  assert.equal(allowed.status, 200);
  assert.deepEqual((await allowed.json()).data, [{ studentId: 'student-1', virtualRfidUid: VIRTUAL_UID }]);
});

test('virtual challenge uses user authentication and a UUID idempotency key', async () => {
  const invalid = await fetch(baseUrl, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json', 'Idempotency-Key': 'invalid' }),
    body: JSON.stringify({ virtualRfidUid: VIRTUAL_UID })
  });
  assert.equal(invalid.status, 400);

  const response = await fetch(baseUrl, {
    method: 'POST',
    headers: authHeaders({
      'Content-Type': 'application/json',
      'Idempotency-Key': '123e4567-e89b-42d3-a456-426614174001'
    }),
    body: JSON.stringify({ virtualRfidUid: VIRTUAL_UID })
  });
  assert.equal(response.status, 202);
  const body = await response.json();
  assert.equal(body.data.protocolVersion, 1);
  assert.equal(body.data.source, 'VIRTUAL');
  assert.equal(body.data.scanId, SCAN_ID);
  assert.equal(calls[0].virtualRfidUid, VIRTUAL_UID);
  assert.equal(calls[0].idempotencyKey, '123e4567-e89b-42d3-a456-426614174001');
});

test('virtual status is user-authenticated and names only the virtual scan state', async () => {
  const response = await fetch(`${baseUrl}/${SCAN_ID}`, { headers: authHeaders() });
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).data, {
    protocolVersion: 1,
    scanId: SCAN_ID,
    status: 'WAITING_CAMERA',
    source: 'VIRTUAL',
    virtualRfidUid: VIRTUAL_UID
  });
});
