const express = require('express');
const router = express.Router();
const printerController = require('../controllers/printerController');

router.get('/', printerController.getPrinters);

module.exports = router;
