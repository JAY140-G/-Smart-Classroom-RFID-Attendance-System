'use strict';

const faceReferenceService = require('../services/faceVerification/faceReferenceService');
const { getInitializedProviderStatus } = require('../services/faceVerification/faceVerificationService');

async function list(req, res) {
  res.status(200).json({ success: true, data: await faceReferenceService.listReferences() });
}

async function get(req, res) {
  res.status(200).json({ success: true, data: await faceReferenceService.getReference(req.params.id) });
}

async function create(req, res) {
  res.status(201).json({ success: true, message: 'Face reference enrolled', data: await faceReferenceService.createReference(req.body) });
}

async function deactivate(req, res) {
  res.status(200).json({ success: true, message: 'Face reference deactivated', data: await faceReferenceService.deactivateReference(req.params.id) });
}

async function status(req, res) {
  res.status(200).json({
    success: true,
    data: await getInitializedProviderStatus()
  });
}

module.exports = { list, get, create, deactivate, status };