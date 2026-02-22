const express = require('express');
const router = express.Router();
const electricityController = require('./../controllers/electricityController')

const authController = require('./../controllers/authController');

// Apply protect middleware to all routes
router.use(authController.protect);

router.route('/purchase').post(electricityController.buyElectricity)

module.exports = router