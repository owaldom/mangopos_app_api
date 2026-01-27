const express = require('express');
const router = express.Router();
const cashController = require('../controllers/cashController');

router.get('/status', cashController.getStatus);
router.post('/open', cashController.openCash);
router.post('/close', cashController.closeCash);
router.get('/summary/:moneyId', cashController.getSummary);

// Cash movements
router.get('/movements', cashController.getCashMovements);
router.post('/movements', cashController.createCashMovement);

module.exports = router;
