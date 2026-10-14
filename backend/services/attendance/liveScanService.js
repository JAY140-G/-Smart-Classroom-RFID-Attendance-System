'use strict';

const { randomUUID } = require('node:crypto');
const mongoose = require('mongoose');
const LiveScanRequest = require('../../models/LiveScanRequest');
const LiveScanImage = require('../../models/LiveScanImage');
const Student = require('../../models/Student');
const FaceReference = require('../../models/FaceReference');
const { processScan } = require('./attendanceService');
const AppError = require('../../utils/AppError');

const CAPTURE_WINDOW_MS = 30000;
const RESULT_RETENTION_MS = 10 * 60 * 1000;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const RFID_UID_PATTERN = /^(?:[0-9a-f]{8}|[0-9a-f]{14}|[0-9a-f]{20})$/i;
const VIRTUAL_UID_PATTERN = /^V-[0-9A-F]{24}$/;
const DEFAULT_IMAGE_RETENTION_MINUTES = 10;
const MAX_IMAGE_RETENTION_MINUTES = 60;

function statusResponse(request, { includeVirtualRfidUid = false } = {}) {
  const response = {
    protocolVersion: 1,
    scanId: request.scanId,
    status: request.status,
    source: request.source || 'RFID'
  };
  if (includeVirtualRfidUid && request.source === 'VIRTUAL') {
    response.virtualRfidUid = request.virtualRfidUid;
  }
  if (request.status === 'SUCCEEDED') {
    response.result = {
      eventType: request.result.eventType,
      currentState: request.result.currentState,
      message: request.result.message,
      reason: request.result.reason
    };
  } else if (request.status === 'FAILED') {
    response.result = {
      message: request.result.message,
      reason: request.result.reason
    };
  }
  return response;
}

function failureMessage(error) {
  if (error.reason === 'IMAGE_RETENTION_CONFIG_INVALID') {
    return 'Image retention configuration is invalid; attendance was not marked.';
  }
  if (error.reason === 'IMAGE_STORAGE_UNAVAILABLE') {
    return 'Captured image could not be retained securely; attendance was not marked.';
  }
  if (error.statusCode === 503) return 'Face verification service is unavailable.';
  if (error.reason === 'NO_FACE_REFERENCE') {
    return 'Student has no active face enrollment.';
  }
  if (error.reason === 'RFID_NOT_RECOGNIZED') return 'Student not found for this RFID.';
  if (error.reason === 'NO_ACTIVE_SESSION') return 'No active attendance session was found.';
  if (error.statusCode === 403) {
    const messages = {
      FACE_MISMATCH: 'Captured face did not match the enrolled reference.',
      NO_FACE: 'No face was detected in the camera image.',
      MULTIPLE_FACES: 'More than one face was detected; scan rejected.',
      NO_FACE_REFERENCE: 'No active face reference is enrolled for this student.',
      SESSION_CLASS_MISMATCH: 'Student does not belong to this attendance session.',
      INVALID_IMAGE: 'Camera image is invalid or could not be decoded.',
      IMAGE_TOO_LARGE: 'Camera image exceeds the configured size limit.',
      THRESHOLD_NOT_CONFIGURED: 'Face matching threshold is not configured.'
    };
    return messages[error.reason] || 'Face verification failed.';
  }
  if (error.statusCode === 404) return 'Student or attendance session was not found.';
  if (error.statusCode === 400) return 'The scan request or image is invalid.';
  return 'The scan could not be completed.';
}

async function storeScan(scan) {
  try {
    return await LiveScanRequest.create(scan);
  } catch (error) {
    if (error.code !== 11000) throw error;
    const existing = await LiveScanRequest.findOne({ idempotencyKey: scan.idempotencyKey });
    if (!existing) throw error;
    const sameSession = String(existing.sessionId || '') === String(scan.sessionId || '');
    const sameSource = (existing.source || 'RFID') === scan.source;
    const sameVirtualUid = (existing.virtualRfidUid || '') === (scan.virtualRfidUid || '');
    const sameStudent = String(existing.studentId || '') === String(scan.studentId || '');
    if (
      existing.rfidUid !== scan.rfidUid
      || !sameSession
      || !sameSource
      || !sameVirtualUid
      || !sameStudent
    ) {
      throw new AppError('Idempotency-Key was already used for a different scan', 409);
    }
    return existing;
  }
}

