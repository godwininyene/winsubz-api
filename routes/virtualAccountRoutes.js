const express = require('express');
const router = express.Router();
const virtualAccountController = require('./../controllers/virtualAccountController')
const authController = require('./../controllers/authController');

// Apply protect middleware to all routes
router.use(authController.protect);

router.route('/').post(virtualAccountController.createVirtualAccount)
router.route('/').get(virtualAccountController.getMyVirtualAccount)

module.exports = router