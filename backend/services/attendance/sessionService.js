'use strict';

const mongoose = require('mongoose');
const Timetable = require('../../models/Timetable');
const AttendanceSession = require('../../models/AttendanceSession');
const Class = require('../../models/Class');
const Subject = require('../../models/Subject');
const Teacher = require('../../models/Teacher');
const AppError = require('../../utils/AppError');

function formatDateKey(date) {
  return date.toISOString().slice(0, 10);
}

function getDayName(date) {
  return ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'][date.getDay()];
}

function populateSession(query) {
  return query.populate([
    { path: 'timetableId' },
    { path: 'classId' },
    { path: 'subjectId' },
    { path: 'teacherId' }
  ]);
}

async function startSession(timetableId) {
  if (!mongoose.isValidObjectId(timetableId)) throw new AppError('Invalid timetable id', 400);
  const timetable = await Timetable.findOne({ _id: timetableId, isActive: true });
  if (!timetable) throw new AppError('Active timetable not found', 404);

  const now = new Date();
  if (timetable.dayOfWeek !== getDayName(now)) {
    throw new AppError('Timetable is not scheduled for today', 400);
  }

  const [classItem, subject, teacher] = await Promise.all([
    Class.findOne({ _id: timetable.classId, isActive: true }),
    Subject.findOne({ _id: timetable.subjectId, isActive: true }),
    Teacher.findById(timetable.teacherId)
  ]);
  if (!classItem) throw new AppError('Active class not found for timetable', 404);
  if (!subject) throw new AppError('Active subject not found for timetable', 404);
  if (!teacher) throw new AppError('Teacher not found for timetable', 404);

  const dateStart = new Date(`${formatDateKey(now)}T00:00:00.000Z`);
  const dateEnd = new Date(`${formatDateKey(now)}T23:59:59.999Z`);
  const existingSession = await AttendanceSession.findOne({
    timetableId,
    date: { $gte: dateStart, $lte: dateEnd },
    status: 'ACTIVE'
  });
  if (existingSession) throw new AppError('An active session already exists for this timetable today', 409);

  const session = await AttendanceSession.create({
    timetableId: timetable._id,
    classId: timetable.classId,
    subjectId: timetable.subjectId,
    teacherId: timetable.teacherId,
    date: now,
    startTime: timetable.startTime,
    endTime: timetable.endTime,
    status: 'ACTIVE'
  });

  return populateSession(AttendanceSession.findById(session._id));
}

async function getActiveSession(filters = {}) {
  const query = { status: 'ACTIVE' };
  for (const field of ['classId', 'teacherId']) {
    if (filters[field]) {
      if (!mongoose.isValidObjectId(filters[field])) throw new AppError(`Invalid ${field}`, 400);
      query[field] = filters[field];
    }
  }

  const sessions = await populateSession(AttendanceSession.find(query).sort({ createdAt: -1 }));
  if (sessions.length > 1 && !filters.classId && !filters.teacherId) {
    throw new AppError('Multiple active sessions exist; filter by classId or teacherId', 409);
  }
  return sessions[0] || null;
}

async function getSession(id) {
  if (!mongoose.isValidObjectId(id)) throw new AppError('Invalid session id', 400);
  const session = await populateSession(AttendanceSession.findById(id));
  if (!session) throw new AppError('Attendance session not found', 404);
  return session;
}

module.exports = { startSession, getActiveSession, getSession };