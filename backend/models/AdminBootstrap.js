'use strict';

const mongoose = require('mongoose');

const adminBootstrapSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  completedAt: { type: Date, required: true }
}, { versionKey: false });

module.exports = mongoose.model('AdminBootstrap', adminBootstrapSchema);
