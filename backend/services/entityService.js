'use strict';

const mongoose = require('mongoose');
const User = require('../models/User');
const Student = require('../models/Student');
const Teacher = require('../models/Teacher');
const Subject = require('../models/Subject');
const ClassModel = require('../models/Class');
const Timetable = require('../models/Timetable');
const AttendanceSession = require('../models/AttendanceSession');
const AttendanceRecord = require('../models/AttendanceRecord');
const AttendanceEvent = require('../models/AttendanceEvent');
const FaceReference = require('../models/FaceReference');
const AppError = require('../utils/AppError');

const definitions = {
  students: { model: Student, populate: 'classId', fields: 'name rollNumber classId rfidUid isActive userId' },
    teachers: { model: Teacher, populate: { path: 'userId', select: 'name email role' }, fields: 'name employeeId userId' },
  subjects: { model: Subject },
  classes: { model: ClassModel }
};

function definition(type) {
  const item = definitions[type];
  if (!item) throw new AppError('Unsupported entity', 400);
  return item;
}

function assertId(value, name = 'id') {
  if (!mongoose.isValidObjectId(value)) throw new AppError(`Invalid ${name}`, 400);
}

async function list(type, filters = {}) {
  const item = definition(type);
  const query = {};
  if (filters.isActive !== undefined && item.model.schema.path('isActive')) query.isActive = filters.isActive !== 'false';
  let request = item.model.find(query).select(item.fields || '');
    if (item.populate) request = request.populate(item.populate);
  return request.sort({ name: 1, createdAt: -1 });
}

async function get(type, id) {
  const item = definition(type);
  assertId(id);
  let request = item.model.findById(id).select(item.fields || '');
    if (item.populate) request = request.populate(item.populate);
  const value = await request;
  if (!value) throw new AppError(`${type.slice(0, -1)} not found`, 404);
  return value;
}

async function ensureUser({ userId, name, email, role, uniqueValue }) {
  if (userId) {
    assertId(userId, 'userId');
    const user = await User.findById(userId);
    if (!user) throw new AppError('User not found', 404);
    return user._id;
  }
  const normalizedEmail = (email || `${role.toLowerCase()}-${String(uniqueValue).toLowerCase()}@local.invalid`).toLowerCase();
  const user = await User.create({ name, email: normalizedEmail, password: 'AUTH_NOT_IMPLEMENTED', role });
  return user._id;
}

async function create(type, input) {
  const item = definition(type);
  const data = { ...input };
  if (type === 'students') {
    if (!data.name || !data.rollNumber || !data.classId || !data.rfidUid) throw new AppError('name, rollNumber, classId, and rfidUid are required', 400);
    assertId(data.classId, 'classId');
    if (!await ClassModel.exists({ _id: data.classId, isActive: true })) throw new AppError('Active class not found', 404);
    data.userId = await ensureUser({ ...data, role: 'STUDENT', uniqueValue: data.rollNumber });
  }
  if (type === 'teachers') {
    if (!data.name || !data.employeeId) throw new AppError('name and employeeId are required', 400);
    data.userId = await ensureUser({ ...data, role: 'TEACHER', uniqueValue: data.employeeId });
  }
  if (type === 'subjects' && !data.name) throw new AppError('name is required', 400);
  if (type === 'classes' && (!data.name || !data.section || !data.academicYear)) throw new AppError('name, section, and academicYear are required', 400);
  const created = await item.model.create(data);
  return get(type, created._id);
}

async function update(type, id, input) {
  const item = definition(type);
  assertId(id);
  const existing = await item.model.findById(id);
  if (!existing) throw new AppError(`${type.slice(0, -1)} not found`, 404);
  const data = { ...input };
  delete data._id;
  delete data.userId;
  if (type === 'students' && data.classId) {
    assertId(data.classId, 'classId');
    if (!await ClassModel.exists({ _id: data.classId, isActive: true })) throw new AppError('Active class not found', 404);
  }
  Object.assign(existing, data);
  await existing.save();
  return get(type, id);
}

async function remove(type, id) {
  const item = definition(type);
  assertId(id);
  const existing = await item.model.findById(id);
  if (!existing) throw new AppError(`${type.slice(0, -1)} not found`, 404);
  const dependencies = type === 'classes'
    ? await Promise.all([Student.exists({ classId: id }), Timetable.exists({ classId: id }), AttendanceSession.exists({ classId: id })])
    : type === 'subjects'
      ? await Promise.all([Timetable.exists({ subjectId: id }), AttendanceSession.exists({ subjectId: id }), AttendanceRecord.exists({ subjectId: id })])
      : type === 'teachers'
        ? await Promise.all([Timetable.exists({ teacherId: id }), AttendanceSession.exists({ teacherId: id })])
        : await Promise.all([AttendanceRecord.exists({ studentId: id }), AttendanceEvent.exists({ studentId: id }), FaceReference.exists({ studentId: id })]);
  if (dependencies.some(Boolean)) throw new AppError('This record is in use and cannot be deleted. Deactivate it instead.', 409);
  await item.model.deleteOne({ _id: id });
  if (type === 'students' || type === 'teachers') await User.deleteOne({ _id: existing.userId });
  return { id, deleted: true };
}

module.exports = { list, get, create, update, remove };