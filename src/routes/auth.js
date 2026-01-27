const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const authMiddleware = require('../middleware/auth');

// Public routes
router.post('/login', authController.login);
router.post('/forgot-password', authController.forgotPassword);

// Protected routes
router.post('/change-password', authMiddleware, authController.changePassword);
router.get('/verify', authMiddleware, authController.verifyToken);
router.get('/profile', authMiddleware, authController.getProfile);

module.exports = router;
