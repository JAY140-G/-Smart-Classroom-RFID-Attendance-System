'use strict';

const assert = require('node:assert/strict');
const { afterEach, beforeEach, test } = require('node:test');
const mongoose = require('mongoose');
const LiveScanRequest = require('../models/LiveScanRequest');
const LiveScanImage = require('../models/LiveScanImage');
const Student = require('../models/Student');
const FaceReference = require('../models/FaceReference');
const attendanceService = require('../services/attendance/attendanceService');

let state;
const originals = {
  create: LiveScanRequest.create,
  findOne: LiveScanRequest.findOne,
  findOneAndUpdate: LiveScanRequest.findOneAndUpdate,
  imageCreate: LiveScanImage.create,
  imageFindOne: LiveScanImage.findOne,
  imageFind: LiveScanImage.find,
  studentFind: Student.find,
  studentFindOne: Student.findOne,
  studentUpdateOne: Student.updateOne,
  faceReferenceFind: FaceReference.find,
  faceReferenceExists: FaceReference.exists,
  processScan: attendanceService.processScan
};

attendanceService.processScan = (...args) => state.processScan(...args);
const liveScanService = require('../services/attendance/liveScanService');
const SCAN_ID = '123e4567-e89b-42d3-a456-426614174000';
const IDEMPOTENCY_KEY = '123e4567-e89b-42d3-a456-426614174001';
const DEVICE_KEY = 'virtual-scan-service-test-device-key-32-chars';
const STUDENT_ID = '64b000000000000000000001';
const VIRTUAL_UID = `V-${STUDENT_ID.toUpperCase()}`;
const originalDeviceKey = process.env.AUTH_DEVICE_KEY;

function query(value) {
  return {
    select() { return this; },
    sort() { return this; },
    limit() { return this; },
    populate() { return this; },
    lean() { return this; },
    then(resolve, reject) {
      return Promise.resolve(typeof value === 'function' ? value() : value).then(resolve, reject);
    }
  };
}

beforeEach(() => {
  state = {
    scan: null,
    images: [],
    student: {
      _id: STUDENT_ID,
      name: 'Example Student',
      rollNumber: 'R-1',
      classId: '64b000000000000000000004',
      rfidUid: 'A1B2C3D4',
      isActive: true
    },
    students: [],
    references: [],
    faceExists: true,
    virtualUidWrites: [],
    processCalls: [],
    processScan: async (input) => {
      state.processCalls.push(input);
      return { event: { type: 'ENTRY' }, record: { currentState: 'IN_CLASS' } };
    }
  };
  LiveScanRequest.create = async (input) => {
    state.scan = { _id: 'database-id', createdAt: new Date(), ...input };
    return state.scan;
  };
  LiveScanImage.create = async (input) => {
    state.images.push(input);
    return input;
  };
  LiveScanImage.findOne = (filter) => query(() => {
    const image = state.images.find((item) => item.scanId === filter.scanId
      && item.expiresAt > filter.expiresAt.$gt);
    return image ? { ...image, imageData: Buffer.from(image.imageData) } : null;
  });
  LiveScanImage.find = () => query([]);
  Student.find = () => query(state.students);
  Student.findOne = (filter) => query(
    filter.isActive === true
      && state.student?.isActive
      && (filter.virtualRfidUid
        ? state.student.virtualRfidUid === filter.virtualRfidUid
        : state.student.rfidUid === filter.rfidUid)
      ? state.student
      : null
  );
  Student.updateOne = async (filter, update) => {
    state.virtualUidWrites.push({ filter, update });
    if (state.student && String(state.student._id) === String(filter._id)) {
      state.student.virtualRfidUid = update.$set.virtualRfidUid;
    }
    return { matchedCount: 1 };
  };
  FaceReference.find = () => query(state.references);
  FaceReference.exists = async () => state.faceExists ? { _id: 'face-reference' } : null;
  process.env.AUTH_DEVICE_KEY = DEVICE_KEY;
  LiveScanRequest.findOne = (filter) => query(() => {
    if (filter.idempotencyKey) return state.scan?.idempotencyKey === filter.idempotencyKey ? state.scan : null;
    if (filter.status === 'WAITING_CAMERA') {
      return state.scan?.status === filter.status && state.scan.expiresAt > filter.expiresAt.$gt ? state.scan : null;
    }
    if (filter.source && state.scan?.source !== filter.source) return null;
    return state.scan?.scanId === filter.scanId ? state.scan : null;
  });
  LiveScanRequest.findOneAndUpdate = async (filter, update) => {
    if (!state.scan || (filter.scanId && state.scan.scanId !== filter.scanId)
      || (filter._id && state.scan._id !== filter._id)
      || (filter.status && state.scan.status !== filter.status)) return null;
    if (filter.expiresAt?.$gt && state.scan.expiresAt <= filter.expiresAt.$gt) return null;
    if (filter.expiresAt?.$lte && state.scan.expiresAt > filter.expiresAt.$lte) return null;
    Object.assign(state.scan, update.$set);
    return state.scan;
  };
});

