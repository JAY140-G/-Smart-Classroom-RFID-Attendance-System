'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const LiveScanImage = require('../models/LiveScanImage');

test('captured images are private by default and receive a MongoDB TTL index', () => {
  assert.equal(LiveScanImage.schema.path('imageData').options.select, false);
  const expiresIndex = LiveScanImage.schema.indexes().find(
    ([keys, options]) => keys.expiresAt === 1 && options.expireAfterSeconds === 0
  );
  assert.ok(expiresIndex);
  assert.equal(LiveScanImage.schema.path('scanId').options.unique, true);
});
