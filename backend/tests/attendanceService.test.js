'use strict';

const assert = require('node:assert/strict');
const { afterEach, beforeEach, test } = require('node:test');
const mongoose = require('mongoose');
const Student = require('../models/Student');
const AttendanceSession = require('../models/AttendanceSession');
const AttendanceRecord = require('../models/AttendanceRecord');
const AttendanceEvent = require('../models/AttendanceEvent');
const AttendanceScanReceipt = require('../models/AttendanceScanReceipt');
const FaceReference = require('../models/FaceReference');
const sessionService = require('../services/attendance/sessionService');
const analyticsService = require('../services/attendance/attendanceAnalyticsService');
const faceService = require('../services/faceVerification/faceVerificationService');

const STUDENT_ID = '64b000000000000000000001';
const SESSION_ID = '64b000000000000000000002';
const OTHER_SESSION_ID = '64b000000000000000000003';

let state;
let originals;

sessionService.getActiveSession = (...args) => state.getActiveSession(...args);
analyticsService.subjectSummary = (...args) => state.subjectSummary(...args);
faceService.verifyFace = (...args) => state.verifyFace(...args);

const { processScan } = require('../services/attendance/attendanceService');

function query(value) {
  return {
    session() { return this; },
    select() { return this; },
    then(resolve, reject) {
      return Promise.resolve(typeof value === 'function' ? value() : value).then(resolve, reject);
    }
  };
}

function createReceipt({ idempotencyKey, rfidUid = 'CARD-A', studentId = STUDENT_ID, sessionId = SESSION_ID, response }) {
  return {
    idempotencyKey,
    rfidUid,
    studentId,
    sessionId,
    response: response || { student: { _id: studentId }, session: { _id: sessionId }, record: { currentState: 'IN_CLASS' }, event: { type: 'ENTRY' }, attendance: { attendancePercentage: 0 } }
  };
}

beforeEach(() => {
  state = {
    student: { _id: STUDENT_ID, rfidUid: 'CARD-A', classId: '64b000000000000000000004', isActive: true },
    session: { _id: SESSION_ID, classId: '64b000000000000000000004', subjectId: '64b000000000000000000005', date: new Date('2026-10-04T00:00:00.000Z') },
    record: { _id: '64b000000000000000000006', studentId: STUDENT_ID, sessionId: SESSION_ID, currentState: 'NOT_SCANNED', finalStatus: null },
    updatedRecord: { _id: '64b000000000000000000006', studentId: STUDENT_ID, sessionId: SESSION_ID, currentState: 'IN_CLASS', finalStatus: null },
    receiptLookups: [],
    existingReceipt: null,
    faceReference: { referenceData: [0.1] },
    faceVerification: { configured: true, verified: true },
    activeSessionForReplay: null,
    activeSessionsForReplay: [],
    faceCalls: 0,
    recordWrites: [],
    eventWrites: [],
    receiptWrites: [],
    sessionWrites: [],
    analyticsCalls: [],
    transactionCalls: 0,
    transactionCommitted: false,
    transactionAborted: false,
    transactionEnded: false,
    inTransaction: false,
    transactionSession: null,
    verifyFace: async () => {
      state.faceCalls += 1;
      return state.faceVerification;
    },
    getActiveSession: async () => state.activeSessionForReplay,
    subjectSummary: async (...args) => {
      state.analyticsCalls.push({ args, inTransaction: state.inTransaction });
      return {
        student: state.student,
        subject: { _id: '64b000000000000000000005', code: 'SUBJ' },
        presentCount: 1,
        completedClassCount: 2,
        attendancePercentage: 50
      };
    }
  };

  originals = {
    startSession: mongoose.startSession,
    studentFindOne: Student.findOne,
    faceReferenceFindOne: FaceReference.findOne,
    receiptFindOne: AttendanceScanReceipt.findOne,
    receiptCreate: AttendanceScanReceipt.create,
    attendanceSessionFindOne: AttendanceSession.findOne,
    attendanceSessionFind: AttendanceSession.find,
    attendanceSessionUpdateOne: AttendanceSession.updateOne,
    recordFindOneAndUpdate: AttendanceRecord.findOneAndUpdate,
    eventCreate: AttendanceEvent.create
  };

  state.transactionSession = {
    async withTransaction(callback) {
      state.transactionCalls += 1;
      state.inTransaction = true;
      try {
        await callback();
        state.transactionCommitted = true;
      } catch (error) {
        state.transactionAborted = true;
        throw error;
      } finally {
        state.inTransaction = false;
      }
    },
    async endSession() {
      state.transactionEnded = true;
    }
  };
  mongoose.startSession = async () => state.transactionSession;

  Student.findOne = (filter) => query(filter.isActive === true && state.student?.isActive ? state.student : null);
  FaceReference.findOne = () => query(state.faceReference);
  AttendanceScanReceipt.findOne = () => query(state.receiptLookups.length ? state.receiptLookups.shift() : state.existingReceipt);
  AttendanceScanReceipt.create = async (documents, options) => {
    state.receiptWrites.push({ document: documents[0], options, inTransaction: state.inTransaction });
    return documents;
  };
  AttendanceSession.findOne = (filter) => query(filter.status === 'ACTIVE' ? state.session : null);
  AttendanceSession.find = (filter) => query(
    filter.status === 'ACTIVE' ? state.activeSessionsForReplay : []
  );
  AttendanceSession.updateOne = async (filter, update, options) => {
    state.sessionWrites.push({ filter, update, options, inTransaction: state.inTransaction });
    return { matchedCount: 1 };
  };
  AttendanceRecord.findOneAndUpdate = async (filter, update, options) => {
    state.recordWrites.push({ filter, update, options, inTransaction: state.inTransaction });
    return options.upsert ? state.record : state.updatedRecord;
  };
  AttendanceEvent.create = async (documents, options) => {
    const event = { _id: 'event-1', ...documents[0] };
    state.eventWrites.push({ event, options, inTransaction: state.inTransaction });
    return [event];
  };
});

