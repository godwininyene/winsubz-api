const express = require('express');
const router = express.Router();
const authController = require('./../controllers/authController');
const coinController = require('./../controllers/coinController');
const{uploadCoin} = require('./../utils/multerConfig');
const { UPDLOCK } = require('sequelize/lib/table-hints');

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
    .patch(
        authController.protect,
        authController.restrictTo('admin'),
        uploadCoin,
        coinController.editCoin
    )
    .delete(
        authController.protect,
        authController.restrictTo('admin'),
        uploadCoin,
        coinController.deleteCoin
    )
    

module.exports = router;