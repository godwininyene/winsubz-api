const express = require('express');
const router = express.Router();

const authController = require('./../controllers/authController');
const settingsController = require('./../controllers/settingsController');


// Get settings
router.get('/', settingsController.getSettings);

// Apply authentication and authorization to all routes
router.use(authController.protect);
// router.use(authorize('admin')); // Only admins can access settings

// Update settings
router.patch('/',authController.restrictTo('admin'), settingsController.updateSettings);

// // Get specific setting
// router.get('/:key', settingsController.getSetting);

// // Toggle maintenance mode
// router.patch('/maintenance-mode', settingsController.toggleMaintenanceMode);

module.exports = router;