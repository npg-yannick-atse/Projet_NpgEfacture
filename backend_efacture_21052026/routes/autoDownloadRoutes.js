const { Router } = require('express');
const ctrl = require('../controllers/autoDownloadController');
const { requireAdmin } = require('../middleware/requireRole');

const router = Router();

// Réservé aux administrateurs.
router.get('/config', requireAdmin(), ctrl.getConfig);
router.put('/config', requireAdmin(), ctrl.updateConfig);
router.post('/run-now', requireAdmin(), ctrl.runNow);
router.post('/stop', requireAdmin(), ctrl.stop);
router.get('/runs', requireAdmin(), ctrl.listRuns);

module.exports = router;
