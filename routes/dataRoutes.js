const express = require('express');
const router = express.Router();
const dataController = require('./../controllers/dataController')
const authController = require('./../controllers/authController');

// Apply protect middleware to all routes
router.use(authController.protect);

router.route('/plans').get(dataController.getDataPlans)
router.route('/purchase').post(dataController.buyData)

module.exports = router