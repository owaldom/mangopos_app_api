const express = require('express');
const router = express.Router();
const usersController = require('../controllers/usersController');
const { verifyToken, protect } = require('../controllers/authController');

// All routes protected with protect middleware
router.use(protect);

router.get('/', usersController.getUsers);
router.get('/:id', usersController.getUserById);
router.post('/', usersController.createUser);
router.put('/:id', usersController.updateUser);
router.put('/:id/password', usersController.changeUserPassword);
router.delete('/:id', usersController.deleteUser);

module.exports = router;
