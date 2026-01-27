const express = require('express');
const router = express.Router();
const taxController = require('../controllers/taxController');
const authMiddleware = require('../middleware/authMiddleware');

// Validar todas las rutas con autenticación (opcional, según requisitos)
// router.use(authMiddleware);

// Rutas auxiliares (Categorías) por si se necesitan cargar primero
router.get('/categories', taxController.getTaxCategories);
router.get('/cust-categories', taxController.getTaxCustCategories);

// CRUD principal
router.get('/', taxController.getAllTaxes);
router.get('/:id', taxController.getTaxById);
router.post('/', taxController.createTax);
router.put('/:id', taxController.updateTax);
router.delete('/:id', taxController.deleteTax);

module.exports = router;