function makeScan({
  rfidUid,
  sessionId,
  idempotencyKey,
  source,
  studentId,
  studentName,
  virtualRfidUid
}) {
  if (sessionId && !mongoose.isValidObjectId(sessionId)) {
    throw new AppError('Invalid session id', 400);
  }
  if (typeof idempotencyKey !== 'string' || !UUID_PATTERN.test(idempotencyKey)) {
    throw new AppError('A valid UUID Idempotency-Key header is required', 400);
  }
  if (source === 'RFID' && (
    typeof rfidUid !== 'string'
    || !RFID_UID_PATTERN.test(rfidUid.trim())
  )) {
    throw new AppError('rfidUid must be a 4, 7, or 10 byte hexadecimal UID', 400);
  }
  if (source === 'VIRTUAL' && (
    !mongoose.isValidObjectId(studentId)
    || typeof virtualRfidUid !== 'string'
    || !VIRTUAL_UID_PATTERN.test(virtualRfidUid)
  )) {
    throw new AppError('A valid virtual student identity is required', 400);
  }

  const now = new Date();
  const normalizedKey = idempotencyKey.toLowerCase();
  const expiresAt = new Date(now.getTime() + CAPTURE_WINDOW_MS);
  return {
    scanId: randomUUID(),
    idempotencyKey: normalizedKey,
    rfidUid: rfidUid.trim().toUpperCase(),
    source,
    ...(studentId ? { studentId } : {}),
    ...(studentName ? { studentName } : {}),
    ...(virtualRfidUid ? { virtualRfidUid: virtualRfidUid.toUpperCase() } : {}),
    ...(sessionId ? { sessionId } : {}),
    status: 'WAITING_CAMERA',
    expiresAt,
    purgeAt: new Date(expiresAt.getTime() + RESULT_RETENTION_MS)
  };

}

async function createScan({ rfidUid, sessionId, idempotencyKey }) {
  if (typeof rfidUid !== 'string' || !RFID_UID_PATTERN.test(rfidUid.trim())) {
    throw new AppError('rfidUid must be a 4, 7, or 10 byte hexadecimal UID', 400);
  }
  const normalizedUid = rfidUid.trim().toUpperCase();
  const student = await Student.findOne({ rfidUid: normalizedUid, isActive: true });
  if (!student) {
    const error = new AppError('Student not found for this RFID', 404);
    error.reason = 'RFID_NOT_RECOGNIZED';
    throw error;
  }
  if (!await FaceReference.exists({
    studentId: student._id,
    isActive: true,
    status: 'ACTIVE'
  })) {
    const error = new AppError('Student has no active face enrollment', 409);
    error.reason = 'NO_FACE_REFERENCE';
    throw error;
  }
  return storeScan(makeScan({
    rfidUid: normalizedUid,
    sessionId,
    idempotencyKey,
    source: 'RFID',
    studentId: student._id,
    studentName: student.name
  }));
}

async function getVirtualStudents() {
  const students = await Student.find({ isActive: true })
    .select('_id name rollNumber classId virtualRfidUid')
    .sort({ name: 1, rollNumber: 1 });

  await Promise.all(students.map(async (student) => {
    if (student.virtualRfidUid) return;
    const virtualRfidUid = `V-${String(student._id).toUpperCase()}`;
    await Student.updateOne(
      {
        _id: student._id,
        $or: [
          { virtualRfidUid: { $exists: false } },
          { virtualRfidUid: null },
          { virtualRfidUid: '' }
        ]
      },
      { $set: { virtualRfidUid } }
    );
    student.virtualRfidUid = virtualRfidUid;
  }));

  const references = await FaceReference.find({ isActive: true, status: 'ACTIVE' }).select('studentId');
  const enrolledStudentIds = new Set(references.map((reference) => String(reference.studentId)));
  return students.map((student) => ({
    studentId: String(student._id),
    name: student.name,
    rollNumber: student.rollNumber,
    classId: String(student.classId),
    virtualRfidUid: student.virtualRfidUid,
    faceEnrolled: enrolledStudentIds.has(String(student._id))
  }));
}

