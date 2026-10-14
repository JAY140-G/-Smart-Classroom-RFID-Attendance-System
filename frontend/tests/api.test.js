import assert from 'node:assert/strict';
import { test } from 'node:test';
import { clearAccessToken, setAccessToken } from '../src/auth.js';
import api from '../src/services/api.js';

const entityApis = [
  ['student', api.updateStudent, api.deleteStudent, '/api/students'],
  ['teacher', api.updateTeacher, api.deleteTeacher, '/api/teachers'],
  ['subject', api.updateSubject, api.deleteSubject, '/api/subjects'],
  ['class', api.updateClass, api.deleteClass, '/api/classes']
];

for (const [entity, update, remove, path] of entityApis) {
  test(`${entity} setup API sends updates and deletes to its CRUD routes`, async (t) => {
    const requests = [];
    t.mock.method(globalThis, 'fetch', async (url, options) => {
      requests.push({ url, options });
      return { ok: true, json: async () => ({ success: true }) };
    });

    const id = '64b000000000000000000001';
    const changes = { name: 'Updated record' };
    await update(id, changes);
    await remove(id);

    assert.equal(requests.length, 2);
    assert.equal(requests[0].url, `http://localhost:5000${path}/${id}`);
    assert.equal(requests[0].options.method, 'PUT');
    assert.deepEqual(JSON.parse(requests[0].options.body), changes);
    assert.equal(requests[1].url, `http://localhost:5000${path}/${id}`);
    assert.equal(requests[1].options.method, 'DELETE');
  });
}

test('authenticated API requests include the session bearer token', async (t) => {
  const previousWindow = globalThis.window;
  const values = new Map();
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      sessionStorage: {
        getItem: (key) => values.get(key) || null,
        setItem: (key, value) => values.set(key, value),
        removeItem: (key) => values.delete(key)
      },
      dispatchEvent: () => true
    }
  });
  t.after(() => {
    if (previousWindow === undefined) delete globalThis.window;
    else Object.defineProperty(globalThis, 'window', { configurable: true, value: previousWindow });
  });
  t.mock.method(globalThis, 'fetch', async () => ({ ok: true, json: async () => ({ success: true, data: { user: { role: 'ADMIN' } } }) }));
  setAccessToken('test-session-token');

  await api.currentUser();

  assert.equal(fetch.mock.calls[0].arguments[1].headers.Authorization, 'Bearer test-session-token');
});
test('virtual RFID API reads the roster and sends an idempotent scan request', async (t) => {
  const requests = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    requests.push({ url, options });
    return { ok: true, json: async () => ({ success: true, data: [] }) };
  });

  await api.virtualScanStudents();
  await api.createVirtualScan(
    'V-64B000000000000000000001',
    '123e4567-e89b-42d3-a456-426614174000'
  );
  await api.virtualScanStatus('123e4567-e89b-42d3-a456-426614174000');
  await api.recentVirtualScans();

  assert.equal(requests[0].url, 'http://localhost:5000/api/attendance/virtual-scans/students');
  assert.equal(requests[1].url, 'http://localhost:5000/api/attendance/virtual-scans');
  assert.equal(requests[1].options.method, 'POST');
  assert.equal(requests[1].options.headers['Idempotency-Key'], '123e4567-e89b-42d3-a456-426614174000');
  assert.deepEqual(JSON.parse(requests[1].options.body), {
    virtualRfidUid: 'V-64B000000000000000000001'
  });
  assert.equal(requests[2].url, 'http://localhost:5000/api/attendance/virtual-scans/123e4567-e89b-42d3-a456-426614174000');
  assert.equal(requests[3].url, 'http://localhost:5000/api/attendance/virtual-scans/recent');
});

test('live scan history and captured-image preview use the authenticated admin API', async (t) => {
  const previousWindow = globalThis.window;
  const values = new Map();
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      sessionStorage: {
        getItem: (key) => values.get(key) || null,
        setItem: (key, value) => values.set(key, value),
        removeItem: (key) => values.delete(key)
      },
      dispatchEvent: () => true
    }
  });
  setAccessToken('preview-session-token');
  t.after(() => {
    clearAccessToken();
    if (previousWindow === undefined) delete globalThis.window;
    else Object.defineProperty(globalThis, 'window', { configurable: true, value: previousWindow });
  });

  const requests = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    requests.push({ url, options });
    return requests.length === 1
      ? { ok: true, json: async () => ({ success: true, data: [] }) }
      : { ok: true, blob: async () => new Blob(['jpeg-bytes'], { type: 'image/jpeg' }) };
  });

  await api.recentLiveScans();
  const image = await api.liveScanImage('123e4567-e89b-42d3-a456-426614174000');

  assert.equal(requests[0].url, 'http://localhost:5000/api/attendance/live-scan-records');
  assert.equal(requests[1].url, 'http://localhost:5000/api/attendance/live-scans/123e4567-e89b-42d3-a456-426614174000/image');
  assert.equal(requests[1].options.headers.Authorization, 'Bearer preview-session-token');
  assert.equal(image.type, 'image/jpeg');
});
