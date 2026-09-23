'use strict';

const mongoose = require('mongoose');

const faceReferenceSchema = new mongoose.Schema({
  studentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Student',
    required: true
  },
  provider: {
    type: String,
    trim: true
  },
  model: {
    type: String,
    trim: true
  },
  referenceType: {
    type: String,
    trim: true
  },
  referenceData: {
    type: mongoose.Schema.Types.Mixed,
    select: false
  },
  referenceImageUrl: {
    type: String,
    trim: true
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed
  },
  isActive: {
    type: Boolean,
    default: true
  },
  status: {
    type: String,
    enum: ['PENDING', 'ACTIVE', 'INACTIVE'],
    default: 'PENDING'
  }
}, { timestamps: true });

faceReferenceSchema.index(
  { studentId: 1 },
  { unique: true, partialFilterExpression: { isActive: true } }
);

module.exports = mongoose.model('FaceReference', faceReferenceSchema);