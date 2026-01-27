const express = require('express');
const router = express.Router();
const salesController = require('../controllers/salesController');
const authMiddleware = require('../middleware/auth');

router.use(authMiddleware);

router.get('/catalog', salesController.getCatalog);
router.get('/currencies', salesController.getCurrencies);
router.post('/', salesController.createSale);
router.post('/debt-payment', salesController.createDebtPayment);

// Sales history and refunds
router.get('/history', salesController.getSalesHistory);
router.get('/:id', salesController.getTicketById);
router.post('/:id/refund', salesController.processRefund);

module.exports = router;
