const express = require('express');
const router = express.Router();
const cableController = require('./../controllers/cableController')

const authController = require('./../controllers/authController');

// Apply protect middleware to all routes
router.use(authController.protect);
router.route('/providers').get(cableController.getProviders)
router.route('/plans').get(cableController.getDataPlans)
router.route('/verify-card').post(cableController.verifyCableCard)
router.route('/subscribe').post(cableController.buyCableSub)

module.exports = router