afterEach(() => {
  LiveScanRequest.create = originals.create;
  LiveScanRequest.findOne = originals.findOne;
  LiveScanRequest.findOneAndUpdate = originals.findOneAndUpdate;
  LiveScanImage.create = originals.imageCreate;
  LiveScanImage.findOne = originals.imageFindOne;
  LiveScanImage.find = originals.imageFind;
  Student.find = originals.studentFind;
  Student.findOne = originals.studentFindOne;
  Student.updateOne = originals.studentUpdateOne;
  FaceReference.find = originals.faceReferenceFind;
  FaceReference.exists = originals.faceReferenceExists;
  attendanceService.processScan = originals.processScan;
  if (originalDeviceKey === undefined) delete process.env.AUTH_DEVICE_KEY;
  else process.env.AUTH_DEVICE_KEY = originalDeviceKey;
});

test('creates a short-lived opaque request without exposing the RFID UID to the camera queue', async () => {
  const scan = await liveScanService.createScan({
    rfidUid: 'a1b2c3d4',
    idempotencyKey: IDEMPOTENCY_KEY
  });

  const next = await liveScanService.getNextScan();
  assert.equal(scan.status, 'WAITING_CAMERA');
  assert.equal(scan.rfidUid, 'A1B2C3D4');
  assert.equal(scan.studentName, 'Example Student');
  assert.equal(scan.expiresAt.getTime() - scan.createdAt.getTime() <= 30000, true);
  assert.deepEqual(next, { scanId: scan.scanId, expiresAt: scan.expiresAt });
  assert.equal(Object.hasOwn(next, 'rfidUid'), false);
});

test('authenticated device status does not disclose student identity or RFID UID', async () => {
  const scan = await liveScanService.createScan({
    rfidUid: 'a1b2c3d4',
    idempotencyKey: IDEMPOTENCY_KEY
  });

  const status = await liveScanService.getScanStatus(scan.scanId);
  assert.equal(Object.hasOwn(status, 'studentName'), false);
  assert.equal(Object.hasOwn(status, 'rfidUid'), false);
});

test('camera-facing status does not disclose a virtual UID or student identity', async () => {
  state.scan = {
    _id: 'database-id',
    scanId: SCAN_ID,
    idempotencyKey: IDEMPOTENCY_KEY,
    rfidUid: 'A1B2C3D4',
    studentId: STUDENT_ID,
    virtualRfidUid: VIRTUAL_UID,
    source: 'VIRTUAL',
    status: 'WAITING_CAMERA',
    expiresAt: new Date(Date.now() + 30000)
  };

  const status = await liveScanService.getScanStatus(SCAN_ID);
  assert.equal(status.source, 'VIRTUAL');
  assert.equal(Object.hasOwn(status, 'virtualRfidUid'), false);
  assert.equal(Object.hasOwn(status, 'studentName'), false);
});

test('rejects malformed RFID UIDs and invalid idempotency keys', async () => {
  await assert.rejects(
    liveScanService.createScan({ rfidUid: 'not-hex', idempotencyKey: IDEMPOTENCY_KEY }),
    (error) => error.statusCode === 400
  );
  await assert.rejects(
    liveScanService.createScan({ rfidUid: 'A1B2C3D4', idempotencyKey: 'not-a-uuid' }),
    (error) => error.statusCode === 400
  );
});

test('unknown physical UIDs and students without an active face reference get no camera challenge', async () => {
  state.student.rfidUid = '01020304';
  await assert.rejects(
    liveScanService.createScan({ rfidUid: 'A1B2C3D4', idempotencyKey: IDEMPOTENCY_KEY }),
    (error) => error.statusCode === 404 && error.reason === 'RFID_NOT_RECOGNIZED'
  );

  state.faceExists = false;
  await assert.rejects(
    liveScanService.createScan({ rfidUid: '01020304', idempotencyKey: IDEMPOTENCY_KEY }),
    (error) => error.statusCode === 409 && error.reason === 'NO_FACE_REFERENCE'
  );
  assert.equal(state.scan, null);
});

