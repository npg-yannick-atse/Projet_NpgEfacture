const express = require('express');
const router = express.Router();
const { getFneInvoiceBySapNumber, sendRefund, getFneInvoiceById, getFneItemsByIds, manualRegisterFne } = require('../controllers/fneInvoiceController');


// Récupérer les détails d'une facture FNE par numéro de facture SAP
router.get('/by-sap-number/:numeroFacture', getFneInvoiceBySapNumber);

// Récupérer une facture FNE par ID FNE
router.get('/:fneInvoiceId', getFneInvoiceById);

// Envoyer un avoir (refund)
router.post('/refund', sendRefund);

// Récupérer des items FNE par liste d'IDs (fne_item_id)
router.post('/items/by-ids', getFneItemsByIds);

// Enregistrer manuellement une facture
router.post('/manual-register', manualRegisterFne);

module.exports = router;

