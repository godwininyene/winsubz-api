const express = require('express');
const router = express.Router();
const authController = require('./../controllers/authController');
const coinController = require('./../controllers/coinController');
const{uploadCoin} = require('./../utils/multerConfig');

router.route('/')
    .post(
        authController.protect,
        authController.restrictTo('admin'),
        uploadCoin,
        coinController.createCoin
    )
    .get(
        authController.protect,
        coinController.getAllCoins
    )

router.route('/:id')
    .get(
        authController.protect,
        coinController.getCoin
    )

module.exports = router;