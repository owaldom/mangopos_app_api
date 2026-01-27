const express = require('express');
const router = express.Router();
const discountCustCategoryController = require('../controllers/discountCustCategoryController');

router.get('/', discountCustCategoryController.getAllDiscountCustCategories);
router.post('/', discountCustCategoryController.createDiscountCustCategory);
router.put('/:id', discountCustCategoryController.updateDiscountCustCategory);
router.delete('/:id', discountCustCategoryController.deleteDiscountCustCategory);

module.exports = router;
