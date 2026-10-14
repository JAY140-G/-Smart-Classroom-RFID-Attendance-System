'use strict';

const express = require('express');
const multer = require('multer');
const AppError = require('../utils/AppError');
const asyncHandler = require('../utils/asyncHandler');
const controller = require('../controllers/attendanceController');
const liveScanController = require('../controllers/liveScanController');
const {
  requireAuth,
  allowRoles,
  requireDeviceKey,
  requireStudentSelf,
  scopeTeacher,
  authorizeTeacherSession,
  authorizeTeacherStudent
} = require('../middleware/authentication');

const router = express.Router();
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const scanUpload = multer({
	storage: multer.memoryStorage(),
	limits: { fileSize: Number(process.env.FACE_MAX_IMAGE_BYTES || 5242880), files: 1 },
	fileFilter: (req, file, callback) => callback(null, /^image\/(jpeg|png|webp)$/.test(file.mimetype))
});
const liveScanUpload = express.raw({
  type: 'image/jpeg',
  limit: Number(process.env.FACE_MAX_IMAGE_BYTES || 5242880)
});

function validateIdempotencyKey(req, res, next) {
  const key = req.get('Idempotency-Key');
  if (typeof key !== 'string' || !UUID_PATTERN.test(key)) {
    return next(new AppError('A valid UUID Idempotency-Key header is required', 400));
  }
  req.idempotencyKey = key.toLowerCase();
  return next();
}

router.post('/session/start', requireAuth, allowRoles('ADMIN', 'TEACHER'), scopeTeacher, asyncHandler(controller.start));
router.get('/session/active', requireAuth, allowRoles('ADMIN', 'TEACHER'), scopeTeacher, asyncHandler(controller.active));
router.post('/session/:id/close', requireAuth, allowRoles('ADMIN', 'TEACHER'), scopeTeacher, asyncHandler(controller.close));
router.get('/sessions', requireAuth, allowRoles('ADMIN', 'TEACHER'), scopeTeacher, asyncHandler(controller.sessions));
router.post('/scan', requireDeviceKey, validateIdempotencyKey, scanUpload.single('image'), asyncHandler(controller.scan));
router.post('/live-scans', requireDeviceKey, validateIdempotencyKey, express.json(), asyncHandler(liveScanController.create));
router.get('/live-scans/next', requireDeviceKey, asyncHandler(liveScanController.next));
router.get('/live-scan-records', requireAuth, allowRoles('ADMIN'), asyncHandler(liveScanController.recentScans));
router.get('/live-scans/:scanId', requireDeviceKey, asyncHandler(liveScanController.status));
router.get('/live-scans/:scanId/image', requireAuth, allowRoles('ADMIN'), asyncHandler(liveScanController.capturedImage));
router.post('/live-scans/:scanId/image', requireDeviceKey, (req, res, next) => {
  if (!req.is('image/jpeg')) return next(new AppError('Content-Type must be image/jpeg', 400));
  return next();
}, liveScanUpload, asyncHandler(liveScanController.image));
router.get('/virtual-scans/students', requireAuth, allowRoles('ADMIN'), asyncHandler(liveScanController.virtualStudents));
router.get('/virtual-scans/recent', requireAuth, allowRoles('ADMIN'), asyncHandler(liveScanController.virtualHistory));
router.post('/virtual-scans', requireAuth, allowRoles('ADMIN'), validateIdempotencyKey, express.json(), asyncHandler(liveScanController.createVirtual));
router.get('/virtual-scans/:scanId', requireAuth, allowRoles('ADMIN'), asyncHandler(liveScanController.virtualStatus));
router.get('/live/:sessionId', requireAuth, allowRoles('ADMIN', 'TEACHER'), scopeTeacher, authorizeTeacherSession, asyncHandler(controller.live));
router.get('/me', requireAuth, allowRoles('STUDENT'), asyncHandler(controller.me));
router.get('/timetable/me', requireAuth, allowRoles('STUDENT'), asyncHandler(controller.myTimetable));
router.get('/student/:studentId/subject/:subjectId', requireAuth, allowRoles('ADMIN', 'TEACHER', 'STUDENT'), scopeTeacher, authorizeTeacherStudent, requireStudentSelf(), asyncHandler(controller.subject));
router.get('/student/:studentId', requireAuth, allowRoles('ADMIN', 'TEACHER', 'STUDENT'), scopeTeacher, authorizeTeacherStudent, requireStudentSelf(), asyncHandler(controller.student));
router.get('/register', requireAuth, allowRoles('ADMIN', 'TEACHER'), scopeTeacher, asyncHandler(controller.attendanceRegister));
router.get('/report', requireAuth, allowRoles('ADMIN', 'TEACHER'), scopeTeacher, asyncHandler(controller.report));
router.get('/activity', requireAuth, allowRoles('ADMIN', 'TEACHER'), scopeTeacher, asyncHandler(controller.activity));

router.use((error, req, res, next) => {
  if (error.type === 'entity.too.large') {
    return res.status(413).json({ success: false, message: 'Image exceeds the configured size limit' });
  }
  return next(error);
});

module.exports = router;