async function createVirtualScan({ virtualRfidUid, sessionId, idempotencyKey }) {
  if (typeof virtualRfidUid !== 'string' || !VIRTUAL_UID_PATTERN.test(virtualRfidUid)) {
    throw new AppError('A valid virtual RFID UID is required', 400);
  }
  if (typeof process.env.AUTH_DEVICE_KEY !== 'string' || process.env.AUTH_DEVICE_KEY.length < 32) {
    throw new AppError('Attendance device authentication is not configured', 503, { expose: true });
  }
  const normalizedVirtualUid = virtualRfidUid.toUpperCase();
  const student = await Student.findOne({
    virtualRfidUid: normalizedVirtualUid,
    isActive: true
  });
  if (!student) throw new AppError('Virtual RFID UID not recognized', 404);
  if (!await FaceReference.exists({
    studentId: student._id,
    isActive: true,
    status: 'ACTIVE'
  })) {
    throw new AppError('Student has no active face enrollment', 409);
  }
  return storeScan(makeScan({
    rfidUid: student.rfidUid,
    studentId: student._id,
    studentName: student.name,
    virtualRfidUid: normalizedVirtualUid,
    sessionId,
    idempotencyKey,
    source: 'VIRTUAL'
  }));
}

async function getNextScan() {
  const scan = await LiveScanRequest.findOne({
    status: 'WAITING_CAMERA',
    expiresAt: { $gt: new Date() }
  }).sort({ createdAt: 1 });
  return scan ? { scanId: scan.scanId, expiresAt: scan.expiresAt } : null;
}

async function getScanStatus(scanId, source) {
  if (!UUID_PATTERN.test(scanId || '')) throw new AppError('Invalid scan id', 400);
  const filter = { scanId, ...(source ? { source } : {}) };
  let scan = await LiveScanRequest.findOne(filter);
  if (!scan) throw new AppError('Scan request not found', 404);

  if (scan.status === 'WAITING_CAMERA' && scan.expiresAt <= new Date()) {
    scan = await LiveScanRequest.findOneAndUpdate(
      { ...filter, status: 'WAITING_CAMERA', expiresAt: { $lte: new Date() } },
      { $set: { status: 'EXPIRED' } },
      { new: true }
    ) || scan;
  }
  return statusResponse(scan, { includeVirtualRfidUid: source === 'VIRTUAL' });
}

async function getVirtualScanStatus(scanId) {
  return getScanStatus(scanId, 'VIRTUAL');
}

async function getRecentVirtualScans() {
  const scans = await LiveScanRequest.find({ source: 'VIRTUAL' })
    .sort({ createdAt: -1 })
    .limit(20)
    .populate('studentId', 'name rollNumber')
    .lean();
  return scans.map((scan) => ({
    ...statusResponse(scan, { includeVirtualRfidUid: true }),
    student: scan.studentId
      ? { name: scan.studentId.name, rollNumber: scan.studentId.rollNumber }
      : null,
    createdAt: scan.createdAt
  }));
}

async function getRecentScans() {
  const scans = await LiveScanRequest.find()
    .sort({ createdAt: -1 })
    .limit(20)
    .populate('studentId', 'name rollNumber')
    .lean();
  const retainedImages = scans.length
    ? await LiveScanImage.find({
      scanId: { $in: scans.map((scan) => scan.scanId) },
      expiresAt: { $gt: new Date() }
    }).select('scanId')
    : [];
  const imageScanIds = new Set(retainedImages.map((image) => image.scanId));
  return scans.map((scan) => ({
    ...statusResponse(scan),
    imageAvailable: imageScanIds.has(scan.scanId),
    student: scan.studentId
      ? { name: scan.studentId.name, rollNumber: scan.studentId.rollNumber }
      : scan.studentName
        ? { name: scan.studentName, rollNumber: null }
        : null,
    createdAt: scan.createdAt
  }));
}

