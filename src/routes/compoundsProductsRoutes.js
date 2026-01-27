const express = require('express');
const router = express.Router();
const compoundsProductsController = require('../controllers/compoundsProductsController');

// Obtener insumos de un producto compuesto
router.get('/:productId', compoundsProductsController.getCompoundProducts);

// Crear relación producto-insumo
router.post('/', compoundsProductsController.createCompoundProduct);

// Actualizar relación producto-insumo
router.put('/:id', compoundsProductsController.updateCompoundProduct);

// Eliminar relación producto-insumo
router.delete('/:id', compoundsProductsController.deleteCompoundProduct);

// Obtener productos disponibles para ser compuestos
router.get('/products/list', compoundsProductsController.getProductsForCompounds);

// Obtener insumos disponibles
router.get('/insumos/list', compoundsProductsController.getInsumos);

// Obtener unidades disponibles
router.get('/unidades/list', compoundsProductsController.getUnidades);

// Validar stock de producto compuesto
router.get('/validate/stock', compoundsProductsController.validateCompoundProductStock);

module.exports = router;
