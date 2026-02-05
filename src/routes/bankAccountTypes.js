const express = require('express');
const router = express.Router();
const bankAccountTypesController = require('../controllers/bankAccountTypesController');

router.get('/', bankAccountTypesController.getAll);
router.get('/:id', bankAccountTypesController.getById);
router.post('/', bankAccountTypesController.create);
router.put('/:id', bankAccountTypesController.update);
router.delete('/:id', bankAccountTypesController.delete);

module.exports = router;
