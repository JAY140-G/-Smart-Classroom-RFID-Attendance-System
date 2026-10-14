'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const entityService = require('../services/entityService');

test('student creation rejects malformed physical RFID UIDs before creating an account', async () => {
  await assert.rejects(
    entityService.create('students', {
      name: 'Test Student',
      rollNumber: 'TEST-1',
      classId: '64b000000000000000000001',
      rfidUid: 'V-64B000000000000000000001',
      email: 'test@example.invalid',
      password: 'long-test-password'
    }),
    (error) => error.statusCode === 400 && /RFID UID/.test(error.message)
  );
});
