'use strict';

const mongoose = require('mongoose');
const Student = require('../../models/Student');
const AttendanceSession = require('../../models/AttendanceSession');
const AttendanceRecord = require('../../models/AttendanceRecord');
const AttendanceEvent = require('../../models/AttendanceEvent');
const AttendanceScanReceipt = require('../../models/AttendanceScanReceipt');
const AppError = require('../../utils/AppError');
const { getActiveSession } = require('./sessionService');
const { subjectSummary } = require('./attendanceAnalyticsService');
const { verifyFace } = require('../faceVerification/faceVerificationService');
const FaceReference = require('../../models/FaceReference');

const TRANSITIONS = {
  NOT_SCANNED: { type: 'ENTRY', nextState: 'IN_CLASS' },
  IN_CLASS: { type: 'EXIT', nextState: 'OUTSIDE' },
  OUTSIDE: { type: 'ENTRY', nextState: 'IN_CLASS' }
};

function receiptResponse(receipt, { rfidUid, studentId, sessionId }) {
  const matchesIdentity = receipt.rfidUid === rfidUid
    && String(receipt.studentId) === String(studentId);
  const matchesSession = String(receipt.sessionId) === String(sessionId);
  if (!matchesIdentity || !matchesSession) {
    throw new AppError('Idempotency-Key was already used for a different scan', 409);
  }
  return receipt.response;
}

async function replayReceipt(receipt, identity, student) {
  let effectiveSessionId = identity.sessionId;
  if (!effectiveSessionId) {
    const activeSession = await getActiveSession({ classId: student.classId });
    effectiveSessionId = activeSession?._id || receipt.sessionId;
  }
  return receiptResponse(receipt, { ...identity, sessionId: effectiveSessionId });
}

function documentSnapshot(document) {
  return document && typeof document.toObject === 'function' ? document.toObject() : document;
}

async function findOrCreateRecord(student, session, transactionSession) {
  try {
    const options = { new: true, upsert: true, setDefaultsOnInsert: true };
    if (transactionSession) options.session = transactionSession;
    return await AttendanceRecord.findOneAndUpdate(
      { studentId: student._id, sessionId: session._id },
      {
        $setOnInsert: {
          studentId: student._id,
          subjectId: session.subjectId,
          sessionId: session._id,
          date: session.date,
          currentState: 'NOT_SCANNED'
        }
      },
      options
    );
  } catch (error) {
    if (error.code !== 11000) throw error;
    const query = AttendanceRecord.findOne({ studentId: student._id, sessionId: session._id });
    if (transactionSession) query.session(transactionSession);
    return query;
  }
}

