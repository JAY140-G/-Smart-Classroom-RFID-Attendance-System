'use strict';

const mongoose = require('mongoose');
const AttendanceRecord = require('../../models/AttendanceRecord');
const AttendanceSession = require('../../models/AttendanceSession');
const AttendanceEvent = require('../../models/AttendanceEvent');
const Student = require('../../models/Student');
const Subject = require('../../models/Subject');
const Timetable = require('../../models/Timetable');
const AppError = require('../../utils/AppError');

function assertId(value, name) {
  if (!mongoose.isValidObjectId(value)) throw new AppError(`Invalid ${name}`, 400);
}

function percentage(presentCount, completedClassCount) {
  return completedClassCount === 0 ? null : Math.round((presentCount / completedClassCount) * 1000) / 10;
}

function summarizeAttendanceRecords(records) {
  const subjects = new Map();
  const totals = { presentCount: 0, absentCount: 0, leftEarlyCount: 0, completedClassCount: 0 };
  for (const record of records) {
    const subject = record.subjectId;
    if (!subject) continue;
    const key = String(subject._id || subject);
    if (!subjects.has(key)) {
      subjects.set(key, {
        subject,
        presentCount: 0,
        absentCount: 0,
        leftEarlyCount: 0,
        completedClassCount: 0
      });
    }
    const summary = subjects.get(key);
    if (!record.sessionId || record.sessionId.status !== 'CLOSED') continue;
    summary.completedClassCount += 1;
    totals.completedClassCount += 1;
    if (record.finalStatus === 'PRESENT') {
      summary.presentCount += 1;
      totals.presentCount += 1;
    } else if (record.finalStatus === 'ABSENT') {
      summary.absentCount += 1;
      totals.absentCount += 1;
    } else if (record.finalStatus === 'LEFT_EARLY') {
      summary.leftEarlyCount += 1;
      totals.leftEarlyCount += 1;
    }
  }
  const subjectSummaries = Array.from(subjects.values()).map((summary) => ({
    ...summary,
    attendancePercentage: percentage(summary.presentCount, summary.completedClassCount)
  }));
  return {
    subjects: subjectSummaries,
    overall: {
      ...totals,
      attendancePercentage: percentage(totals.presentCount, totals.completedClassCount)
    }
  };
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
  const absentCount = completed.filter((record) => record.finalStatus === 'ABSENT').length;
  const leftEarlyCount = completed.filter((record) => record.finalStatus === 'LEFT_EARLY').length;
  return {
    student,
    subject,
    presentCount,
    absentCount,
    leftEarlyCount,
    completedClassCount: completed.length,
    attendancePercentage: percentage(presentCount, completed.length)
  };
}

async function studentSummary(studentId) {
  assertId(studentId, 'student id');
  const student = await Student.findById(studentId);
  if (!student) throw new AppError('Student not found', 404);

  const records = await AttendanceRecord.find({ studentId })
    .populate('subjectId')
    .populate({
      path: 'sessionId',
      populate: [
        { path: 'classId', select: 'name section' },
        { path: 'subjectId', select: 'name code' }
      ]
    })
    .sort({ date: -1 });
  const summary = summarizeAttendanceRecords(records);
  const scheduledSubjects = await Timetable.find({ classId: student.classId, isActive: true }).populate('subjectId');
  const bySubject = new Map(summary.subjects.map((entry) => [String(entry.subject._id), entry]));
  for (const timetable of scheduledSubjects) {
    const subject = timetable.subjectId;
    if (subject && !bySubject.has(String(subject._id))) {
      const zeroSummary = {
        subject,
        presentCount: 0,
        absentCount: 0,
        leftEarlyCount: 0,
        completedClassCount: 0,
        attendancePercentage: null
      };
      summary.subjects.push(zeroSummary);
      bySubject.set(String(subject._id), zeroSummary);
    }
  }
  const recentHistory = records
    .filter((record) => record.sessionId && record.sessionId.status === 'CLOSED')
    .map((record) => ({
      _id: record._id,
      date: record.date,
      subject: record.subjectId,
      status: record.finalStatus,
      session: record.sessionId
    }));
  return { ...summary, recentHistory };
}

