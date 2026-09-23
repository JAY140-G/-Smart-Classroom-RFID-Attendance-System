'use strict';

const mongoose = require('mongoose');

const attendanceRecordSchema = new mongoose.Schema({
  studentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Student',
    required: true,
    index: true
  },
  subjectId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Subject',
    required: true,
    index: true
  },
  sessionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'AttendanceSession',
    required: true,
    index: true
  },
  date: {
    type: Date,
    required: true
  },
  currentState: {
    type: String,
    enum: ['NOT_SCANNED', 'IN_CLASS', 'OUTSIDE'],
    default: 'NOT_SCANNED',
    required: true
  },
  finalState: {
    type: String,
    enum: ['IN_CLASS', 'OUTSIDE', 'NOT_SCANNED'],
    default: null
  },
  finalStatus: {
    type: String,
    enum: ['PRESENT', 'LEFT_EARLY', 'ABSENT'],
    default: null
  }
}, { timestamps: true });

attendanceRecordSchema.index({ studentId: 1, sessionId: 1 }, { unique: true });

module.exports = mongoose.model('AttendanceRecord', attendanceRecordSchema);