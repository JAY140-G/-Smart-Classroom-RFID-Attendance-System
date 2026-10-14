'use strict';

const assert = require('node:assert/strict');
const { after, before, test } = require('node:test');
const express = require('express');
const { createServer } = require('node:http');
const liveScanService = require('../services/attendance/liveScanService');
const authService = require('../services/authService');
const attendanceRoutes = require('../routes/attendanceRoutes');

const DEVICE_KEY = 'live-scan-route-test-device-key-32-chars';
const SCAN_ID = '123e4567-e89b-42d3-a456-426614174000';
const originalDeviceKey = process.env.AUTH_DEVICE_KEY;
const originals = {
  createScan: liveScanService.createScan,
  getNextScan: liveScanService.getNextScan,
  getScanStatus: liveScanService.getScanStatus,
  completeScan: liveScanService.completeScan,
  getRecentScans: liveScanService.getRecentScans,
  getCapturedImage: liveScanService.getCapturedImage,
  authenticateToken: authService.authenticateToken
};
const app = express();
let server;
let baseUrl;
let imageStatus;
let authenticatedRole = 'ADMIN';

liveScanService.createScan = async (input) => ({
  scanId: SCAN_ID,
  status: 'WAITING_CAMERA',
  studentName: 'Test student',
  expiresAt: new Date('2026-10-09T13:16:00.000Z'),
  input
});
liveScanService.getNextScan = async () => ({ scanId: SCAN_ID, expiresAt: new Date() });
liveScanService.getScanStatus = async () => ({
  scanId: SCAN_ID,
  status: 'SUCCEEDED',
  result: { eventType: 'ENTRY', currentState: 'IN_CLASS', message: 'ENTRY recorded.' }
});
liveScanService.completeScan = async (scanId, imageBuffer) => ({
  scanId,
  status: imageBuffer.length > 0 ? imageStatus : 'FAILED'
});
liveScanService.getRecentScans = async () => [{
  scanId: SCAN_ID,
  imageAvailable: true
}];
liveScanService.getCapturedImage = async () => ({
  imageData: Buffer.from([0xff, 0xd8, 0xff, 0xd9])
});
authService.authenticateToken = async () => ({
  session: {},
  user: { role: authenticatedRole }
});

before(async () => {
  imageStatus = 'SUCCEEDED';
  process.env.AUTH_DEVICE_KEY = DEVICE_KEY;
  app.use(express.json());
  app.use('/api/attendance', attendanceRoutes);
  app.use((error, req, res, next) => {
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.statusCode >= 500 ? 'Internal server error' : error.message
    });
  });
  server = createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  liveScanService.createScan = originals.createScan;
  liveScanService.getNextScan = originals.getNextScan;
  liveScanService.getScanStatus = originals.getScanStatus;
  liveScanService.completeScan = originals.completeScan;
  liveScanService.getRecentScans = originals.getRecentScans;
  liveScanService.getCapturedImage = originals.getCapturedImage;
  authService.authenticateToken = originals.authenticateToken;
  if (originalDeviceKey === undefined) delete process.env.AUTH_DEVICE_KEY;
  else process.env.AUTH_DEVICE_KEY = originalDeviceKey;
});

function deviceHeaders(extra = {}) {
  return { 'X-Attendance-Device-Key': DEVICE_KEY, ...extra };
}

test('live scan creation rejects requests without the attendance device key', async () => {
  const response = await fetch(`${baseUrl}/api/attendance/live-scans`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Idempotency-Key': SCAN_ID },
    body: JSON.stringify({ rfidUid: 'A1B2C3D4' })
  });
  assert.equal(response.status, 401);
});

test('live scan creation requires a UUID idempotency key and returns only its opaque challenge', async () => {
  const response = await fetch(`${baseUrl}/api/attendance/live-scans`, {
    method: 'POST',
    headers: deviceHeaders({ 'Content-Type': 'application/json', 'Idempotency-Key': 'not-a-uuid' }),
    body: JSON.stringify({ rfidUid: 'A1B2C3D4' })
  });
  assert.equal(response.status, 400);

  const created = await fetch(`${baseUrl}/api/attendance/live-scans`, {
    method: 'POST',
    headers: deviceHeaders({ 'Content-Type': 'application/json', 'Idempotency-Key': SCAN_ID }),
    body: JSON.stringify({ rfidUid: 'A1B2C3D4' })
  });
  assert.equal(created.status, 202);
  const body = await created.json();
  assert.equal(body.data.scanId, SCAN_ID);
  assert.equal(body.data.studentName, 'Test student');
  assert.equal(Object.hasOwn(body.data, 'rfidUid'), false);
});

