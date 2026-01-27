const express = require('express');
const router = express.Router();
const taxController = require('../controllers/taxController');
const authMiddleware = require('../middleware/auth');

router.use(authMiddleware);

router.get('/categories', taxController.getTaxCategories);
router.get('/cust-categories', taxController.getTaxCustCategories);

router.get('/', taxController.getAllTaxes);
router.get('/:id', taxController.getTaxById);
router.post('/', taxController.createTax);
router.put('/:id', taxController.updateTax);
router.delete('/:id', taxController.deleteTax);

module.exports = router;
