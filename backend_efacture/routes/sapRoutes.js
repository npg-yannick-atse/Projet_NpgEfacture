const { Router } = require('express');
const { getInvoiceDocument, getBapiStructure, getClientAddress, resolveAvoirSap } = require('../controllers/sapInvoiceController');
const { getStructureFields } = require('../controllers/sapDictionaryController');

const router = Router();

// Obtenir les détails d'une facture
router.post('/invoices', getInvoiceDocument);

// Obtenir l'adresse d'un client
router.get('/client-address/:kunnr', getClientAddress);

// Rechercher des factures par plage de dates (ERDAT)
router.post('/invoices-by-date', require('../controllers/sapInvoiceController').getInvoicesByDateRange);

// Obtenir la structure de la BAPI (pour le débogage)
router.get('/bapi-structure', getBapiStructure);

// Obtenir la liste des champs d'une structure / table DDIC (ex: VBRKVB, VBRPVB, KOMV...)
router.get('/structure-fields', getStructureFields);

// Résoudre un avoir SAP : trouver la facture initiale FNE et préparer le refund
router.post('/resolve-avoir', resolveAvoirSap);

module.exports = router;