async function register(filters) {
  const query = {};
  for (const field of ['subjectId', 'sessionId', 'studentId']) {
    if (filters[field]) {
      assertId(filters[field], field);
      query[field] = filters[field];
    }
  }
  if (filters.teacherId) {
    assertId(filters.teacherId, 'teacherId');
    const sessions = await AttendanceSession.find({ teacherId: filters.teacherId }).select('_id');
    const teacherSessionIds = sessions.map((session) => session._id);
    if (filters.sessionId) {
      query.$and = [
        { sessionId: filters.sessionId },
        { sessionId: { $in: teacherSessionIds } }
      ];
      delete query.sessionId;
    } else {
      query.sessionId = { $in: teacherSessionIds };
    }
  }
  if (filters.classId) {
    assertId(filters.classId, 'classId');
    const sessions = await AttendanceSession.find({ classId: filters.classId }).select('_id');
    const classSessionIds = sessions.map((session) => session._id);
    if (query.sessionId) {
      query.$and = [...(query.$and || []),
        { sessionId: query.sessionId },
        { sessionId: { $in: classSessionIds } }
      ];
      delete query.sessionId;
    } else {
      query.sessionId = { $in: classSessionIds };
    }
  }
  const dateRange = {};
  for (const field of ['startDate', 'endDate', 'date']) {
    if (filters[field] === undefined) continue;
    if (typeof filters[field] !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(filters[field])) {
      throw new AppError(`Invalid ${field}`, 400);
    }
    const date = new Date(`${filters[field]}T00:00:00.000Z`);
    if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== filters[field]) {
      throw new AppError(`Invalid ${field}`, 400);
    }
    if (field === 'date') {
      dateRange.$gte = date;
      dateRange.$lt = new Date(date.getTime() + 24 * 60 * 60 * 1000);
    } else if (field === 'startDate') {
      dateRange.$gte = date;
    } else {
      dateRange.$lt = new Date(date.getTime() + 24 * 60 * 60 * 1000);
    }
  }
  if (filters.startDate && filters.endDate && filters.startDate > filters.endDate) {
    throw new AppError('startDate must not be after endDate', 400);
  }
  if (Object.keys(dateRange).length) query.date = dateRange;

  if (filters.status) {
    if (!['PRESENT', 'ABSENT', 'LEFT_EARLY'].includes(filters.status)) {
      throw new AppError('Invalid attendance status', 400);
    }
    query.finalStatus = filters.status;
  } else if (filters.completedOnly === 'true' || filters.completedOnly === true) {
    query.finalStatus = { $in: ['PRESENT', 'ABSENT', 'LEFT_EARLY'] };
  }

  return AttendanceRecord.find(query)
    .populate('studentId subjectId')
    .populate({
      path: 'sessionId',
      populate: [
        { path: 'classId', select: 'name section' },
        { path: 'subjectId', select: 'name code' },
        { path: 'teacherId', populate: { path: 'userId', select: 'name' } }
      ]
    })
    .sort({ date: -1 });
}

async function sessionList(filters = {}) {
  const query = {};
  for (const field of ['teacherId', 'classId', 'subjectId']) {
    if (!filters[field]) continue;
    assertId(filters[field], field);
    query[field] = filters[field];
  }
  if (filters.status) {
    if (!['ACTIVE', 'CLOSED'].includes(filters.status)) throw new AppError('Invalid session status', 400);
    query.status = filters.status;
  }
  if (filters.startDate || filters.endDate || filters.date) {
    const range = {};
    const values = filters.date ? { startDate: filters.date, endDate: filters.date } : filters;
    if (values.startDate && values.endDate && values.startDate > values.endDate) {
      throw new AppError('startDate must not be after endDate', 400);
    }
    for (const [field, operator] of [['startDate', '$gte'], ['endDate', '$lt']]) {
      if (!values[field]) continue;
      if (typeof values[field] !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(values[field])) throw new AppError(`Invalid ${field}`, 400);
      const date = new Date(`${values[field]}T00:00:00.000Z`);
      if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== values[field]) throw new AppError(`Invalid ${field}`, 400);
      range[operator] = operator === '$lt' ? new Date(date.getTime() + 86400000) : date;
    }
    if (Object.keys(range).length) query.date = range;
  }
  return AttendanceSession.find(query)
    .populate('classId subjectId teacherId timetableId')
    .sort({ date: -1, createdAt: -1 });
}

async function recentActivity(filters = {}) {
  const query = {};
  if (filters.teacherId) {
    assertId(filters.teacherId, 'teacherId');
    const sessions = await AttendanceSession.find({ teacherId: filters.teacherId }).select('_id');
    query.sessionId = { $in: sessions.map((session) => session._id) };
  }
  return AttendanceEvent.find(query)
    .populate({ path: 'studentId', select: 'name rollNumber' })
    .populate({ path: 'sessionId', populate: [{ path: 'subjectId', select: 'name code' }, { path: 'classId', select: 'name section' }] })
    .sort({ timestamp: -1 })
    .limit(12);
}

async function reportSummary(filters = {}) {
  const { status, ...summaryFilters } = filters;
  if (status && !['PRESENT', 'ABSENT', 'LEFT_EARLY'].includes(status)) {
    throw new AppError('Invalid attendance status', 400);
  }
  const allRecords = await register({ ...summaryFilters, completedOnly: true });
  const records = status ? allRecords.filter((record) => record.finalStatus === status) : allRecords;
  const totals = { presentCount: 0, absentCount: 0, leftEarlyCount: 0, completedClassCount: 0 };
  const bySubject = new Map();
  for (const record of allRecords) {
    if (!record.sessionId || record.sessionId.status !== 'CLOSED') continue;
    totals.completedClassCount += 1;
    if (record.finalStatus === 'PRESENT') totals.presentCount += 1;
    else if (record.finalStatus === 'ABSENT') totals.absentCount += 1;
    else if (record.finalStatus === 'LEFT_EARLY') totals.leftEarlyCount += 1;
    const key = String(record.subjectId._id);
    if (!bySubject.has(key)) bySubject.set(key, { subject: record.subjectId, presentCount: 0, completedClassCount: 0 });
    const item = bySubject.get(key);
    item.completedClassCount += 1;
    if (record.finalStatus === 'PRESENT') item.presentCount += 1;
  }
  return {
    records,
    totals: { ...totals, attendancePercentage: percentage(totals.presentCount, totals.completedClassCount) },
    subjects: Array.from(bySubject.values(), (item) => ({
      ...item,
      attendancePercentage: percentage(item.presentCount, item.completedClassCount)
    }))
  };
}

module.exports = { subjectSummary, studentSummary, register, sessionList, recentActivity, reportSummary, percentage, summarizeAttendanceRecords };