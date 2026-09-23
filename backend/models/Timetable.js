'use strict';

const mongoose = require('mongoose');

const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;

const timetableSchema = new mongoose.Schema({
  classId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Class',
    required: true,
    index: true
  },
  subjectId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Subject',
    required: true,
    index: true
  },
  teacherId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Teacher',
    required: true,
    index: true
  },
  dayOfWeek: {
    type: String,
    enum: ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'],
    required: true
  },
  startTime: {
    type: String,
    required: true,
    match: timePattern
  },
  endTime: {
    type: String,
    required: true,
    match: timePattern,
    validate: {
      validator(value) {
        return !this.startTime || value >= this.startTime;
      },
      message: 'endTime cannot be earlier than startTime'
    }
  },
  room: {
    type: String,
    trim: true
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, { timestamps: true });

timetableSchema.index({ classId: 1, dayOfWeek: 1, startTime: 1 });

module.exports = mongoose.model('Timetable', timetableSchema);