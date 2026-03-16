const express = require('express');
const router = express.Router();
const electricityController = require('./../controllers/electricityController')

const authController = require('./../controllers/authController');

// Apply protect middleware to all routes
router.use(authController.protect);

router.route('/plans').get(electricityController.getPlans)
router.route('/verify-meter').post(electricityController.verifyMeter)
router.route('/purchase').post(electricityController.buyElectricity)

module.exports = router