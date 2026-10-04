'use strict';

const { startSession, getActiveSession } = require('../services/attendance/sessionService');
const { processScan, closeSession } = require('../services/attendance/attendanceService');
const { subjectSummary, studentSummary, register } = require('../services/attendance/attendanceAnalyticsService');
const { getLiveAttendance } = require('../services/attendance/liveAttendanceService');
const Student = require('../models/Student');
const AppError = require('../utils/AppError');

async function start(req, res) {
  const session = await startSession(req.body.timetableId, { teacherId: req.auth.teacherId });
  res.status(201).json({ success: true, message: 'Attendance session started', data: session });
}

async function active(req, res) {
  const session = await getActiveSession({
    ...req.query,
    ...(req.auth.teacherId ? { teacherId: req.auth.teacherId } : {})
  });
  res.status(200).json({ success: true, data: session });
}

async function scan(req, res) {
  const result = await processScan({
    ...req.body,
    imageBuffer: req.file?.buffer,
    idempotencyKey: req.idempotencyKey
  });
  res.status(200).json({
    success: true,
    message: `${result.event.type} recorded`,
    data: {
      student: result.student,
      session: result.session,
      currentState: result.record.currentState,
      event: result.event,
      subjectAttendance: result.attendance
    }
  });
}

async function close(req, res) {
  const session = await closeSession(req.params.id, { teacherId: req.auth.teacherId });
  res.status(200).json({ success: true, message: 'Attendance session closed', data: session });
}

async function subject(req, res) {
  const summary = await subjectSummary(req.params.studentId, req.params.subjectId);
  res.status(200).json({ success: true, data: summary });
}

async function student(req, res) {
  const summaries = await studentSummary(req.params.studentId);
  res.status(200).json({ success: true, data: summaries });
}

async function me(req, res) {
  const student = await Student.findOne({ userId: req.auth.user._id, isActive: true });
  if (!student) throw new AppError('Student account is not linked', 403);
  const summaries = await studentSummary(student._id);
  res.status(200).json({ success: true, data: summaries });
}

async function live(req, res) {
  const data = await getLiveAttendance(req.params.sessionId);
  res.status(200).json({ success: true, data });
}

async function attendanceRegister(req, res) {
  const records = await register({ ...req.query, teacherId: req.auth.teacherId });
  res.status(200).json({ success: true, data: records });
}

module.exports = { start, active, scan, close, subject, student, me, live, attendanceRegister };