'use strict';

const express = require('express');
const multer = require('multer');
const asyncHandler = require('../utils/asyncHandler');
const controller = require('../controllers/faceVerificationController');

const maxBytes = Number(process.env.FACE_MAX_IMAGE_BYTES || 5242880);
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: maxBytes, files: 1 },
  fileFilter: (req, file, callback) => callback(null, /^image\/(jpeg|png|webp)$/.test(file.mimetype))
});
const router = express.Router();
router.get('/status', asyncHandler(controller.status));
router.post('/verify', upload.single('image'), asyncHandler(controller.verify));
router.post('/enroll', upload.single('image'), asyncHandler(controller.enroll));

module.exports = router;