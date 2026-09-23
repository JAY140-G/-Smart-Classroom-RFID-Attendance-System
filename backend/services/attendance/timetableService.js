'use strict';

const mongoose = require('mongoose');
const Timetable = require('../../models/Timetable');
const Class = require('../../models/Class');
const Subject = require('../../models/Subject');
const Teacher = require('../../models/Teacher');
const AppError = require('../../utils/AppError');

const DAYS = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'];
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

function assertObjectId(value, fieldName) {
  if (!mongoose.isValidObjectId(value)) {
    throw new AppError(`Invalid ${fieldName}`, 400);
  }
}

function validateTimes(startTime, endTime) {
  if (!TIME_PATTERN.test(startTime) || !TIME_PATTERN.test(endTime)) {
    throw new AppError('startTime and endTime must use HH:mm format', 400);
  }

  if (endTime <= startTime) {
    throw new AppError('endTime must be later than startTime', 400);
  }
}

async function validateReferences(data) {
  assertObjectId(data.classId, 'classId');
  assertObjectId(data.subjectId, 'subjectId');
  assertObjectId(data.teacherId, 'teacherId');

  const [classItem, subject, teacher] = await Promise.all([
    Class.findOne({ _id: data.classId, isActive: true }),
    Subject.findOne({ _id: data.subjectId, isActive: true }),
    Teacher.findById(data.teacherId)
  ]);

  if (!classItem) throw new AppError('Active class not found', 404);
  if (!subject) throw new AppError('Active subject not found', 404);
  if (!teacher) throw new AppError('Teacher not found', 404);
}

async function assertNoConflict(data, excludedId) {
  const query = {
    classId: data.classId,
    dayOfWeek: data.dayOfWeek,
    isActive: true,
    startTime: { $lt: data.endTime },
    endTime: { $gt: data.startTime }
  };

  if (excludedId) query._id = { $ne: excludedId };

  if (await Timetable.exists(query)) {
    throw new AppError('Timetable slot conflicts with an existing active slot for this class', 409);
  }
}

function normalizeInput(input) {
  return {
    classId: input.classId,
    subjectId: input.subjectId,
    teacherId: input.teacherId,
    dayOfWeek: typeof input.dayOfWeek === 'string' ? input.dayOfWeek.toUpperCase() : input.dayOfWeek,
    startTime: input.startTime,
    endTime: input.endTime,
    room: input.room,
    isActive: input.isActive === undefined ? true : input.isActive
  };
}

async function createTimetable(input) {
  const data = normalizeInput(input);
  if (!DAYS.includes(data.dayOfWeek)) throw new AppError('Invalid dayOfWeek', 400);
  validateTimes(data.startTime, data.endTime);
  await validateReferences(data);
  await assertNoConflict(data);
  return Timetable.create(data);
}

async function listTimetables(filters) {
  const query = {};
  ['classId', 'subjectId', 'teacherId'].forEach((field) => {
    if (filters[field]) {
      assertObjectId(filters[field], field);
      query[field] = filters[field];
    }
  });
  if (filters.dayOfWeek) query.dayOfWeek = filters.dayOfWeek.toUpperCase();
  if (filters.isActive !== undefined) query.isActive = filters.isActive === 'true' || filters.isActive === true;

  return Timetable.find(query)
    .populate('classId subjectId teacherId')
    .sort({ dayOfWeek: 1, startTime: 1 });
}

async function getTimetable(id) {
  assertObjectId(id, 'timetable id');
  const timetable = await Timetable.findById(id).populate('classId subjectId teacherId');
  if (!timetable) throw new AppError('Timetable not found', 404);
  return timetable;
}

async function updateTimetable(id, input) {
  assertObjectId(id, 'timetable id');
  const existing = await Timetable.findById(id);
  if (!existing) throw new AppError('Timetable not found', 404);

  const data = normalizeInput({ ...existing.toObject(), ...input });
  if (!DAYS.includes(data.dayOfWeek)) throw new AppError('Invalid dayOfWeek', 400);
  validateTimes(data.startTime, data.endTime);
  await validateReferences(data);
  if (data.isActive) await assertNoConflict(data, id);

  Object.assign(existing, data);
  await existing.save();
  return getTimetable(id);
}

async function deactivateTimetable(id) {
  assertObjectId(id, 'timetable id');
  const timetable = await Timetable.findByIdAndUpdate(id, { isActive: false }, { new: true });
  if (!timetable) throw new AppError('Timetable not found', 404);
  return timetable;
}

module.exports = {
  createTimetable,
  listTimetables,
  getTimetable,
  updateTimetable,
  deactivateTimetable
};