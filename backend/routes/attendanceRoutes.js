'use strict';

const express = require('express');
const multer = require('multer');
const AppError = require('../utils/AppError');
const asyncHandler = require('../utils/asyncHandler');
const controller = require('../controllers/attendanceController');

const router = express.Router();
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const scanUpload = multer({
	storage: multer.memoryStorage(),
	limits: { fileSize: Number(process.env.FACE_MAX_IMAGE_BYTES || 5242880), files: 1 },
	fileFilter: (req, file, callback) => callback(null, /^image\/(jpeg|png|webp)$/.test(file.mimetype))
});

function validateIdempotencyKey(req, res, next) {
  const key = req.get('Idempotency-Key');
  if (typeof key !== 'string' || !UUID_PATTERN.test(key)) {
    return next(new AppError('A valid UUID Idempotency-Key header is required', 400));
  }
  req.idempotencyKey = key.toLowerCase();
  return next();
}

router.post('/session/start', asyncHandler(controller.start));
router.get('/session/active', asyncHandler(controller.active));
router.post('/session/:id/close', asyncHandler(controller.close));
router.post('/scan', validateIdempotencyKey, scanUpload.single('image'), asyncHandler(controller.scan));
router.get('/live/:sessionId', asyncHandler(controller.live));
router.get('/student/:studentId/subject/:subjectId', asyncHandler(controller.subject));
router.get('/student/:studentId', asyncHandler(controller.student));
router.get('/register', asyncHandler(controller.attendanceRegister));

module.exports = router;