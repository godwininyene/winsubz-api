const catchAsync = require('./../utils/catchAsync')
const{Coin} = require('./../models');
const AppError = require('../utils/appError');
const deleteFile = require("../utils/deleteFile");

exports.createCoin = catchAsync(async(req, res, next)=>{
    //Handle file
    if(req.file){
        req.body.coinImage = `${process.env.APP_URL}/img/coins/${req.file.filename}`;
    }
    const coin = await Coin.create(req.body)
    res.status(201).json({
        status:"success",
        data:{
            coin
        }
    })
});

exports.getAllCoins = catchAsync(async(req, res, next)=>{
    const filter = {};
    if(req.user.role === 'user') filter.where={status:'active'};

    const coins = await Coin.findAll(filter);

    res.status(200).json({
        status:"success",
        result:coins.length,
        data:{
            coins
        }
    })
});

exports.getCoin = catchAsync(async(req, res, next)=>{
    const coin = await Coin.findByPk(req.params.id);
    if(!coin){
        return next(new AppError('No coin was found with that ID', ' ', 404))
    }

    res.status(200).json({
        status:"success",
        data:{
            coin
        }
    })
});
exports.editCoin = catchAsync(async(req, res, next)=>{
    const coin = await Coin.findByPk(req.params.id);
    if(!coin){
        return next(new AppError("No coin was found with that ID", " ", 404))
    }

    // Handle file
    if (req.file) {
        //1. Delete old image if exists
        if (coin.coinImage) {
            deleteFile(coin.coinImage, "coins");
        }
        // 2. Save new image
        req.body.coinImage = `${process.env.APP_URL}/img/coins/${req.file.filename}`;
    }

    await coin.update(req.body, { validate: true });

    res.status(200).json({
        status: "success",
        data: {
            coin,
        },
    });
})