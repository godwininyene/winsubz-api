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
})
