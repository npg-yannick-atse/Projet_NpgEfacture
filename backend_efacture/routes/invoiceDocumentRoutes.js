const { Router } = require('express');
const { getInvoiceDocument, getBapiStructure } = require('../controllers/invoiceDocumentController');

const router = Router();

// Obtenir la structure de la BAPI
router.get('/invoice-document/structure', getBapiStructure);

// Obtenir les détails d'une facture
router.get('/invoice-document', getInvoiceDocument);

module.exports = router;
