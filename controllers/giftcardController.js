const catchAsync = require('./../utils/catchAsync')
const{Giftcard} = require('./../models');
const AppError = require('../utils/appError');
const deleteFile = require("../utils/deleteFile");
const APIFeatures = require('../utils/apiFeatures');
const generatePaginationMeta = require('../utils/pagination');

exports.createGiftcard = catchAsync(async(req, res, next)=>{
    //Handle file
    if(req.file){
        req.body.cardLogo = `${process.env.APP_URL}/img/giftcards/${req.file.filename}`;
    }
    const card = await Giftcard.create(req.body)
    res.status(201).json({
        status:"success",
        data:{
            card
        }
    })
})

exports.getAllGiftCards = catchAsync(async(req, res, next)=>{
    const features = new APIFeatures(req.query, 'Giftcard').filter().sort().limitFields().paginate()
    if(req.user.role === 'user'){
        features.queryOptions.where = {
            ...features.queryOptions.where,
            status: 'active'  // Ensure only active cards are shown to user
        };
    }
    const {count, rows:cards} = await Giftcard.findAndCountAll(features.getFeaures());
    const{page, limit} = features.getPaginationInfo()
    const pagination = generatePaginationMeta(req, page, limit, count);
    res.status(200).json({
        status:"success",
        pagination,
        result:cards.length,
        data:{
            cards
        }
    })
});

exports.getGiftcard = catchAsync(async(req, res, next)=>{
    const card = await Giftcard.findByPk(req.params.id);
    if(!card){
        return next(new AppError('No giftcard was found with that ID', ' ', 404))
    }

    res.status(200).json({
        status:"success",
        data:{
            card
        }
    })
});

exports.editGiftcard = catchAsync(async(req, res, next)=>{
    const card = await Giftcard.findByPk(req.params.id);
    if (!card) {
        return next(new AppError("No giftcard was found with that ID", " ", 404));
    }

    // Handle file
    if (req.file) {
        //1. Delete old image if exists
        if (card.cardLogo) {
            deleteFile(card.cardLogo, "giftcards");
        }

        // 2. Save new image
        req.body.cardLogo = `${process.env.APP_URL}/img/giftcards/${req.file.filename}`;
    }

    await card.update(req.body, { validate: true });

    res.status(200).json({
        status: "success",
        data: {
            card,
        },
    });
})

exports.deleteGiftcard = catchAsync(async(req, res, next)=>{
    const card = await Giftcard.findByPk(req.params.id);
    if(!card){
        return next(new AppError("No giftcard was found with that ID", " ", 404))
    }

    //Delete card image if exists
    if (card.cardLogo) {
        deleteFile(card.cardLogo, "giftcards");
    }

    await card.destroy();

    res.status(204).json({
        status:"success",
        data:null
    })
})
