const express = require('express');
const router = express.Router();
const airtimeController = require('./../controllers/airtimeController')

const authController = require('./../controllers/authController');

// Apply protect middleware to all routes
router.use(authController.protect);

router.route('/purchase').post(airtimeController.buyAirtime)

module.exports = router