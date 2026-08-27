const { Router } = require('express');
const ctrl = require('../controllers/factureAccessController');
const { requirePermission } = require('../middleware/requireRole');

const router = Router();

// Registre des factures certifiées — permission dédiée.
router.get('/', requirePermission('facture_access.view'), ctrl.list);

module.exports = router;
