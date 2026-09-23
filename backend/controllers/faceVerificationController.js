'use strict';

const Student = require('../models/Student');
const FaceReference = require('../models/FaceReference');
const AppError = require('../utils/AppError');
const { verifyFace, getInitializedProviderStatus } = require('../services/faceVerification/faceVerificationService');
const { createReference } = require('../services/faceVerification/faceReferenceService');

async function verify(req, res) {
  if (!req.body.studentId) throw new AppError('studentId is required', 400);
  if (!req.file) throw new AppError('A JPEG, PNG, or WebP image is required', 400);
  const student = await Student.findById(req.body.studentId);
  if (!student) throw new AppError('Student not found', 404);
  const reference = await FaceReference.findOne({ studentId: student._id, isActive: true }).select('+referenceData');
  if (!reference) return res.status(404).json({ success: false, message: 'Student has no enrolled face reference', data: { reason: 'NO_FACE_REFERENCE' } });
  const result = await verifyFace({ student, imageBuffer: req.file?.buffer, referenceData: reference.referenceData });
  const statusCode = result.status === 'SERVICE_UNAVAILABLE' ? 503 : result.verified ? 200 : 422;
  return res.status(statusCode).json({ success: result.verified, data: { verified: result.verified, reason: result.reason || result.status, metric: result.metric ?? null, threshold: result.threshold ?? null } });
}

async function enroll(req, res) {
  if (!req.file) throw new AppError('A JPEG, PNG, or WebP image is required', 400);
  const student = await Student.findById(req.body.studentId);
  if (!student) throw new AppError('Student not found', 404);
  const reference = await createReference({ studentId: student._id, imageBuffer: req.file.buffer, referenceType: 'embedding' });
  return res.status(201).json({ success: true, data: { status: reference.status, provider: reference.provider, model: reference.model } });
}

async function status(req, res) {
  res.status(200).json({ success: true, data: await getInitializedProviderStatus() });
}

module.exports = { verify, enroll, status };