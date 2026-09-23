'use strict';

const mongoose = require('mongoose');
const AttendanceSession = require('../../models/AttendanceSession');
const AttendanceRecord = require('../../models/AttendanceRecord');
const Student = require('../../models/Student');
const { subjectSummary } = require('./attendanceAnalyticsService');
const AppError = require('../../utils/AppError');

async function getLiveAttendance(sessionId) {
  if (!mongoose.isValidObjectId(sessionId)) throw new AppError('Invalid session id', 400);
  const session = await AttendanceSession.findById(sessionId).populate('timetableId classId subjectId teacherId');
  if (!session) throw new AppError('Attendance session not found', 404);
  if (session.status !== 'ACTIVE') throw new AppError('Live attendance is available only for active sessions', 400);

  const students = await Student.find({ classId: session.classId._id, isActive: { $ne: false } }).sort({ rollNumber: 1 });
  const records = await AttendanceRecord.find({ sessionId });
  const recordsByStudent = new Map(records.map((record) => [String(record.studentId), record]));
  const studentsWithAttendance = await Promise.all(students.map(async (student) => {
    const record = recordsByStudent.get(String(student._id));
    const summary = await subjectSummary(student._id, session.subjectId._id);
    return {
      student: { _id: student._id, name: student.name, rollNumber: student.rollNumber },
      currentState: record ? record.currentState : 'NOT_SCANNED',
      subjectAttendancePercentage: summary.attendancePercentage
    };
  }));

  const counts = studentsWithAttendance.reduce((result, item) => {
    result.totalStudents += 1;
    const countKey = {
      IN_CLASS: 'inClass',
      OUTSIDE: 'outside',
      NOT_SCANNED: 'notScanned'
    }[item.currentState];
    result[countKey] += 1;
    return result;
  }, { totalStudents: 0, inClass: 0, outside: 0, notScanned: 0 });

  return { session, counts, students: studentsWithAttendance };
}

module.exports = { getLiveAttendance };