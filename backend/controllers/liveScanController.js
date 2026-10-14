
'use strict';

const liveScanService = require('../services/attendance/liveScanService');
const AppError = require('../utils/AppError');

async function create(req, res) {
  const scan = await liveScanService.createScan({
    ...req.body,
    idempotencyKey: req.idempotencyKey
  });

  res.status(202).json({
    success: true,
    data: {
      scanId: scan.scanId,
      status: scan.status,
      studentName: scan.studentName,
      expiresAt: scan.expiresAt
    }
  });
}

async function virtualStudents(req, res) {
  const students = await liveScanService.getVirtualStudents();
  res.status(200).json({
    success: true,
    data: students
  });
}

async function createVirtual(req, res) {
  const scan = await liveScanService.createVirtualScan({
    ...req.body,
    idempotencyKey: req.idempotencyKey
  });

  res.status(202).json({
    success: true,
    data: {
      protocolVersion: 1,
      scanId: scan.scanId,
      status: scan.status,
      source: 'VIRTUAL',
      virtualRfidUid: scan.virtualRfidUid,
      studentName: scan.studentName,
      expiresAt: scan.expiresAt
    }
  });
}

async function virtualHistory(req, res) {
  const scans = await liveScanService.getRecentVirtualScans();
  res.status(200).json({ success: true, data: scans });
}

async function recentScans(req, res) {
  const scans = await liveScanService.getRecentScans();
  res.status(200).json({ success: true, data: scans });
}

async function virtualStatus(req, res) {
  const result = await liveScanService.getVirtualScanStatus(req.params.scanId);
  res.status(200).json({ success: true, data: result });
}

async function next(req, res) {
  const scan = await liveScanService.getNextScan();
  res.status(200).json({ success: true, data: scan });
}

async function status(req, res) {
  const result = await liveScanService.getScanStatus(req.params.scanId);
  res.status(200).json({ success: true, data: result });
}

async function image(req, res) {
  if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
    throw new AppError('A JPEG image body is required', 400);
  }

  const result = await liveScanService.completeScan(
    req.params.scanId,
    req.body
  );

  res.status(200).json({
    success: result.status === 'SUCCEEDED',
    data: result
  });
}

async function capturedImage(req, res) {
  const image = await liveScanService.getCapturedImage(req.params.scanId);
  res
    .status(200)
    .set({
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
      'Content-Disposition': 'inline; filename="live-scan.jpg"'
    })
    .type('image/jpeg')
    .send(image.imageData);
}

module.exports = {
  create,
  virtualStudents,
  createVirtual,
  virtualHistory,
  recentScans,
  virtualStatus,
  next,
  status,
  image,
  capturedImage
};