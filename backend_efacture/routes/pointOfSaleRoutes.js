const express = require('express');
const router = express.Router();
const pointOfSaleController = require('../controllers/pointOfSaleController');

router.get('/', pointOfSaleController.getAllPointsOfSale);
router.put('/:id', pointOfSaleController.updatePointOfSaleStatus);
router.post('/bulk-update', pointOfSaleController.bulkUpdateStatus);

module.exports = router;
