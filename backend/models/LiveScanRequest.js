'use strict';

const mongoose = require('mongoose');

const liveScanRequestSchema = new mongoose.Schema({
  scanId: {
    type: String,
    required: true,
    unique: true
  },
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
  source: {
    type: String,
    enum: ['RFID', 'VIRTUAL'],
    default: 'RFID',
    required: true
  },
  studentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Student'
  },
  virtualRfidUid: {
    type: String,
    trim: true,
    uppercase: true
  },
  studentName: {
    type: String,
    trim: true
  },
  sessionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'AttendanceSession'
  },
  status: {
    type: String,
    enum: ['WAITING_CAMERA', 'PROCESSING', 'SUCCEEDED', 'FAILED', 'EXPIRED'],
    required: true,
    default: 'WAITING_CAMERA'
  },
  expiresAt: {
    type: Date,
    required: true
  },
  purgeAt: {
    type: Date,
    required: true,
    expires: 0
  },
  result: {
    eventType: { type: String, enum: ['ENTRY', 'EXIT'] },
    currentState: { type: String, enum: ['IN_CLASS', 'OUTSIDE'] },
    message: { type: String },
    reason: { type: String }
  }
}, { timestamps: true });

liveScanRequestSchema.index({ status: 1, createdAt: 1 });
liveScanRequestSchema.index({ source: 1, createdAt: -1 });

module.exports = mongoose.model('LiveScanRequest', liveScanRequestSchema);
