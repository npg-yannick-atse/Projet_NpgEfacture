const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const auth = require('../middleware/auth');

// Authentication routes
router.post('/login', authController.authenticateLDAP);

// Logging routes
router.post('/log/download', auth, authController.logDownload);
router.post('/log/delete', auth, authController.logDeletion);
router.get('/logs', auth, authController.getLogs);

module.exports = router;
