'use strict';

class AppError extends Error {
  constructor(message, statusCode = 400, { expose = false } = {}) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.expose = expose;
  }
}

module.exports = AppError;