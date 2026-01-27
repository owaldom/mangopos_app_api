const express = require('express');
const router = express.Router();
const dailyExpenseController = require('../controllers/dailyExpenseController');

// Rutas de gastos diarios
router.get('/', dailyExpenseController.getAll);
router.get('/reports/totals', dailyExpenseController.getTotalsByPeriod);
router.get('/:id', dailyExpenseController.getById);
router.post('/', dailyExpenseController.create);
router.put('/:id', dailyExpenseController.update);
router.delete('/:id', dailyExpenseController.delete);

module.exports = router;
