const express = require('express');
const router = express.Router();
const despieceController = require('../controllers/despieceController');

// Rutas para relaciones de despiece
router.get('/relaciones', despieceController.getRelaciones);
router.get('/relaciones/:id', despieceController.getRelacion);
router.post('/relaciones', despieceController.createRelacion);
router.put('/relaciones/:id', despieceController.updateRelacion);
router.delete('/relaciones/:id', despieceController.deleteRelacion);

// Obtener despieces disponibles para un producto específico
router.get('/productos/:productId', despieceController.getRelacionesByProduct);

// Ejecutar despiece
router.post('/ejecutar', despieceController.ejecutarDespiece);

module.exports = router;
