const catchAsync = require('./../utils/catchAsync')
const{Coin} = require('./../models');
const AppError = require('../utils/appError');
const deleteFile = require("../utils/deleteFile");
const APIFeatures = require("./../utils/apiFeatures");
const generatePaginationMeta = require('./../utils/pagination')
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

    const features = new APIFeatures(req.query, 'Coin').filter().sort().limitFields().paginate()
    if(req.user.role === 'user'){
        features.queryOptions.where = {
            ...features.queryOptions.where,
            status: 'active'  // Ensure only active coins are shown to user
        };
    }
    const {count, rows:coins} = await Coin.findAndCountAll(features.getFeaures());
    const{page, limit} = features.getPaginationInfo()
    const pagination = generatePaginationMeta(req, page, limit, count);
    res.status(200).json({
        status:"success",
        pagination,
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
});

exports.deleteCoin = catchAsync(async(req, res, next)=>{
    const coin = await Coin.findByPk(req.params.id);

    if(!coin){
        return next(new AppError("No coin was found with that ID", " ", 404))
    }
    //Delete coin image if it exist
    if(coin.coinImage){
        deleteFile(coin.coinImage, 'coins')
    }
    await coin.destroy();

    res.status(204).json({
        status:"success",
        data:null
    })
})