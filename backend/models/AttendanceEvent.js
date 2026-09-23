'use strict';

const mongoose = require('mongoose');

const attendanceEventSchema = new mongoose.Schema({
  studentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Student',
    required: true,
    index: true
  },
  sessionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'AttendanceSession',
    required: true,
    index: true
  },
  type: {
    type: String,
    enum: ['ENTRY', 'EXIT'],
    required: true
  },
  timestamp: {
    type: Date,
    required: true
  },
  rfidUid: {
    type: String,
    required: true,
    trim: true,
    uppercase: true
  },
  faceVerified: {
    type: Boolean,
    required: true
  },
  verificationStatus: {
    type: String,
    enum: ['VERIFIED', 'REJECTED'],
    required: true
  }
}, { timestamps: true });

attendanceEventSchema.index({ sessionId: 1, timestamp: 1 });

module.exports = mongoose.model('AttendanceEvent', attendanceEventSchema);