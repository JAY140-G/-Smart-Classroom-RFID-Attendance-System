'use strict';

const mongoose = require('mongoose');
const Student = require('../../models/Student');
const AttendanceSession = require('../../models/AttendanceSession');
const AttendanceRecord = require('../../models/AttendanceRecord');
const AttendanceEvent = require('../../models/AttendanceEvent');
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

async function findOrCreateRecord(student, session) {
  try {
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
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );
  } catch (error) {
    if (error.code !== 11000) throw error;
    return AttendanceRecord.findOne({ studentId: student._id, sessionId: session._id });
  }
}

async function processScan({ rfidUid, faceVerified, imageBuffer, sessionId }) {
  if (typeof rfidUid !== 'string' || !rfidUid.trim()) throw new AppError('rfidUid is required', 400);

  const student = await Student.findOne({ rfidUid: rfidUid.trim().toUpperCase() });
  if (!student) throw new AppError('RFID not recognized', 404);

  const faceReference = await FaceReference.findOne({ studentId: student._id, isActive: true }).select('+referenceData');
  const verification = await verifyFace({ student, imageBuffer, referenceData: faceReference?.referenceData, faceVerified });
  if (!verification.configured) throw new AppError(verification.message, 503);
  if (!verification.verified) throw new AppError('Face verification failed', 403);

  let session;
  if (sessionId) {
    if (!mongoose.isValidObjectId(sessionId)) throw new AppError('Invalid session id', 400);
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

  const record = await findOrCreateRecord(student, session);
  const transition = TRANSITIONS[record.currentState];
  const updatedRecord = await AttendanceRecord.findOneAndUpdate(
    { _id: record._id, currentState: record.currentState, finalStatus: null },
    { $set: { currentState: transition.nextState } },
    { new: true }
  );
  if (!updatedRecord) throw new AppError('Attendance record changed; please retry the scan', 409);

  const event = await AttendanceEvent.create({
    studentId: student._id,
    sessionId: session._id,
    type: transition.type,
    timestamp: new Date(),
    rfidUid: student.rfidUid,
    faceVerified: true,
    verificationStatus: 'VERIFIED'
  });
  const attendance = await subjectSummary(student._id, sessionSubjectId);

  return { student, session, record: updatedRecord, event, attendance };
}

async function closeSession(sessionId) {
  if (!mongoose.isValidObjectId(sessionId)) throw new AppError('Invalid session id', 400);
  const session = await AttendanceSession.findById(sessionId);
  if (!session) throw new AppError('Attendance session not found', 404);
  if (session.status !== 'ACTIVE') throw new AppError('Attendance session is already closed', 409);

  const students = await Student.find({ classId: session.classId, isActive: { $ne: false } });
  for (const student of students) {
    const record = await findOrCreateRecord(student, session);
    const finalState = record.currentState;
    const finalStatus = finalState === 'IN_CLASS' ? 'PRESENT' : finalState === 'OUTSIDE' ? 'LEFT_EARLY' : 'ABSENT';
    await AttendanceRecord.updateOne(
      { _id: record._id, finalStatus: null },
      { $set: { finalState, finalStatus } }
    );
  }

  session.status = 'CLOSED';
  session.endTime = new Date().toISOString().slice(11, 16);
  await session.save();
  return session;
}

module.exports = { processScan, closeSession };