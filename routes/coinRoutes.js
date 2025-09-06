const express = require('express');
const router = express.Router();
const authController = require('./../controllers/authController');
const coinController = require('./../controllers/coinController');
const { uploadCoin } = require('./../utils/multerConfig');

// Apply protect middleware to all routes
router.use(authController.protect);

// Public routes (authenticated users)
router.get('/', coinController.getAllCoins);
router.get('/:id', coinController.getCoin);

// Admin routes
router.use(authController.restrictTo('admin'));

router.post('/', uploadCoin, coinController.createCoin);
router.patch('/:id', uploadCoin, coinController.editCoin);
router.delete('/:id', coinController.deleteCoin);

module.exports = router;