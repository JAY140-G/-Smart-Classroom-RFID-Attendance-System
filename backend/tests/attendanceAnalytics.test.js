'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const {
  percentage,
  summarizeAttendanceRecords,
  register
} = require('../services/attendance/attendanceAnalyticsService');

const mathSubject = { _id: 'subject-math', name: 'Mathematics' };
const scienceSubject = { _id: 'subject-science', name: 'Science' };

test('attendance percentages count only completed records and only PRESENT as attended', () => {
  const result = summarizeAttendanceRecords([
    { subjectId: mathSubject, sessionId: { status: 'CLOSED' }, finalStatus: 'PRESENT' },
    { subjectId: mathSubject, sessionId: { status: 'CLOSED' }, finalStatus: 'LEFT_EARLY' },
    { subjectId: mathSubject, sessionId: { status: 'CLOSED' }, finalStatus: 'ABSENT' },
    { subjectId: mathSubject, sessionId: { status: 'ACTIVE' }, finalStatus: null },
    { subjectId: scienceSubject, sessionId: { status: 'ACTIVE' }, finalStatus: null }
  ]);

  assert.equal(result.overall.presentCount, 1);
  assert.equal(result.overall.absentCount, 1);
  assert.equal(result.overall.leftEarlyCount, 1);
  assert.equal(result.overall.completedClassCount, 3);
  assert.equal(result.overall.attendancePercentage, 33.3);
  assert.equal(result.subjects.find((item) => item.subject._id === 'subject-math').attendancePercentage, 33.3);
  assert.equal(result.subjects.find((item) => item.subject._id === 'subject-science').attendancePercentage, null);
});

test('no completed sessions are represented as unavailable instead of a genuine 0 percent', () => {
  assert.equal(percentage(0, 0), null);
  const result = summarizeAttendanceRecords([
    { subjectId: scienceSubject, sessionId: { status: 'ACTIVE' }, finalStatus: null }
  ]);
  assert.equal(result.overall.attendancePercentage, null);
  assert.equal(result.subjects[0].completedClassCount, 0);
  assert.equal(result.subjects[0].attendancePercentage, null);
});

test('a completed subject with no PRESENT records reports a real zero percent', () => {
  const result = summarizeAttendanceRecords([
    { subjectId: mathSubject, sessionId: { status: 'CLOSED' }, finalStatus: 'ABSENT' },
    { subjectId: mathSubject, sessionId: { status: 'CLOSED' }, finalStatus: 'LEFT_EARLY' }
  ]);

  assert.equal(result.overall.attendancePercentage, 0);
  assert.equal(result.subjects[0].attendancePercentage, 0);
});

test('attendance register rejects invalid date ranges and statuses before querying records', async () => {
  await assert.rejects(register({ startDate: '2026-02-30' }), { statusCode: 400, message: 'Invalid startDate' });
  await assert.rejects(register({ startDate: '2026-10-05', endDate: '2026-10-04' }), { statusCode: 400, message: 'startDate must not be after endDate' });
  await assert.rejects(register({ status: 'IN_CLASS' }), { statusCode: 400, message: 'Invalid attendance status' });
});
