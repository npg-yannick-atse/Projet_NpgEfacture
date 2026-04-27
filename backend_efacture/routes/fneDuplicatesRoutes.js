const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/fneDuplicatesController');
const { requirePermission } = require('../middleware/requireRole');

// Consultation : permission audit.view
router.get('/duplicates', requirePermission('audit.view'), ctrl.listDuplicates);

// Action destructive : permission fne.cancel_duplicate
router.post('/cancel-duplicate', requirePermission('fne.cancel_duplicate'), ctrl.cancelDuplicate);

module.exports = router;
