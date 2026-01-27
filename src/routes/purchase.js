const express = require('express');
const router = express.Router();
const purchaseController = require('../controllers/purchaseController');
const authMiddleware = require('../middleware/auth');

router.use(authMiddleware);

router.post('/', purchaseController.createPurchase);
router.post('/debt-payment', purchaseController.createDebtPayment);
router.get('/history', purchaseController.getPurchaseHistory);
router.get('/:id', purchaseController.getPurchaseById);

module.exports = router;