test('assigns stable virtual UIDs separately from hardware RFID UIDs and reports face enrollment', async () => {
  state.student.virtualRfidUid = undefined;
  state.students = [state.student];
  state.references = [{ studentId: STUDENT_ID }];

  const first = await liveScanService.getVirtualStudents();
  const second = await liveScanService.getVirtualStudents();

  assert.deepEqual(first, [{
    studentId: STUDENT_ID,
    name: 'Example Student',
    rollNumber: 'R-1',
    classId: '64b000000000000000000004',
    virtualRfidUid: VIRTUAL_UID,
    faceEnrolled: true
  }]);
  assert.equal(second[0].virtualRfidUid, VIRTUAL_UID);
  assert.equal(state.student.rfidUid, 'A1B2C3D4');
  assert.equal(state.virtualUidWrites.length, 1);
});

test('creates an authenticated virtual challenge for an enrolled student without replacing real RFID identity', async () => {
  state.student.virtualRfidUid = VIRTUAL_UID;

  const scan = await liveScanService.createVirtualScan({
    virtualRfidUid: VIRTUAL_UID,
    idempotencyKey: IDEMPOTENCY_KEY
  });

  assert.equal(scan.source, 'VIRTUAL');
  assert.equal(scan.virtualRfidUid, VIRTUAL_UID);
  assert.equal(scan.studentId, STUDENT_ID);
  assert.equal(scan.rfidUid, 'A1B2C3D4');
  assert.equal(state.student.rfidUid, 'A1B2C3D4');
});

test('unknown virtual UID and missing face enrollment do not create a camera challenge', async () => {
  state.student.virtualRfidUid = VIRTUAL_UID;
  await assert.rejects(
    liveScanService.createVirtualScan({
      virtualRfidUid: `V-${'F'.repeat(24)}`,
      idempotencyKey: IDEMPOTENCY_KEY
    }),
    (error) => error.statusCode === 404
  );

  state.faceExists = false;
  await assert.rejects(
    liveScanService.createVirtualScan({
      virtualRfidUid: VIRTUAL_UID,
      idempotencyKey: IDEMPOTENCY_KEY
    }),
    (error) => error.statusCode === 409
  );
  assert.equal(state.scan, null);
});

test('consumes a challenge once and delegates only its image and RFID identity to processScan', async () => {
  state.scan = {
    _id: 'database-id',
    scanId: SCAN_ID,
    idempotencyKey: IDEMPOTENCY_KEY,
    rfidUid: 'A1B2C3D4',
    status: 'WAITING_CAMERA',
    expiresAt: new Date(Date.now() + 30000)
  };
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);

  const first = await liveScanService.completeScan(SCAN_ID, jpeg);
  const replay = await liveScanService.completeScan(SCAN_ID, jpeg);

  assert.equal(first.status, 'SUCCEEDED');
  assert.equal(state.images.length, 1);
  assert.equal(state.images[0].scanId, SCAN_ID);
  assert.deepEqual(state.images[0].imageData, jpeg);
  assert.deepEqual(first.result, {
    eventType: 'ENTRY',
    currentState: 'IN_CLASS',
    message: 'ENTRY recorded.',
    reason: 'VERIFIED'
  });
  assert.equal(replay.status, 'SUCCEEDED');
  assert.equal(state.processCalls.length, 1);
  assert.deepEqual(state.processCalls[0], {
    rfidUid: 'A1B2C3D4',
    imageBuffer: jpeg,
    idempotencyKey: IDEMPOTENCY_KEY
  });
});

test('admin image lookup returns only the exact unexpired image and rejects missing or expired images', async () => {
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
  state.images = [{
    scanId: SCAN_ID,
    imageData: jpeg,
    expiresAt: new Date(Date.now() + 60000)
  }, {
    scanId: '123e4567-e89b-42d3-a456-426614174002',
    imageData: Buffer.from('expired'),
    expiresAt: new Date(Date.now() - 1)
  }];

  const image = await liveScanService.getCapturedImage(SCAN_ID);
  assert.deepEqual(image.imageData, jpeg);
  assert.equal(state.processCalls.length, 0);
  await assert.rejects(
    liveScanService.getCapturedImage('123e4567-e89b-42d3-a456-426614174002'),
    (error) => error.statusCode === 404
  );
});

