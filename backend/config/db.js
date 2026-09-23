'use strict';

const mongoose = require('mongoose');

async function connectDatabase() {
  if (!process.env.MONGODB_URI) {
    console.log('MongoDB is not configured yet. Set MONGODB_URI to enable the database connection.');
    return false;
  }

  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('MongoDB connected successfully.');
    return true;
  } catch (error) {
    console.error(`MongoDB connection failed: ${error.message}`);
    return false;
  }
}

function getDatabaseStatus() {
  if (!process.env.MONGODB_URI) {
    return 'not_configured';
  }

  return mongoose.connection.readyState === 1 ? 'connected' : 'disconnected';
}

module.exports = {
  connectDatabase,
  getDatabaseStatus
};