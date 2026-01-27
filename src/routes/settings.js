const express = require('express');
const router = express.Router();
const settingsController = require('../controllers/settingsController');

router.get('/', settingsController.getAll);
router.put('/', settingsController.updateSettings);
router.put('/currency/:id', settingsController.updateCurrency);

module.exports = router;
