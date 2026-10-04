'use strict';

const mongoose = require('mongoose');
const AttendanceRecord = require('../../models/AttendanceRecord');
const AttendanceSession = require('../../models/AttendanceSession');
const Student = require('../../models/Student');
const Subject = require('../../models/Subject');
const AppError = require('../../utils/AppError');

function assertId(value, name) {
  if (!mongoose.isValidObjectId(value)) throw new AppError(`Invalid ${name}`, 400);
}

function percentage(presentCount, completedClassCount) {
  return completedClassCount === 0 ? 0 : Math.round((presentCount / completedClassCount) * 10000) / 100;
}

async function subjectSummary(studentId, subjectId, transactionSession) {
  assertId(studentId, 'student id');
  assertId(subjectId, 'subject id');
  let student;
  let subject;
  let records;
  if (transactionSession) {
    student = await Student.findById(studentId).session(transactionSession);
    subject = await Subject.findById(subjectId).session(transactionSession);
    records = await AttendanceRecord.find({ studentId, subjectId })
      .populate({ path: 'sessionId', options: { session: transactionSession } })
      .session(transactionSession);
  } else {
    [student, subject, records] = await Promise.all([
      Student.findById(studentId),
      Subject.findById(subjectId),
      AttendanceRecord.find({ studentId, subjectId }).populate('sessionId')
    ]);
  }
  if (!student) throw new AppError('Student not found', 404);
  if (!subject) throw new AppError('Subject not found', 404);

  const completed = records.filter((record) => record.sessionId && record.sessionId.status === 'CLOSED');
  const presentCount = completed.filter((record) => record.finalStatus === 'PRESENT').length;
  return {
    student,
    subject,
    presentCount,
    completedClassCount: completed.length,
    attendancePercentage: percentage(presentCount, completed.length)
  };
}

async function studentSummary(studentId) {
  assertId(studentId, 'student id');
  const student = await Student.findById(studentId);
  if (!student) throw new AppError('Student not found', 404);

  const records = await AttendanceRecord.find({ studentId }).populate('subjectId sessionId');
  const grouped = new Map();
  records.filter((record) => record.sessionId && record.sessionId.status === 'CLOSED').forEach((record) => {
    const key = String(record.subjectId._id);
    if (!grouped.has(key)) grouped.set(key, { subject: record.subjectId, presentCount: 0, completedClassCount: 0 });
    const summary = grouped.get(key);
    summary.completedClassCount += 1;
    if (record.finalStatus === 'PRESENT') summary.presentCount += 1;
  });

  return Array.from(grouped.values()).map((summary) => ({
    ...summary,
    attendancePercentage: percentage(summary.presentCount, summary.completedClassCount)
  }));
}

async function register(filters) {
  const query = {};
  for (const field of ['subjectId', 'sessionId', 'studentId']) {
    if (filters[field]) {
      assertId(filters[field], field);
      query[field] = filters[field];
    }
  }
  if (filters.classId) {
    const sessions = await AttendanceSession.find({ classId: filters.classId }).select('_id');
    const classSessionIds = sessions.map((session) => session._id);
    if (query.sessionId) {
      query.$and = [
        { sessionId: query.sessionId },
        { sessionId: { $in: classSessionIds } }
      ];
      delete query.sessionId;
    } else {
      query.sessionId = { $in: classSessionIds };
    }
  }
  if (filters.date) {
    const date = new Date(filters.date);
    if (Number.isNaN(date.getTime())) throw new AppError('Invalid date', 400);
    query.date = { $gte: new Date(date.setHours(0, 0, 0, 0)), $lt: new Date(date.setHours(23, 59, 59, 999)) };
  }

  return AttendanceRecord.find(query)
    .populate('studentId subjectId sessionId')
    .sort({ date: -1 });
}

module.exports = { subjectSummary, studentSummary, register, percentage };