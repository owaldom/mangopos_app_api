const express = require('express');
const router = express.Router();
const customerController = require('../controllers/customerController');

router.get('/', customerController.getAll);
router.get('/:id', customerController.getById);
router.get('/:id/invoices', customerController.getInvoices);
router.get('/:id/payments', customerController.getPaymentHistory);
router.post('/', customerController.create);
router.put('/:id', customerController.update);

module.exports = router;
