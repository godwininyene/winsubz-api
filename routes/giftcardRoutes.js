const express = require('express');
const router = express.Router();
const authController = require('./../controllers/authController');
const giftcardController = require('./../controllers/giftcardController');
const{uploadGiftcard} = require('./../utils/multerConfig');

router.route('/')
    .post(
        authController.protect,
        authController.restrictTo('admin'),
        uploadGiftcard,
        giftcardController.createGiftcard
    )


module.exports = router;