test('virtual camera challenge delegates the real image and virtual identity to the shared attendance service', async () => {
  state.scan = {
    _id: 'database-id',
    scanId: SCAN_ID,
    idempotencyKey: IDEMPOTENCY_KEY,
    rfidUid: 'A1B2C3D4',
    studentId: STUDENT_ID,
    virtualRfidUid: VIRTUAL_UID,
    source: 'VIRTUAL',
    status: 'WAITING_CAMERA',
    expiresAt: new Date(Date.now() + 30000)
  };
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);

  const result = await liveScanService.completeScan(SCAN_ID, jpeg);

  assert.equal(result.status, 'SUCCEEDED');
  assert.equal(result.source, 'VIRTUAL');
  assert.equal(Object.hasOwn(result, 'virtualRfidUid'), false);
  assert.deepEqual(state.processCalls[0], {
    rfidUid: 'A1B2C3D4',
    source: 'VIRTUAL',
    studentId: STUDENT_ID,
    virtualRfidUid: VIRTUAL_UID,
    imageBuffer: jpeg,
    idempotencyKey: IDEMPOTENCY_KEY
  });
});

test('concurrent duplicate uploads cannot start a second attendance scan', async () => {
  state.scan = {
    _id: 'database-id',
    scanId: SCAN_ID,
    idempotencyKey: IDEMPOTENCY_KEY,
    rfidUid: 'A1B2C3D4',
    status: 'WAITING_CAMERA',
    expiresAt: new Date(Date.now() + 30000)
  };
  let finishProcessing;
  state.processScan = async (input) => {
    state.processCalls.push(input);
    await new Promise((resolve) => { finishProcessing = resolve; });
    return { event: { type: 'ENTRY' }, record: { currentState: 'IN_CLASS' } };
  };

  const originalUpload = liveScanService.completeScan(SCAN_ID, Buffer.from('first'));
  await new Promise((resolve) => setImmediate(resolve));
  const duplicateUpload = await liveScanService.completeScan(SCAN_ID, Buffer.from('duplicate'));

  assert.equal(duplicateUpload.status, 'PROCESSING');
  assert.equal(state.processCalls.length, 1);
  finishProcessing();
  assert.equal((await originalUpload).status, 'SUCCEEDED');
});

test('a verification rejection is terminal and cannot call processScan again', async () => {
  state.scan = {
    _id: 'database-id',
    scanId: SCAN_ID,
    idempotencyKey: IDEMPOTENCY_KEY,
    rfidUid: 'A1B2C3D4',
    status: 'WAITING_CAMERA',
    expiresAt: new Date(Date.now() + 30000)
  };
  state.processScan = async () => {
    state.processCalls.push(true);
    const error = new Error('Face verification failed');
    error.statusCode = 403;
    throw error;
  };

  const first = await liveScanService.completeScan(SCAN_ID, Buffer.from('invalid'));
  const replay = await liveScanService.completeScan(SCAN_ID, Buffer.from('other'));

  assert.equal(first.status, 'FAILED');
  assert.deepEqual(first.result, { message: 'Face verification failed.', reason: 'SCAN_FAILED' });
  assert.equal(replay.status, 'FAILED');
  assert.equal(state.processCalls.length, 1);
});

test('a no-face verification failure is reported clearly without exposing provider errors', async () => {
  state.scan = {
    _id: 'database-id',
    scanId: SCAN_ID,
    idempotencyKey: IDEMPOTENCY_KEY,
    rfidUid: 'A1B2C3D4',
    status: 'WAITING_CAMERA',
    expiresAt: new Date(Date.now() + 30000)
  };
  state.processScan = async () => {
    const error = new Error('Face verification failed');
    error.statusCode = 403;
    error.reason = 'NO_FACE';
    throw error;
  };

  const result = await liveScanService.completeScan(SCAN_ID, Buffer.from('invalid'));

  assert.equal(result.status, 'FAILED');
  assert.deepEqual(result.result, {
    message: 'No face was detected in the camera image.',
    reason: 'NO_FACE'
  });
});

test('an expired challenge never reaches attendance processing', async () => {
  state.scan = {
    _id: 'database-id',
    scanId: SCAN_ID,
    idempotencyKey: IDEMPOTENCY_KEY,
    rfidUid: 'A1B2C3D4',
    status: 'WAITING_CAMERA',
    expiresAt: new Date(Date.now() - 1)
  };

  const result = await liveScanService.completeScan(SCAN_ID, Buffer.from('image'));

  assert.equal(result.status, 'EXPIRED');
  assert.equal(state.processCalls.length, 0);
});
