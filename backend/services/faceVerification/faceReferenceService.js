'use strict';

const mongoose = require('mongoose');
const FaceReference = require('../../models/FaceReference');
const Student = require('../../models/Student');
const AppError = require('../../utils/AppError');
const { enrollFace } = require('./faceVerificationService');

function assertId(value, name) {
  if (!mongoose.isValidObjectId(value)) throw new AppError(`Invalid ${name}`, 400);
}

async function createReference(input) {
  assertId(input.studentId, 'studentId');
  const student = await Student.findById(input.studentId);
  if (!student) throw new AppError('Student not found', 404);
  const enrollment = await enrollFace({ student, imageBuffer: input.imageBuffer, referenceType: input.referenceType });
  if (!enrollment.configured) throw new AppError(enrollment.message || enrollment.reason || 'Face verification service unavailable', 503);
  await FaceReference.updateMany({ studentId: student._id, isActive: true }, { $set: { isActive: false, status: 'INACTIVE' } });
  return FaceReference.create({ ...enrollment.reference, status: 'ACTIVE', isActive: true });
}

async function listReferences() {
  return FaceReference.find().select('-referenceData -metadata').populate('studentId', 'name rollNumber classId');
}

async function getReference(id) {
  assertId(id, 'face reference id');
  const reference = await FaceReference.findById(id).select('-referenceData -metadata').populate('studentId', 'name rollNumber classId');
  if (!reference) throw new AppError('Face reference not found', 404);
  return reference;
}

async function deactivateReference(id) {
  assertId(id, 'face reference id');
  const reference = await FaceReference.findByIdAndUpdate(id, { isActive: false, status: 'INACTIVE' }, { new: true }).select('-referenceData -metadata');
  if (!reference) throw new AppError('Face reference not found', 404);
  return reference;
}

module.exports = { createReference, listReferences, getReference, deactivateReference };