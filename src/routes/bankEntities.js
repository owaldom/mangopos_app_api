const express = require('express');
const router = express.Router();
const bankEntitiesController = require('../controllers/bankEntitiesController');

router.get('/', bankEntitiesController.getAll);
router.get('/:id', bankEntitiesController.getById);
router.post('/', bankEntitiesController.create);
router.put('/:id', bankEntitiesController.update);
router.delete('/:id', bankEntitiesController.delete);

module.exports = router;
