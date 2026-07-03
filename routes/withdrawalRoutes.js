const express = require('express');
const router = express.Router();
const withdrawalController = require('../controllers/withdrawalController');
const { protect, restrictTo } = require('../controllers/authController'); // Ensure restrictTo is imported

// All withdrawal endpoints require a validated session
router.use(protect);

//User Endpoint: Create a new payout activity 
router.post('/request', withdrawalController.requestWithdrawal);

//User Endpoint: Get personal transaction log context
router.get('/', withdrawalController.getMyWithdrawals);

//Admin Endpoint: Fetch full platform operational cashflow records
router.get('/admin-all', restrictTo('admin'), withdrawalController.getAllWithdrawals);

module.exports = router;