async function processScan({ rfidUid, faceVerified, imageBuffer, sessionId, idempotencyKey }) {
  if (typeof rfidUid !== 'string' || !rfidUid.trim()) throw new AppError('rfidUid is required', 400);
  if (typeof idempotencyKey !== 'string') throw new AppError('A valid UUID Idempotency-Key header is required', 400);

  const normalizedRfidUid = rfidUid.trim().toUpperCase();
  const normalizedIdempotencyKey = idempotencyKey.toLowerCase();
  const student = await Student.findOne({ rfidUid: normalizedRfidUid, isActive: true });
  if (!student) throw new AppError('RFID not recognized', 404);

  if (sessionId && !mongoose.isValidObjectId(sessionId)) throw new AppError('Invalid session id', 400);
  const receiptIdentity = {
    rfidUid: normalizedRfidUid,
    studentId: student._id,
    sessionId
  };
  const existingReceipt = await AttendanceScanReceipt.findOne({ idempotencyKey: normalizedIdempotencyKey });
  if (existingReceipt) return replayReceipt(existingReceipt, receiptIdentity, student);

  const faceReference = await FaceReference.findOne({ studentId: student._id, isActive: true }).select('+referenceData');
  const verification = await verifyFace({ student, imageBuffer, referenceData: faceReference?.referenceData, faceVerified });
  if (!verification.configured) throw new AppError(verification.message, 503);
  if (!verification.verified) throw new AppError('Face verification failed', 403);

  let session;
  if (sessionId) {
    session = await AttendanceSession.findOne({ _id: sessionId, status: 'ACTIVE' });
  } else {
    session = await getActiveSession({ classId: student.classId });
  }
  if (!session) throw new AppError('No active attendance session found', 404);
  const sessionClassId = session.classId._id || session.classId;
  const sessionSubjectId = session.subjectId._id || session.subjectId;
  if (String(sessionClassId) !== String(student.classId)) {
    throw new AppError('Student does not belong to this session class', 403);
  }

  let scanResult;
  let transactionError;
  const transactionSession = await mongoose.startSession();
  try {
    await transactionSession.withTransaction(async () => {
      scanResult = undefined;
      const receipt = await AttendanceScanReceipt.findOne({ idempotencyKey: normalizedIdempotencyKey })
        .session(transactionSession);
      if (receipt) {
        scanResult = receiptResponse(receipt, {
          ...receiptIdentity,
          sessionId: session._id
        });
        return;
      }

      const activeSession = await AttendanceSession.findOne({ _id: session._id, status: 'ACTIVE' })
        .session(transactionSession);
      if (!activeSession) throw new AppError('No active attendance session found', 404);

      const sessionLock = await AttendanceSession.updateOne(
        { _id: activeSession._id, status: 'ACTIVE' },
        { $inc: { __v: 1 } },
        { session: transactionSession }
      );
      if (sessionLock.matchedCount !== 1) throw new AppError('No active attendance session found', 404);

      const activeSessionClassId = activeSession.classId._id || activeSession.classId;
      if (String(activeSessionClassId) !== String(student.classId)) {
        throw new AppError('Student does not belong to this session class', 403);
      }

      const record = await findOrCreateRecord(student, activeSession, transactionSession);
      const transition = TRANSITIONS[record.currentState];
      const updatedRecord = await AttendanceRecord.findOneAndUpdate(
        { _id: record._id, currentState: record.currentState, finalStatus: null },
        { $set: { currentState: transition.nextState } },
        { new: true, session: transactionSession }
      );
      if (!updatedRecord) throw new AppError('Attendance record changed; please retry the scan', 409);

      const [event] = await AttendanceEvent.create([{
        studentId: student._id,
        sessionId: activeSession._id,
        type: transition.type,
        timestamp: new Date(),
        rfidUid: student.rfidUid,
        faceVerified: true,
        verificationStatus: 'VERIFIED'
      }], { session: transactionSession });

      const attendance = await subjectSummary(student._id, sessionSubjectId, transactionSession);
      const response = {
        student: documentSnapshot(student),
        session: documentSnapshot(session),
        record: documentSnapshot(updatedRecord),
        event: documentSnapshot(event),
        attendance: {
          student: documentSnapshot(attendance.student),
          subject: documentSnapshot(attendance.subject),
          presentCount: attendance.presentCount,
          completedClassCount: attendance.completedClassCount,
          attendancePercentage: attendance.attendancePercentage
        }
      };
      await AttendanceScanReceipt.create([{
        idempotencyKey: normalizedIdempotencyKey,
        rfidUid: normalizedRfidUid,
        studentId: student._id,
        sessionId: activeSession._id,
        response
      }], { session: transactionSession });
      scanResult = { student, session, record: updatedRecord, event, attendance };
    });
  } catch (error) {
    transactionError = error;
  } finally {
    await transactionSession.endSession();
  }

  if (transactionError) {
    const winningReceipt = await AttendanceScanReceipt.findOne({ idempotencyKey: normalizedIdempotencyKey });
    if (winningReceipt) {
      return replayReceipt(winningReceipt, receiptIdentity, student);
    }
    throw transactionError;
  }

  return scanResult;
}

async function closeSession(sessionId, { teacherId } = {}) {
  if (!mongoose.isValidObjectId(sessionId)) throw new AppError('Invalid session id', 400);
  let closedSession;
  const transactionSession = await mongoose.startSession();
  try {
    await transactionSession.withTransaction(async () => {
      const session = await AttendanceSession.findById(sessionId).session(transactionSession);
      if (!session) throw new AppError('Attendance session not found', 404);
      if (teacherId && String(session.teacherId) !== String(teacherId)) {
        throw new AppError('You can close only your own attendance sessions', 403);
      }
      if (session.status !== 'ACTIVE') throw new AppError('Attendance session is already closed', 409);

      const sessionLock = await AttendanceSession.updateOne(
        { _id: session._id, status: 'ACTIVE' },
        { $inc: { __v: 1 } },
        { session: transactionSession }
      );
      if (sessionLock.matchedCount !== 1) throw new AppError('Attendance session is already closed', 409);

      const students = await Student.find({
        classId: session.classId,
        isActive: { $ne: false }
      }).session(transactionSession);
      for (const student of students) {
        const record = await findOrCreateRecord(student, session, transactionSession);
        const finalState = record.currentState;
        const finalStatus = finalState === 'IN_CLASS' ? 'PRESENT' : finalState === 'OUTSIDE' ? 'LEFT_EARLY' : 'ABSENT';
        await AttendanceRecord.updateOne(
          { _id: record._id, finalStatus: null },
          { $set: { finalState, finalStatus } },
          { session: transactionSession }
        );
      }

      closedSession = await AttendanceSession.findOneAndUpdate(
        { _id: session._id, status: 'ACTIVE' },
        {
          $set: {
            status: 'CLOSED',
            endTime: new Date().toISOString().slice(11, 16)
          },
          $inc: { __v: 1 }
        },
        { new: true, session: transactionSession }
      );
      if (!closedSession) throw new AppError('Attendance session is already closed', 409);
    });
  } finally {
    await transactionSession.endSession();
  }
  return closedSession;
}

module.exports = { processScan, closeSession };