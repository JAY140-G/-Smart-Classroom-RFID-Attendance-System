'use strict';

const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const controller = require('../controllers/entityController');

function createEntityRouter(type) {
  const router = express.Router();
  const handlers = controller(type);
  router.get('/', asyncHandler(handlers.list));
  router.get('/:id', asyncHandler(handlers.get));
  router.post('/', asyncHandler(handlers.create));
  router.put('/:id', asyncHandler(handlers.update));
  router.delete('/:id', asyncHandler(handlers.remove));
  return router;
}

module.exports = createEntityRouter;