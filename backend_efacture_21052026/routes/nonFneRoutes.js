const { Router } = require('express');
const ctrl = require('../controllers/nonFneController');
const { requirePermission } = require('../middleware/requireRole');

const router = Router();

// Gestion des factures "à ne pas envoyer à la FNE" — par autorisation.
//   - lecture : non_fne.view OU non_fne.manage
//   - ajout / mise à jour : non_fne.manage
//   - suppression : non_fne.delete
router.get('/', requirePermission(['non_fne.view', 'non_fne.manage', 'non_fne.delete']), ctrl.list);
router.post('/check', requirePermission('non_fne.manage'), ctrl.check);
router.post('/', requirePermission('non_fne.manage'), ctrl.add);
router.delete('/:numero', requirePermission('non_fne.delete'), ctrl.remove);

module.exports = router;
