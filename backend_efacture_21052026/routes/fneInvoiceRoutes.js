const express = require('express');
const router = express.Router();
const { getFneInvoiceBySapNumber, sendRefund, getFneInvoiceById, getFneItemsByIds, manualRegisterFne, checkInvoiceStatus, repairInvoice } = require('../controllers/fneInvoiceController');


// Récupérer les détails d'une facture FNE par numéro de facture SAP.
// ⚠ Le numéro peut contenir des "/" (ex. Succursale "P26/81K"). Une route à segment
// unique (:numeroFacture) ne matche pas "/by-sap-number/P26/81K" → 404. On capture donc
// tout le reste du chemin via un wildcard, puis on le réinjecte dans req.params.numeroFacture.
router.get('/by-sap-number/*', (req, res, next) => {
  req.params.numeroFacture = req.params[0];
  next();
}, getFneInvoiceBySapNumber);

// Vérifier si une facture est déjà certifiée (avant relance) + repères portail + n° FNE probable.
// Wildcard : le numéro peut contenir des "/" (ex. Succursale "P26/81K").
router.get('/check/*', (req, res, next) => {
  req.params.numeroFacture = req.params[0];
  next();
}, checkInvoiceStatus);

// Réparer une facture certifiée à la FNE mais en erreur chez nous (import de l'export JSON du portail).
router.post('/repair', repairInvoice);

// Récupérer une facture FNE par ID FNE
router.get('/:fneInvoiceId', getFneInvoiceById);

// Envoyer un avoir (refund)
router.post('/refund', sendRefund);

// Récupérer des items FNE par liste d'IDs (fne_item_id)
router.post('/items/by-ids', getFneItemsByIds);

// Enregistrer manuellement une facture
router.post('/manual-register', manualRegisterFne);

module.exports = router;

