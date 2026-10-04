'use strict';

const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const controller = require('../controllers/timetableController');
const { requireAuth, allowRoles, scopeTeacher, authorizeTeacherTimetable } = require('../middleware/authentication');

const router = express.Router();

router.use(requireAuth, allowRoles('ADMIN', 'TEACHER'), scopeTeacher);
router.post('/', allowRoles('ADMIN'), asyncHandler(controller.create));
router.get('/', asyncHandler(controller.list));
router.get('/:id', authorizeTeacherTimetable, asyncHandler(controller.getById));
router.put('/:id', allowRoles('ADMIN'), asyncHandler(controller.update));
router.delete('/:id', allowRoles('ADMIN'), asyncHandler(controller.remove));

module.exports = router;