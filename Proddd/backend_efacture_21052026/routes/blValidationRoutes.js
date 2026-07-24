const { Router } = require('express');
const ctrl = require('../controllers/blValidationController');
const { requirePermission } = require('../middleware/requireRole');

const router = Router();

// Accès lecture : un des 3 rôles BL suffit (OU).
const canView = requirePermission(['bl.view', 'bl.validate_logistique', 'bl.validate_commercial', 'bl.validate_comptabilite']);

// Historique des validations
router.get('/', canView, ctrl.list);

// Infos d'une facture + état de validation
router.get('/invoice/:numero', canView, ctrl.getInvoiceForValidation);

// Étape 1 : validation Logistique
router.post('/invoice/:numero/logistique', requirePermission('bl.validate_logistique'), ctrl.validateLogistique);

// Étape 2 : validation Commerciale
router.post('/invoice/:numero/commercial', requirePermission('bl.validate_commercial'), ctrl.validateCommercial);

// Étape 3 : validation Comptabilité
router.post('/invoice/:numero/comptabilite', requirePermission('bl.validate_comptabilite'), ctrl.validateComptabilite);

// Traçage de l'impression de la facture FNE (qui/quand)
router.post('/invoice/:numero/print', canView, ctrl.recordPrint);

module.exports = router;
