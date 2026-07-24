const express = require('express');
const router = express.Router();
const downloadedInvoicesController = require('../controllers/downloadedInvoicesController');

// POST /api/downloaded-invoices - Sauvegarder une facture téléchargée
router.post('/', downloadedInvoicesController.saveDownloadedInvoice);

// POST /api/downloaded-invoices/bulk - Sauvegarder un LOT de factures (1 seul appel)
router.post('/bulk', downloadedInvoicesController.bulkSaveDownloadedInvoices);

// GET /api/downloaded-invoices - Récupérer toutes les factures téléchargées
router.get('/', downloadedInvoicesController.getAllDownloadedInvoices);

// GET /api/downloaded-invoices/:username - Récupérer les factures d'un utilisateur
router.get('/:username', downloadedInvoicesController.getUserDownloadedInvoices);

// DELETE /api/downloaded-invoices/:id - Supprimer une facture téléchargée
router.delete('/:id', downloadedInvoicesController.deleteDownloadedInvoice);

// PUT /api/downloaded-invoices/:id/verify - Basculer le statut vérifié
router.put('/:id/verify', downloadedInvoicesController.toggleVerify);

// POST /api/downloaded-invoices/bulk-delete - Supprimer plusieurs factures
router.post('/bulk-delete', downloadedInvoicesController.bulkDeleteDownloadedInvoices);

module.exports = router;
