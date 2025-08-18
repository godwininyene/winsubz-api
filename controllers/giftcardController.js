const catchAsync = require('./../utils/catchAsync')
const{Giftcard} = require('./../models');
const AppError = require('../utils/appError');
const deleteFile = require("../utils/deleteFile");

exports.createGiftcard = catchAsync(async(req, res, next)=>{
    //Handle file
    if(req.file){
        req.body.cardImage = `${process.env.APP_URL}/img/giftcards/${req.file.filename}`;
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
    const filter = {};
    if(req.user.role === 'user') filter.where={status:'active'};

    const cards = await Giftcard.findAll(filter);

    res.status(200).json({
        status:"success",
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
        if (card.cardImage) {
            deleteFile(card.cardImage, "giftcards");
        }

        // 2. Save new image
        req.body.cardImage = `${process.env.APP_URL}/img/giftcards/${req.file.filename}`;
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
    if (card.cardImage) {
        deleteFile(card.cardImage, "giftcards");
    }

    res.status(204).json({
        status:"success",
        data:null
    })
})
