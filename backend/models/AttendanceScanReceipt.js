'use strict';

const mongoose = require('mongoose');

const attendanceScanReceiptSchema = new mongoose.Schema({
  idempotencyKey: {
    type: String,
    required: true,
    lowercase: true,
    trim: true,
    unique: true
  },
  rfidUid: {
    type: String,
    required: true,
    trim: true,
    uppercase: true
  },
  studentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Student',
    required: true
  },
  sessionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'AttendanceSession',
    required: true
  },
  response: {
    type: mongoose.Schema.Types.Mixed,
    required: true
  }
}, { timestamps: true });

module.exports = mongoose.model('AttendanceScanReceipt', attendanceScanReceiptSchema);
