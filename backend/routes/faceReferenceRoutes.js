'use strict';

const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const controller = require('../controllers/faceReferenceController');

const router = express.Router();
router.get('/status', asyncHandler(controller.status));
router.get('/', asyncHandler(controller.list));
router.get('/:id', asyncHandler(controller.get));
router.post('/', asyncHandler(controller.create));
router.delete('/:id', asyncHandler(controller.deactivate));

module.exports = router;