'use strict';

const mongoose = require('mongoose');

const liveScanImageSchema = new mongoose.Schema({
  scanId: {
    type: String,
    required: true,
    unique: true
  },
  imageData: {
    type: Buffer,
    required: true,
    select: false
  },
  capturedAt: {
    type: Date,
    required: true,
    default: Date.now
  },
  expiresAt: {
    type: Date,
    required: true,
    expires: 0
  }
}, { versionKey: false });

module.exports = mongoose.model('LiveScanImage', liveScanImageSchema);
