'use strict';

const timetableService = require('../services/attendance/timetableService');

async function create(req, res) {
  const timetable = await timetableService.createTimetable(req.body);
  res.status(201).json({ success: true, message: 'Timetable created', data: timetable });
}

async function list(req, res) {
  const timetables = await timetableService.listTimetables({
    ...req.query,
    ...(req.auth.teacherId ? { teacherId: req.auth.teacherId } : {})
  });
  res.status(200).json({ success: true, data: timetables });
}

async function getById(req, res) {
  const timetable = await timetableService.getTimetable(req.params.id);
  res.status(200).json({ success: true, data: timetable });
}

async function update(req, res) {
  const timetable = await timetableService.updateTimetable(req.params.id, req.body);
  res.status(200).json({ success: true, message: 'Timetable updated', data: timetable });
}

async function remove(req, res) {
  const timetable = await timetableService.deactivateTimetable(req.params.id);
  res.status(200).json({ success: true, message: 'Timetable deactivated', data: timetable });
}

module.exports = { create, list, getById, update, remove };