afterEach(() => {
  mongoose.startSession = originals.startSession;
  Student.findOne = originals.studentFindOne;
  FaceReference.findOne = originals.faceReferenceFindOne;
  AttendanceScanReceipt.findOne = originals.receiptFindOne;
  AttendanceScanReceipt.create = originals.receiptCreate;
  AttendanceSession.findOne = originals.attendanceSessionFindOne;
  AttendanceSession.find = originals.attendanceSessionFind;
  AttendanceSession.updateOne = originals.attendanceSessionUpdateOne;
  AttendanceRecord.findOneAndUpdate = originals.recordFindOneAndUpdate;
  AttendanceEvent.create = originals.eventCreate;
});

const scanInput = {
  rfidUid: ' card-a ',
  imageBuffer: Buffer.from('test-image'),
  sessionId: SESSION_ID,
  idempotencyKey: '123e4567-e89b-42d3-a456-426614174000'
};

test('rejects a missing idempotency key before database work', async () => {
  await assert.rejects(
    processScan({ rfidUid: 'CARD-A' }),
    (error) => error.statusCode === 400
  );
  assert.equal(state.faceCalls, 0);
  assert.equal(state.transactionCalls, 0);
});

test('rejects inactive students before face verification and writes', async () => {
  state.student.isActive = false;
  await assert.rejects(processScan(scanInput), (error) => error.statusCode === 404);
  assert.equal(state.faceCalls, 0);
  assert.equal(state.recordWrites.length, 0);
  assert.equal(state.eventWrites.length, 0);
});

test('does not start a transaction or write attendance when face verification fails', async () => {
  state.faceVerification = { configured: true, verified: false };
  await assert.rejects(processScan(scanInput), (error) => error.statusCode === 403);
  assert.equal(state.transactionCalls, 0);
  assert.equal(state.recordWrites.length, 0);
  assert.equal(state.eventWrites.length, 0);
});

test('commits transition, event, summary snapshot, and receipt in one transaction', async () => {
  const result = await processScan(scanInput);
  const receipt = state.receiptWrites[0].document;

  assert.equal(result.record.currentState, 'IN_CLASS');
  assert.equal(result.event.type, 'ENTRY');
  assert.equal(state.transactionCommitted, true);
  assert.equal(state.transactionEnded, true);
  assert.equal(state.sessionWrites[0].inTransaction, true);
  assert.equal(state.recordWrites.every((write) => write.inTransaction && write.options.session === state.transactionSession), true);
  assert.equal(state.eventWrites[0].inTransaction, true);
  assert.equal(state.eventWrites[0].options.session, state.transactionSession);
  assert.equal(state.receiptWrites[0].inTransaction, true);
  assert.equal(state.receiptWrites[0].options.session, state.transactionSession);
  assert.equal(state.analyticsCalls[0].inTransaction, true);
  assert.deepEqual(receipt.response, {
    student: result.student,
    session: result.session,
    record: result.record,
    event: result.event,
    attendance: result.attendance
  });
});

test('preserves the EXIT and re-entry transition rules', async (t) => {
  await t.test('IN_CLASS changes to OUTSIDE with an EXIT event', async () => {
    state.record.currentState = 'IN_CLASS';
    state.updatedRecord.currentState = 'OUTSIDE';
    const result = await processScan(scanInput);
    assert.equal(result.record.currentState, 'OUTSIDE');
    assert.equal(result.event.type, 'EXIT');
  });

  await t.test('OUTSIDE changes to IN_CLASS with an ENTRY event', async () => {
    state.record.currentState = 'OUTSIDE';
    const result = await processScan(scanInput);
    assert.equal(result.record.currentState, 'IN_CLASS');
    assert.equal(result.event.type, 'ENTRY');
  });
});

