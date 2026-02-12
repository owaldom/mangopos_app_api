const express = require('express');
const router = express.Router();
const distributionOrdersController = require('../controllers/distributionOrdersController');

// Get all distribution orders
router.get('/', distributionOrdersController.getAllOrders);

// Get single distribution order
router.get('/:id', distributionOrdersController.getOrderById);

// Create new distribution order
router.post('/', distributionOrdersController.createOrder);

// Export distribution order to JSON
router.post('/:id/export', distributionOrdersController.exportOrder);

// Import and receive distribution order
router.post('/import', distributionOrdersController.importOrder);

module.exports = router;
