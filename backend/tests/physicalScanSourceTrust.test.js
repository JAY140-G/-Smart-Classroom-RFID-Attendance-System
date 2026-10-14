'use strict';

const assert = require('node:assert/strict');
const { after, before, test } = require('node:test');
const express = require('express');
const { createServer } = require('node:http');
const attendanceService = require('../services/attendance/attendanceService');

const DEVICE_KEY = 'physical-source-trust-test-device-key-32';
const IDEMPOTENCY_KEY = '123e4567-e89b-42d3-a456-426614174000';
const originals = {
  processScan: attendanceService.processScan,
  deviceKey: process.env.AUTH_DEVICE_KEY
};
let app;
let server;
let baseUrl;
let capturedScan;

attendanceService.processScan = async (input) => {
  capturedScan = input;
  return {
    event: { type: 'ENTRY' },
    student: { _id: 'student-1' },
    session: { _id: 'session-1' },
    record: { currentState: 'IN_CLASS' },
    attendance: {}
  };
};
const attendanceRoutes = require('../routes/attendanceRoutes');

before(async () => {
  process.env.AUTH_DEVICE_KEY = DEVICE_KEY;
  app = express();
  app.use(express.json());
  app.use('/api/attendance', attendanceRoutes);
  app.use((error, req, res, next) => {
    res.status(error.statusCode || 500).json({ success: false, message: error.message });
  });
  server = createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}/api/attendance/scan`;
});

after(async () => {
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  attendanceService.processScan = originals.processScan;
  if (originals.deviceKey === undefined) delete process.env.AUTH_DEVICE_KEY;
  else process.env.AUTH_DEVICE_KEY = originals.deviceKey;
});

test('physical scan route discards client-supplied virtual source and face-verification assertions', async () => {
  const form = new FormData();
  form.set('rfidUid', 'A1B2C3D4');
  form.set('sessionId', '64b000000000000000000002');
  form.set('source', 'VIRTUAL');
  form.set('studentId', '64b000000000000000000001');
  form.set('virtualRfidUid', 'V-64B000000000000000000001');
  form.set('faceVerified', 'true');
  form.set('image', new Blob([Buffer.from([0xff, 0xd8, 0xff, 0xd9])], { type: 'image/jpeg' }), 'camera.jpg');

  const response = await fetch(baseUrl, {
    method: 'POST',
    headers: {
      'X-Attendance-Device-Key': DEVICE_KEY,
      'Idempotency-Key': IDEMPOTENCY_KEY
    },
    body: form
  });

  assert.equal(response.status, 200);
  assert.deepEqual(Object.keys(capturedScan).sort(), [
    'idempotencyKey',
    'imageBuffer',
    'rfidUid',
    'sessionId'
  ]);
  assert.equal(capturedScan.rfidUid, 'A1B2C3D4');
  assert.equal(capturedScan.imageBuffer.length, 4);
});
