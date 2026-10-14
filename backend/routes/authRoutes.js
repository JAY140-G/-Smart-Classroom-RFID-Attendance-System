'use strict';

const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const controller = require('../controllers/authController');
const { requireAuth } = require('../middleware/authentication');

const router = express.Router();
router.post('/login', asyncHandler(controller.login));
router.post('/bootstrap', asyncHandler(controller.bootstrap));
router.post('/admin/password-reset', asyncHandler(controller.resetAdminPassword));
router.get('/me', requireAuth, asyncHandler(controller.current));
router.post('/logout', requireAuth, asyncHandler(controller.logout));

module.exports = router;
