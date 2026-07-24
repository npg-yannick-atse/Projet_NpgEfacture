const express = require('express');
const router = express.Router();
const {
  updateInlineField,
  getInvoiceModifications,
  getLastModification,
  applyModificationsToInvoice
} = require('../controllers/inlineFieldController');

// Route pour mettre à jour un champ inline
router.post('/', updateInlineField);

// Route pour récupérer toutes les modifications d'une facture
router.get('/invoice/:invoiceNumber', getInvoiceModifications);

// Route pour récupérer la dernière modification pour un champ spécifique
router.get('/invoice/:invoiceNumber/field/:fieldName', getLastModification);

// Route pour appliquer toutes les modifications à une facture
router.get('/apply/:invoiceNumber', applyModificationsToInvoice);

module.exports = router;
