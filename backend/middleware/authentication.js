'use strict';

const { createHash, timingSafeEqual } = require('node:crypto');
const authService = require('../services/authService');
const AppError = require('../utils/AppError');

function bearerToken(req) {
  const authorization = req.get('Authorization');
  const match = typeof authorization === 'string' && authorization.match(/^Bearer ([A-Za-z0-9_-]{40,})$/);
  return match ? match[1] : null;
}

async function requireAuth(req, res, next) {
  const token = bearerToken(req);
  if (!token) return next(new AppError('Authentication required', 401));
  try {
    const authenticated = await authService.authenticateToken(token);
    if (!authenticated) return next(new AppError('Authentication required', 401));
    req.auth = { token, session: authenticated.session, user: authenticated.user };
    return next();
  } catch (error) {
    return next(error);
  }
}

function allowRoles(...roles) {
  return (req, res, next) => {
    if (!req.auth?.user) return next(new AppError('Authentication required', 401));
    if (!roles.includes(req.auth.user.role)) return next(new AppError('Insufficient permissions', 403));
    return next();
  };
}

function requireDeviceKey(req, res, next) {
  const configuredKey = process.env.AUTH_DEVICE_KEY;
  if (typeof configuredKey !== 'string' || configuredKey.length < 32) {
    return next(new AppError('Attendance device authentication is not configured', 503));
  }
  const suppliedKey = req.get('X-Attendance-Device-Key');
  if (typeof suppliedKey !== 'string') return next(new AppError('Attendance device authentication required', 401));
  const suppliedDigest = createHash('sha256').update(suppliedKey).digest();
  const configuredDigest = createHash('sha256').update(configuredKey).digest();
  if (!timingSafeEqual(suppliedDigest, configuredDigest)) {
    return next(new AppError('Attendance device authentication required', 401));
  }
  return next();
}

function requireStudentSelf(paramName = 'studentId') {
  return async (req, res, next) => {
    if (req.auth?.user?.role !== 'STUDENT') return next();
    try {
      const Student = require('../models/Student');
      const student = await Student.findOne({ userId: req.auth.user._id, isActive: true }).select('_id');
      if (!student || String(req.params[paramName]) !== String(student._id)) {
        return next(new AppError('You can access only your own student data', 403));
      }
      req.auth.studentId = student._id;
      return next();
    } catch (error) {
      return next(error);
    }
  };
}

async function scopeTeacher(req, res, next) {
  if (req.auth?.user?.role !== 'TEACHER') return next();
  try {
    const Teacher = require('../models/Teacher');
    const teacher = await Teacher.findOne({ userId: req.auth.user._id }).select('_id');
    if (!teacher) return next(new AppError('Teacher account is not linked', 403));
    req.auth.teacherId = teacher._id;
    return next();
  } catch (error) {
    return next(error);
  }
}

async function authorizeTeacherSession(req, res, next) {
  if (req.auth?.user?.role !== 'TEACHER') return next();
  try {
    const AttendanceSession = require('../models/AttendanceSession');
    const session = await AttendanceSession.exists({ _id: req.params.sessionId, teacherId: req.auth.teacherId });
    if (!session) return next(new AppError('Attendance session not found', 404));
    return next();
  } catch (error) {
    return next(error);
  }
}

async function authorizeTeacherTimetable(req, res, next) {
  if (req.auth?.user?.role !== 'TEACHER') return next();
  try {
    const Timetable = require('../models/Timetable');
    const timetable = await Timetable.exists({ _id: req.params.id, teacherId: req.auth.teacherId });
    if (!timetable) return next(new AppError('Timetable not found', 404));
    return next();
  } catch (error) {
    return next(error);
  }
}

async function authorizeTeacherStudent(req, res, next) {
  if (req.auth?.user?.role !== 'TEACHER') return next();
  try {
    const Student = require('../models/Student');
    const Timetable = require('../models/Timetable');
    const assignedClasses = await Timetable.find({ teacherId: req.auth.teacherId }).distinct('classId');
    const student = await Student.exists({ _id: req.params.studentId, classId: { $in: assignedClasses } });
    if (!student) return next(new AppError('Student is outside your assigned classes', 403));
    return next();
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  requireAuth,
  allowRoles,
  requireDeviceKey,
  requireStudentSelf,
  scopeTeacher,
  authorizeTeacherSession,
  authorizeTeacherTimetable,
  authorizeTeacherStudent
};
