const express = require('express');
const router = express.Router();
const productKitsController = require('../controllers/productKitsController');

// Obtener todos los productos definidos como KITS
router.get('/headers', productKitsController.getKitHeaders);

// Obtener productos disponibles para ser agregados a un kit
router.get('/eligible-components', productKitsController.getEligibleComponents);

// Validar stock de un kit
router.get('/validate/stock', productKitsController.validateStock);

// Obtener componentes de un kit específico
router.get('/:kitId', productKitsController.getKitComponents);

// Guardar/Actualizar componentes de un kit
router.post('/:kitId', productKitsController.saveKit);

module.exports = router;
