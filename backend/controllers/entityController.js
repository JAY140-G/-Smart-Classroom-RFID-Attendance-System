'use strict';

const entityService = require('../services/entityService');

function controller(type) {
  return {
    list: async (req, res) => res.status(200).json({ success: true, data: await entityService.list(type, req.query) }),
    get: async (req, res) => res.status(200).json({ success: true, data: await entityService.get(type, req.params.id) }),
    create: async (req, res) => res.status(201).json({ success: true, message: `${type} record created`, data: await entityService.create(type, req.body) }),
    update: async (req, res) => res.status(200).json({ success: true, message: `${type} record updated`, data: await entityService.update(type, req.params.id, req.body) }),
    remove: async (req, res) => res.status(200).json({ success: true, message: `${type} record deleted`, data: await entityService.remove(type, req.params.id) })
  };
}

module.exports = controller;