test('camera queue, raw JPEG upload, and result polling require device auth and use the live protocol', async () => {
  const queue = await fetch(`${baseUrl}/api/attendance/live-scans/next`, { headers: deviceHeaders() });
  assert.equal(queue.status, 200);
  assert.equal((await queue.json()).data.scanId, SCAN_ID);

  const image = await fetch(`${baseUrl}/api/attendance/live-scans/${SCAN_ID}/image`, {
    method: 'POST',
    headers: deviceHeaders({ 'Content-Type': 'image/jpeg' }),
    body: Buffer.from([0xff, 0xd8, 0xff, 0xd9])
  });
  assert.equal(image.status, 200);
  assert.equal((await image.clone().json()).success, true);
  assert.deepEqual((await image.json()).data, { scanId: SCAN_ID, status: 'SUCCEEDED' });

  const result = await fetch(`${baseUrl}/api/attendance/live-scans/${SCAN_ID}`, { headers: deviceHeaders() });
  assert.equal(result.status, 200);
  assert.deepEqual((await result.json()).data, {
    scanId: SCAN_ID,
    status: 'SUCCEEDED',
    result: { eventType: 'ENTRY', currentState: 'IN_CLASS', message: 'ENTRY recorded.' }
  });
});

test('camera image endpoint requires the raw JPEG content type', async () => {
  const response = await fetch(`${baseUrl}/api/attendance/live-scans/${SCAN_ID}/image`, {
    method: 'POST',
    headers: deviceHeaders({ 'Content-Type': 'application/octet-stream' }),
    body: Buffer.from([0xff, 0xd8, 0xff, 0xd9])
  });
  assert.equal(response.status, 400);
});

test('captured-image and recent-scan preview routes reject non-admin requests', async () => {
  const headers = deviceHeaders();
  const recent = await fetch(`${baseUrl}/api/attendance/live-scan-records`, { headers });
  assert.equal(recent.status, 401);

  const preview = await fetch(`${baseUrl}/api/attendance/live-scans/${SCAN_ID}/image`, { headers });
  assert.equal(preview.status, 401);
});

test('administrator preview serves the captured JPEG without caching and does not accept student accounts', async () => {
  authenticatedRole = 'STUDENT';
  const student = await fetch(`${baseUrl}/api/attendance/live-scan-records`, {
    headers: { Authorization: `Bearer ${'a'.repeat(43)}` }
  });
  assert.equal(student.status, 403);

  authenticatedRole = 'ADMIN';
  const recent = await fetch(`${baseUrl}/api/attendance/live-scan-records`, {
    headers: { Authorization: `Bearer ${'a'.repeat(43)}` }
  });
  assert.equal(recent.status, 200);
  assert.equal((await recent.json()).data[0].imageAvailable, true);

  const image = await fetch(`${baseUrl}/api/attendance/live-scans/${SCAN_ID}/image`, {
    headers: { Authorization: `Bearer ${'a'.repeat(43)}` }
  });
  assert.equal(image.status, 200);
  assert.equal(image.headers.get('content-type'), 'image/jpeg');
  assert.equal(image.headers.get('cache-control'), 'private, no-store');
  assert.equal(image.headers.get('x-content-type-options'), 'nosniff');
  assert.deepEqual(Buffer.from(await image.arrayBuffer()), Buffer.from([0xff, 0xd8, 0xff, 0xd9]));
});

test('camera upload does not report success for a failed face-verification result', async () => {
  imageStatus = 'FAILED';
  const response = await fetch(`${baseUrl}/api/attendance/live-scans/${SCAN_ID}/image`, {
    method: 'POST',
    headers: deviceHeaders({ 'Content-Type': 'image/jpeg' }),
    body: Buffer.from([0xff, 0xd8, 0xff, 0xd9])
  });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.success, false);
  assert.equal(body.data.status, 'FAILED');
});
