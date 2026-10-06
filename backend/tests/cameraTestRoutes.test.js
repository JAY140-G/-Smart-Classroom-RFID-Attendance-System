'use strict';

const assert = require('node:assert/strict');
const { after, before, test } = require('node:test');
const express = require('express');
const { createServer } = require('node:http');
const cameraTestRoutes = require('../routes/cameraTestRoutes');

const TEST_KEY = 'camera-test-only-key-not-for-attendance';
const originalCameraTestKey = process.env.CAMERA_TEST_KEY;
const app = express();
let server;
let baseUrl;

before(async () => {
  process.env.CAMERA_TEST_KEY = TEST_KEY;
  app.use('/api/camera-test', cameraTestRoutes);
  app.use((error, req, res, next) => {
    const statusCode = error.statusCode || 500;
    res.status(statusCode).json({
      success: false,
      message: statusCode >= 500 ? 'Internal server error' : error.message
    });
  });
  server = createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  if (originalCameraTestKey === undefined) delete process.env.CAMERA_TEST_KEY;
  else process.env.CAMERA_TEST_KEY = originalCameraTestKey;
});

function upload(headers = {}, body = Buffer.alloc(0), contentType = 'image/jpeg') {
  return fetch(`${baseUrl}/api/camera-test/image`, {
    method: 'POST',
    headers: { 'Content-Type': contentType, ...headers },
    body
  });
}

test('camera upload rejects requests without the dedicated test key', async () => {
  const response = await upload({}, Buffer.from([0xff, 0xd8, 0xff, 0xd9]));
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), {
    success: false,
    message: 'Camera test authentication required'
  });
});

test('camera upload fails closed when no test key is configured', async () => {
  delete process.env.CAMERA_TEST_KEY;
  try {
    const response = await upload(
      { 'X-Camera-Test-Key': TEST_KEY },
      Buffer.from([0xff, 0xd8, 0xff, 0xd9])
    );
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), {
      success: false,
      message: 'Internal server error'
    });
  } finally {
    process.env.CAMERA_TEST_KEY = TEST_KEY;
  }
});

test('camera upload requires a JPEG body', async () => {
  const response = await upload({ 'X-Camera-Test-Key': TEST_KEY });
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), {
    success: false,
    message: 'Request body must contain a complete JPEG image'
  });
});

test('camera upload rejects content that is not a complete JPEG', async () => {
  const response = await upload(
    { 'X-Camera-Test-Key': TEST_KEY },
    Buffer.from('not a jpeg')
  );
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), {
    success: false,
    message: 'Request body must contain a complete JPEG image'
  });
});

test('camera upload rejects non-JPEG content types', async () => {
  const response = await upload(
    { 'X-Camera-Test-Key': TEST_KEY },
    Buffer.from('not a jpeg'),
    'application/octet-stream'
  );
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), {
    success: false,
    message: 'Content-Type must be image/jpeg'
  });
});

test('camera upload receives JPEG bytes without creating attendance data', async () => {
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x02, 0xff, 0xd9]);
  const response = await upload(
    { 'X-Camera-Test-Key': TEST_KEY },
    jpeg
  );
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    success: true,
    message: 'Camera test image received',
    data: {
      received: true,
      contentType: 'image/jpeg',
      sizeBytes: jpeg.length
    }
  });
});

test('camera upload rejects payloads larger than the 5 MB route limit', async () => {
  const oversized = Buffer.alloc(5 * 1024 * 1024 + 1, 0);
  const response = await upload(
    { 'X-Camera-Test-Key': TEST_KEY },
    oversized
  );
  assert.equal(response.status, 413);
  assert.deepEqual(await response.json(), {
    success: false,
    message: 'Image exceeds the 5 MB camera test limit'
  });
});