function imageRetentionExpiry() {
  const configured = process.env.LIVE_SCAN_IMAGE_RETENTION_MINUTES;
  const minutes = configured === undefined || configured === ''
    ? DEFAULT_IMAGE_RETENTION_MINUTES
    : Number(configured);
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > MAX_IMAGE_RETENTION_MINUTES) {
    const error = new AppError(
      `LIVE_SCAN_IMAGE_RETENTION_MINUTES must be an integer from 1 to ${MAX_IMAGE_RETENTION_MINUTES}`,
      500
    );
    error.reason = 'IMAGE_RETENTION_CONFIG_INVALID';
    throw error;
  }
  return new Date(Date.now() + minutes * 60 * 1000);
}

async function getCapturedImage(scanId) {
  if (!UUID_PATTERN.test(scanId || '')) throw new AppError('Invalid scan id', 400);
  const image = await LiveScanImage.findOne({
    scanId,
    expiresAt: { $gt: new Date() }
  }).select('+imageData');
  if (!image) throw new AppError('Captured image not found or retention expired', 404);
  return image;
}

async function completeScan(scanId, imageBuffer) {
  if (!UUID_PATTERN.test(scanId || '')) throw new AppError('Invalid scan id', 400);
  const now = new Date();
  const scan = await LiveScanRequest.findOneAndUpdate(
    { scanId, status: 'WAITING_CAMERA', expiresAt: { $gt: now } },
    { $set: { status: 'PROCESSING' } },
    { new: true }
  );

  if (!scan) return getScanStatus(scanId);

  try {
    const expiresAt = imageRetentionExpiry();
    try {
      await LiveScanImage.create({
        scanId,
        imageData: imageBuffer,
        expiresAt
      });
    } catch (storageError) {
      console.error('Live scan image retention write failed:', storageError.name);
      const retentionError = new AppError('Captured image could not be retained securely', 503);
      retentionError.reason = 'IMAGE_STORAGE_UNAVAILABLE';
      throw retentionError;
    }
    const result = await processScan({
      rfidUid: scan.rfidUid,
      ...(scan.source === 'VIRTUAL' ? {
        source: 'VIRTUAL',
        studentId: scan.studentId,
        virtualRfidUid: scan.virtualRfidUid
      } : {}),
      imageBuffer,
      ...(scan.sessionId ? { sessionId: scan.sessionId } : {}),
      idempotencyKey: scan.idempotencyKey
    });
    const completed = await LiveScanRequest.findOneAndUpdate(
      { _id: scan._id, status: 'PROCESSING' },
      {
        $set: {
          status: 'SUCCEEDED',
          result: {
            eventType: result.event.type,
            currentState: result.record.currentState,
            message: `${result.event.type} recorded.`,
            reason: 'VERIFIED'
          }
        }
      },
      { new: true }
    );
    if (!completed) throw new AppError('Scan result could not be saved', 500);
    return statusResponse(completed);
  } catch (error) {
    const reason = error.reason || 'SCAN_FAILED';
    const failed = await LiveScanRequest.findOneAndUpdate(
      { _id: scan._id, status: 'PROCESSING' },
      {
        $set: {
          status: 'FAILED',
          result: {
            message: failureMessage(error),
            reason
          }
        }
      },
      { new: true }
    );
    if (!failed) throw error;
    return statusResponse(failed);
  }
}

module.exports = {
  createScan,
  getVirtualStudents,
  getRecentScans,
  createVirtualScan,
  getNextScan,
  getScanStatus,
  getVirtualScanStatus,
  getRecentVirtualScans,
  getCapturedImage,
  completeScan
};
