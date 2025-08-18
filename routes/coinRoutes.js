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

module.exports = router;