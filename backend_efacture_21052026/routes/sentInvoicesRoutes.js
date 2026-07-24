const express = require('express');
const router = express.Router();
const { getSentInvoices } = require('../controllers/sentInvoicesController');

// Route pour les factures envoyées
router.get('/sent-invoices', getSentInvoices);

module.exports = router;