test('aborts when event insertion fails and does not create a receipt', async () => {
  AttendanceEvent.create = async () => {
    throw new Error('event insert failed');
  };

  await assert.rejects(processScan(scanInput), /event insert failed/);
  assert.equal(state.transactionAborted, true);
  assert.equal(state.transactionCommitted, false);
  assert.equal(state.transactionEnded, true);
  assert.equal(state.receiptWrites.length, 0);
});

test('replays the original response without writes when the explicit session matches', async () => {
  const response = { student: { _id: STUDENT_ID }, session: { _id: SESSION_ID }, record: { currentState: 'IN_CLASS' }, event: { type: 'ENTRY' }, attendance: { attendancePercentage: 50 } };
  state.existingReceipt = createReceipt({ idempotencyKey: scanInput.idempotencyKey, response });

  const result = await processScan(scanInput);

  assert.deepEqual(result, response);
  assert.equal(state.faceCalls, 0);
  assert.equal(state.transactionCalls, 0);
  assert.equal(state.recordWrites.length, 0);
  assert.equal(state.eventWrites.length, 0);
});

test('rejects reusing a receipt key for another explicit session', async () => {
  state.existingReceipt = createReceipt({ idempotencyKey: scanInput.idempotencyKey, sessionId: OTHER_SESSION_ID });

  await assert.rejects(processScan(scanInput), (error) => error.statusCode === 409);
  assert.equal(state.faceCalls, 0);
  assert.equal(state.recordWrites.length, 0);
  assert.equal(state.eventWrites.length, 0);
});

test('rejects an omitted-session replay when a different session is now active', async () => {
  state.existingReceipt = createReceipt({ idempotencyKey: scanInput.idempotencyKey });
  state.activeSessionsForReplay = [{ _id: OTHER_SESSION_ID }];

  await assert.rejects(
    processScan({ ...scanInput, sessionId: undefined }),
    (error) => error.statusCode === 409
  );
  assert.equal(state.transactionCalls, 0);
  assert.equal(state.eventWrites.length, 0);
});

test('rejects an omitted-session replay if any different session is active alongside the original', async () => {
  state.existingReceipt = createReceipt({ idempotencyKey: scanInput.idempotencyKey });
  state.activeSessionsForReplay = [{ _id: SESSION_ID }, { _id: OTHER_SESSION_ID }];

  await assert.rejects(
    processScan({ ...scanInput, sessionId: undefined }),
    (error) => error.statusCode === 409
  );
  assert.equal(state.faceCalls, 0);
  assert.equal(state.transactionCalls, 0);
  assert.equal(state.eventWrites.length, 0);
});

test('replays an omitted-session receipt when its original session is the only active session', async () => {
  const response = { student: { _id: STUDENT_ID }, session: { _id: SESSION_ID }, record: { currentState: 'IN_CLASS' }, event: { type: 'ENTRY' }, attendance: { attendancePercentage: 50 } };
  state.existingReceipt = createReceipt({ idempotencyKey: scanInput.idempotencyKey, response });
  state.activeSessionsForReplay = [{ _id: SESSION_ID }];

  const result = await processScan({ ...scanInput, sessionId: undefined });

  assert.deepEqual(result, response);
  assert.equal(state.faceCalls, 0);
  assert.equal(state.transactionCalls, 0);
  assert.equal(state.eventWrites.length, 0);
});

test('replays an omitted-session receipt if no session is active', async () => {
  const response = { student: { _id: STUDENT_ID }, session: { _id: SESSION_ID }, record: { currentState: 'IN_CLASS' }, event: { type: 'ENTRY' }, attendance: { attendancePercentage: 50 } };
  state.existingReceipt = createReceipt({ idempotencyKey: scanInput.idempotencyKey, response });
  state.activeSessionsForReplay = [];

  const result = await processScan({ ...scanInput, sessionId: undefined });

  assert.deepEqual(result, response);
  assert.equal(state.faceCalls, 0);
  assert.equal(state.transactionCalls, 0);
  assert.equal(state.recordWrites.length, 0);
  assert.equal(state.eventWrites.length, 0);
});

test('replays the winning receipt after a duplicate-key transaction race', async () => {
  const response = { student: { _id: STUDENT_ID }, session: { _id: SESSION_ID }, record: { currentState: 'IN_CLASS' }, event: { type: 'ENTRY' }, attendance: { attendancePercentage: 50 } };
  state.receiptLookups = [null, null, createReceipt({ idempotencyKey: scanInput.idempotencyKey, response })];
  AttendanceScanReceipt.create = async () => {
    const error = new Error('duplicate idempotency key');
    error.code = 11000;
    throw error;
  };

  const result = await processScan(scanInput);

  assert.deepEqual(result, response);
  assert.equal(state.transactionAborted, true);
  assert.equal(state.transactionEnded, true);
  assert.equal(state.recordWrites.some((write) => !write.options.upsert), true);
  assert.equal(state.eventWrites.length, 1);
});
