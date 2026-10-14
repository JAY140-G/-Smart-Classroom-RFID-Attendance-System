'use strict';

const assert = require('node:assert/strict');
const { after, before, test } = require('node:test');
const { createServer } = require('node:http');
const app = require('../server');

const originalDeviceKey = process.env.AUTH_DEVICE_KEY;
const originalConsoleError = console.error;
const loggedErrors = [];
let server;
let baseUrl;

before(async () => {
  delete process.env.AUTH_DEVICE_KEY;
  console.error = (...parts) => loggedErrors.push(parts.join(' '));
  server = createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  console.error = originalConsoleError;
  if (originalDeviceKey === undefined) delete process.env.AUTH_DEVICE_KEY;
  else process.env.AUTH_DEVICE_KEY = originalDeviceKey;
});

test('live scan next reports missing device-key configuration and logs a safe server trace', async () => {
  const response = await fetch(`${baseUrl}/api/attendance/live-scans/next`);
  const body = await response.json();

  assert.equal(response.status, 503);
  assert.deepEqual(body, {
    success: false,
    message: 'Attendance device authentication is not configured'
  });
  assert.equal(loggedErrors.some((entry) => entry.includes('AppError status=503')), true, loggedErrors.join('\n'));
  assert.equal(loggedErrors.some((entry) => entry.includes('requireDeviceKey')), true, loggedErrors.join('\n'));
  assert.equal(loggedErrors.some((entry) => entry.includes('AUTH_DEVICE_KEY')), false);
});
