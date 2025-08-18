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
    .get(
        authController.protect,
        giftcardController.getAllGiftCards
    )

router.route('/:id')
    .get(
        authController.protect,
        giftcardController.getGiftcard
    )
    .patch(
        authController.protect,
        authController.restrictTo('admin'),
        uploadGiftcard,
        giftcardController.editGiftcard
    )

module.exports = router;