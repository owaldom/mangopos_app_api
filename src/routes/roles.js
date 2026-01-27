const express = require('express');
const router = express.Router();
const rolesController = require('../controllers/rolesController');
const { verifyToken, protect } = require('../controllers/authController');

// All routes protected with protect middleware
router.use(protect);

router.get('/', rolesController.getRoles);
router.get('/:id', rolesController.getRoleById);
router.post('/', rolesController.createRole);
router.put('/:id', rolesController.updateRole);
router.delete('/:id', rolesController.deleteRole);

module.exports = router;
