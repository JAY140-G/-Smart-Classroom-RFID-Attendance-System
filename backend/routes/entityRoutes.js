'use strict';

const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const controller = require('../controllers/entityController');
const { requireAuth, allowRoles } = require('../middleware/authentication');

function createEntityRouter(type) {
  const router = express.Router();
  const handlers = controller(type);
  router.use(requireAuth, allowRoles('ADMIN'));
  router.get('/', asyncHandler(handlers.list));
  router.get('/:id', asyncHandler(handlers.get));
  router.post('/', asyncHandler(handlers.create));
  router.put('/:id', asyncHandler(handlers.update));
  router.delete('/:id', asyncHandler(handlers.remove));
  return router;
}

module.exports = createEntityRouter;