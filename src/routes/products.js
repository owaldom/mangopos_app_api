const express = require('express');
const router = express.Router();
const productController = require('../controllers/productController');
const authMiddleware = require('../middleware/auth');

router.use(authMiddleware);

router.get('/', productController.getAllProducts);
router.get('/filter-price-change', productController.filterForPriceChange);
router.get('/:id', productController.getProductById);
router.post('/', productController.createProduct);
router.post('/bulk-price-change', productController.bulkPriceChange);
router.put('/:id', productController.updateProduct);
router.put('/:id/price', productController.updateProductPrice);
router.delete('/:id', productController.deleteProduct);

module.exports = router;
