import assert from 'node:assert/strict';
import { test } from 'node:test';
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
