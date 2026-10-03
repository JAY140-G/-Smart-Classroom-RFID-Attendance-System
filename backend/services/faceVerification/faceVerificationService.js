'use strict';

const path = require('path');
const AppError = require('../../utils/AppError');

let enginePromise;

function isDevelopmentMode() {
  return process.env.FACE_VERIFICATION_MODE === 'development';
}

function getFaceMatchThreshold() {
  const value = process.env.FACE_MATCH_THRESHOLD;
  if (typeof value !== 'string' || !value.trim()) return null;

  const threshold = Number(value);
  return Number.isFinite(threshold) && threshold >= 0 ? threshold : null;
}

function getProviderStatus() {
  return {
    configured: process.env.FACE_ENGINE === 'wasm',
    engine: process.env.FACE_ENGINE || 'unconfigured',
    mode: isDevelopmentMode() ? 'development-test-only' : 'provider-required',
    thresholdConfigured: getFaceMatchThreshold() !== null,
    initialized: false
  };
}

function validateStudent(student) {
  if (!student || !student._id) throw new AppError('A valid student is required for face verification', 400);
}

function validateImage(imageBuffer) {
  if (!Buffer.isBuffer(imageBuffer) || imageBuffer.length === 0) return { valid: false, reason: 'INVALID_IMAGE' };
  const maxBytes = Number(process.env.FACE_MAX_IMAGE_BYTES || 5242880);
  if (imageBuffer.length > maxBytes) return { valid: false, reason: 'IMAGE_TOO_LARGE' };
  const isJpeg = imageBuffer.length > 3 && imageBuffer[0] === 0xff && imageBuffer[1] === 0xd8 && imageBuffer[2] === 0xff;
  const isPng = imageBuffer.length > 8 && imageBuffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const isWebp = imageBuffer.length > 12 && imageBuffer.toString('ascii', 0, 4) === 'RIFF' && imageBuffer.toString('ascii', 8, 12) === 'WEBP';
  return isJpeg || isPng || isWebp ? { valid: true } : { valid: false, reason: 'INVALID_IMAGE' };
}

async function loadEngine() {
  if (process.env.FACE_ENGINE !== 'wasm') throw new Error('FACE_ENGINE is not set to wasm');
  const tf = require('@tensorflow/tfjs');
  const wasm = require('@tensorflow/tfjs-backend-wasm');
  const image = require('@canvas/image');
  const faceApi = require('@vladmandic/face-api/dist/face-api.node-wasm.js');
  const packageRoot = path.dirname(require.resolve('@vladmandic/face-api/package.json'));
  const modelPath = path.join(packageRoot, 'model');
  const wasmPath = path.dirname(require.resolve('@tensorflow/tfjs-backend-wasm/dist/tfjs-backend-wasm.wasm'));
  wasm.setWasmPaths(`${wasmPath}/`);
  await tf.setBackend('wasm');
  await tf.ready();
  await faceApi.nets.ssdMobilenetv1.loadFromDisk(modelPath);
  await faceApi.nets.faceLandmark68Net.loadFromDisk(modelPath);
  await faceApi.nets.faceRecognitionNet.loadFromDisk(modelPath);
  return { tf, image, faceApi };
}

function getEngine() {
  if (!enginePromise) enginePromise = loadEngine().catch((error) => { enginePromise = undefined; throw error; });
  return enginePromise;
}

async function getInitializedProviderStatus() {
  const status = getProviderStatus();
  if (!status.configured) return status;

  try {
    await getEngine();
    return { ...status, initialized: true };
  } catch (error) {
    return { ...status, configured: false, initialized: false, reason: 'SERVICE_UNAVAILABLE', message: 'WASM face engine failed to initialize.' };
  }
}

async function imageTensor(imageBuffer, tf, image) {
  const canvas = await image.imageFromBuffer(imageBuffer);
  const data = image.getImageData(canvas).data;
  return tf.tidy(() => {
    const rgba = tf.tensor(Array.from(data), [canvas.height, canvas.width, 4], 'int32');
    const channels = tf.split(rgba, 4, 2);
    return tf.squeeze(tf.stack([channels[0], channels[1], channels[2]], 2));
  });
}

async function descriptorFromImage(imageBuffer) {
  const validation = validateImage(imageBuffer);
  if (!validation.valid) return { ok: false, reason: validation.reason };
  let engine;
  try { engine = await getEngine(); } catch (error) { return { ok: false, reason: 'SERVICE_UNAVAILABLE', error }; }
  let tensor;
  try {
    tensor = await imageTensor(imageBuffer, engine.tf, engine.image);
    const detections = await engine.faceApi.detectAllFaces(tensor, new engine.faceApi.SsdMobilenetv1Options({ minConfidence: 0.5 }))
      .withFaceLandmarks().withFaceDescriptors();
    if (detections.length === 0) return { ok: false, reason: 'NO_FACE' };
    if (detections.length > 1) return { ok: false, reason: 'MULTIPLE_FACES' };
    return { ok: true, descriptor: Array.from(detections[0].descriptor), metric: 'euclideanDistance' };
  } catch (error) {
    return { ok: false, reason: 'INVALID_IMAGE', error };
  } finally {
    if (tensor) engine.tf.dispose(tensor);
  }
}

async function enrollFace({ student, imageBuffer, referenceType = 'embedding' }) {
  validateStudent(student);
  const result = await descriptorFromImage(imageBuffer);
  if (!result.ok) return { configured: result.reason !== 'SERVICE_UNAVAILABLE', status: result.reason, reason: result.reason, message: result.reason, error: result.error };
  return {
    configured: true,
    status: 'ACTIVE',
    reference: {
      studentId: student._id,
      provider: 'vladmandic-face-api-wasm',
      model: 'ssd_mobilenet_v1+face_landmark_68+face_recognition',
      referenceType,
      referenceData: result.descriptor,
      metadata: { metric: result.metric, descriptorLength: result.descriptor.length }
    }
  };
}

async function verifyFace({ student, imageBuffer, referenceData }) {
  validateStudent(student);
  const result = await descriptorFromImage(imageBuffer);
  if (!result.ok) return { configured: result.reason !== 'SERVICE_UNAVAILABLE', verified: false, status: result.reason, reason: result.reason, message: result.reason, error: result.error };
  if (!Array.isArray(referenceData) || referenceData.length !== result.descriptor.length) return { configured: true, verified: false, status: 'NO_FACE_REFERENCE', reason: 'NO_FACE_REFERENCE' };
  let engine;
  try { engine = await getEngine(); } catch (error) { return { configured: false, verified: false, status: 'SERVICE_UNAVAILABLE', reason: 'SERVICE_UNAVAILABLE', error }; }
  const metric = engine.faceApi.euclideanDistance(Float32Array.from(referenceData), Float32Array.from(result.descriptor));
  const threshold = getFaceMatchThreshold();
  if (threshold === null) return { configured: true, verified: false, status: 'THRESHOLD_NOT_CONFIGURED', reason: 'THRESHOLD_NOT_CONFIGURED', metric, threshold: null };
  const verified = metric <= threshold;
  return { configured: true, verified, status: verified ? 'VERIFIED' : 'FACE_MISMATCH', reason: verified ? 'VERIFIED' : 'FACE_MISMATCH', metric, threshold };
}

module.exports = { enrollFace, verifyFace, isDevelopmentMode, getProviderStatus, getInitializedProviderStatus, validateImage, descriptorFromImage };
