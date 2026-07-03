const express = require('express');
const authController = require('./../controllers/authController');
const bankAccountController = require('./../controllers/bankAccountController');

const router = express.Router();

// Apply protect middleware to all routes
router.use(authController.protect);

router.get('/supported-banks', bankAccountController.getSupportedBanks)
router.post('/verify-account', bankAccountController.verifyAccountDetails)

// General Route - accessible to all authenticated users
router.get('/company', bankAccountController.getCompanyAccount);

// Admin-only routes -
router.post('/admin', 
    authController.restrictTo('admin'),
    bankAccountController.createAccountAdmin
);

// User-specific routes
router.use(authController.restrictTo('user'));
router.route('/')
    .post(bankAccountController.createAccount)
    .get(bankAccountController.getBankAccounts);

router.route('/:id').delete(bankAccountController.deleteAccount);

module.exports = router;