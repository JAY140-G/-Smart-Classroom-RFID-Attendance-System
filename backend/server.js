'use strict';

const path = require('path');

require('dotenv').config({
  path: path.resolve(__dirname, '.env')
});

const express = require('express');
const cors = require('cors');
const { connectDatabase, getDatabaseStatus } = require('./config/db');
const timetableRoutes = require('./routes/timetableRoutes');
const attendanceRoutes = require('./routes/attendanceRoutes');
const createEntityRouter = require('./routes/entityRoutes');
const faceReferenceRoutes = require('./routes/faceReferenceRoutes');
const faceVerificationRoutes = require('./routes/faceVerificationRoutes');
const authRoutes = require('./routes/authRoutes');

const app = express();
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use('/api/auth', authRoutes);
app.use('/api/timetable', timetableRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/students', createEntityRouter('students'));
app.use('/api/teachers', createEntityRouter('teachers'));
app.use('/api/subjects', createEntityRouter('subjects'));
app.use('/api/classes', createEntityRouter('classes'));
app.use('/api/face-references', faceReferenceRoutes);
app.use('/api/face-verification', faceVerificationRoutes);

app.get('/', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Smart Classroom Attendance Backend is running'
  });
});

app.get('/api/health/db', (req, res) => {
  const databaseStatus = getDatabaseStatus();
  const isConnected = databaseStatus === 'connected';

  res.status(200).json({
    success: isConnected,
    database: databaseStatus
  });
});

app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);

  if (error.name === 'MulterError') {
    const message = error.code === 'LIMIT_FILE_SIZE' ? 'Image exceeds the configured size limit' : 'Invalid image upload';
    return res.status(400).json({ success: false, message });
  }
  if (error.message === 'Unexpected field') {
    return res.status(400).json({ success: false, message: 'Upload an image using the image field' });
  }
  if (error.name === 'ValidationError') {
    return res.status(400).json({ success: false, message: error.message });
  }
  if (error.code === 11000) {
    return res.status(409).json({ success: false, message: 'A record with one of these values already exists' });
  }

  const statusCode = error.statusCode || 500;
  const message = statusCode >= 500 ? 'Internal server error' : error.message;
  return res.status(statusCode).json({ success: false, message });
});

if (require.main === module) {
  app.listen(port, () => {
    console.log(`Smart Classroom Attendance Backend running at http://localhost:${port}`);
    connectDatabase();
  });
}

module.exports = app;