'use strict';

const express = require('express');
const multer = require('multer');
const asyncHandler = require('../utils/asyncHandler');
const controller = require('../controllers/attendanceController');

const router = express.Router();
const scanUpload = multer({
	storage: multer.memoryStorage(),
	limits: { fileSize: Number(process.env.FACE_MAX_IMAGE_BYTES || 5242880), files: 1 },
	fileFilter: (req, file, callback) => callback(null, /^image\/(jpeg|png|webp)$/.test(file.mimetype))
});

router.post('/session/start', asyncHandler(controller.start));
router.get('/session/active', asyncHandler(controller.active));
router.post('/session/:id/close', asyncHandler(controller.close));
router.post('/scan', scanUpload.single('image'), asyncHandler(controller.scan));
router.get('/live/:sessionId', asyncHandler(controller.live));
router.get('/student/:studentId/subject/:subjectId', asyncHandler(controller.subject));
router.get('/student/:studentId', asyncHandler(controller.student));
router.get('/register', asyncHandler(controller.attendanceRegister));

module.exports = router;