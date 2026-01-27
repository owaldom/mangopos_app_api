const express = require('express');
const router = express.Router();
const supplierController = require('../controllers/supplierController');

// Rutas de proveedores
router.get('/', supplierController.getAll);
router.get('/:id', supplierController.getById);
router.get('/:id/invoices', supplierController.getInvoices);
router.get('/:id/payments', supplierController.getPaymentHistory);
router.post('/', supplierController.create);
router.put('/:id', supplierController.update);
router.delete('/:id', supplierController.delete);

module.exports = router;
