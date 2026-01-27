const express = require('express');
const router = express.Router();
const discountCategoryController = require('../controllers/discountCategoryController');

router.get('/', discountCategoryController.getAllDiscountCategories);
router.post('/', discountCategoryController.createDiscountCategory);
router.put('/:id', discountCategoryController.updateDiscountCategory);
router.delete('/:id', discountCategoryController.deleteDiscountCategory);

module.exports = router;
