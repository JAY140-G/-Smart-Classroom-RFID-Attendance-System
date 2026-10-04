import assert from 'node:assert/strict';
import { test } from 'node:test';
import { setAccessToken } from '../src/auth.js';
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
