'use strict';

const { createHash, timingSafeEqual } = require('node:crypto');
const express = require('express');
const AppError = require('../utils/AppError');

const router = express.Router();
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

function requireCameraTestKey(req, res, next) {
  const configuredKey = process.env.CAMERA_TEST_KEY;
  if (typeof configuredKey !== 'string' || configuredKey.length < 32) {
    return next(new AppError('Camera test authentication is not configured', 503));
  }

  const suppliedKey = req.get('X-Camera-Test-Key');
  if (typeof suppliedKey !== 'string') {
    return next(new AppError('Camera test authentication required', 401));
  }

  const suppliedDigest = createHash('sha256').update(suppliedKey).digest();
  const configuredDigest = createHash('sha256').update(configuredKey).digest();
  if (!timingSafeEqual(suppliedDigest, configuredDigest)) {
    return next(new AppError('Camera test authentication required', 401));
  }
  return next();
}

function isCompleteJpeg(buffer) {
  return Buffer.isBuffer(buffer)
    && buffer.length >= 4
    && buffer[0] === 0xff
    && buffer[1] === 0xd8
    && buffer[buffer.length - 2] === 0xff
    && buffer[buffer.length - 1] === 0xd9;
}

function requireJpegContentType(req, res, next) {
  const contentType = req.get('Content-Type');
  if (contentType && !req.is('image/jpeg')) {
    return next(new AppError('Content-Type must be image/jpeg', 400));
  }
  return next();
}

function receiveImage(req, res, next) {
  if (!isCompleteJpeg(req.body)) {
    return next(new AppError('Request body must contain a complete JPEG image', 400));
  }

  return res.status(200).json({
    success: true,
    message: 'Camera test image received',
    data: {
      received: true,
      contentType: 'image/jpeg',
      sizeBytes: req.body.length
    }
  });
}

router.post(
  '/image',
  requireCameraTestKey,
  requireJpegContentType,
  express.raw({ type: 'image/jpeg', limit: MAX_IMAGE_BYTES }),
  receiveImage
);

router.use((error, req, res, next) => {
  if (error.type === 'entity.too.large') {
    return res.status(413).json({ success: false, message: 'Image exceeds the 5 MB camera test limit' });
  }
  return next(error);
});

module.exports = router;
