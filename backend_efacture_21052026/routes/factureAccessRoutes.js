const { Router } = require('express');
const ctrl = require('../controllers/factureAccessController');
const { requireAdmin } = require('../middleware/requireRole');

const router = Router();

// Registre des factures certifiées — réservé aux administrateurs.
router.get('/', requireAdmin(), ctrl.list);

module.exports = router;
