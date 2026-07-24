const { Router } = require('express');
const ctrl = require('../controllers/fnePrintController');

const router = Router();

// Proxy d'impression FNE (le backend relaie le document pour les postes sans internet)
router.get('/print/:numero', ctrl.printProxy);

// Impression groupée : plusieurs factures fusionnées en un seul PDF
router.post('/print-multi', ctrl.printMulti);

module.exports = router;
