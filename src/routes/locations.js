const express = require('express');
const router = express.Router();
const locationController = require('../controllers/locationController');

// Get all locations
router.get('/', locationController.getAll);

// Get single location by ID
router.get('/:id', locationController.getById);

// Create new location
router.post('/', locationController.create);

// Update location
router.put('/:id', locationController.update);

// Delete location
router.delete('/:id', locationController.delete);

module.exports = router;
