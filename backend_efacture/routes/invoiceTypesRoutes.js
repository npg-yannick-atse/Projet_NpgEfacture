const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/invoiceTypesController');
const { requireAdmin, attachAuth } = require('../middleware/requireRole');

// Lecture : tout user authentifié (utile pour l'Accueil)
router.get('/', attachAuth(), (req, res) => {
    if (!req.auth) return res.status(401).json({ success: false, error: 'UNAUTHENTICATED' });
    ctrl.list(req, res);
});

router.get('/stats', attachAuth(), (req, res) => {
    if (!req.auth) return res.status(401).json({ success: false, error: 'UNAUTHENTICATED' });
    ctrl.stats(req, res);
});

// Gestion : admin uniquement
router.post('/',      requireAdmin(), ctrl.create);
router.put('/:id',    requireAdmin(), ctrl.update);
router.delete('/:id', requireAdmin(), ctrl.remove);

module.exports = router;
