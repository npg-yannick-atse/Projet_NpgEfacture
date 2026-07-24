const express = require('express');
const router = express.Router();
const {
  logInvoiceDownload,
  logInvoiceDelete,
  logInvoiceSend,
  getUserLogs,
  getInvoiceLogs,
  logInvoicePrint,
  checkAlreadySent
} = require('../controllers/logsController');

// Routes pour les logs d'actions
router.post('/download', logInvoiceDownload);
router.post('/delete', logInvoiceDelete);
router.post('/send', logInvoiceSend);
router.post('/print', logInvoicePrint);
router.get('/check-sent/:numeroFacture', checkAlreadySent);
router.get('/user/:username', getUserLogs);
router.get('/invoice/:numeroFacture', getInvoiceLogs);

module.exports = router;
