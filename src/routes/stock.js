const express = require('express');
const router = express.Router();
const stockController = require('../controllers/stockController');
const authMiddleware = require('../middleware/auth');

router.use(authMiddleware); // Proteger todas las rutas

router.get('/movements', stockController.getStockMovements);
router.post('/movements', stockController.createStockMovement);
router.post('/bulk-movements', stockController.createBulkStockMovement);
router.get('/locations', stockController.getLocations);
router.get('/product/:productId', stockController.getProductStock);
router.get('/low-stock', stockController.getLowStockReport);

module.exports = router;
