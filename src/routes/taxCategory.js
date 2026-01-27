const express = require('express');
const router = express.Router();
const taxCategoryController = require('../controllers/taxCategoryController');

router.get('/', taxCategoryController.getAll);
router.get('/:id', taxCategoryController.getById);
router.post('/', taxCategoryController.create);
router.put('/:id', taxCategoryController.update);
router.delete('/:id', taxCategoryController.delete);

module.exports = router;
