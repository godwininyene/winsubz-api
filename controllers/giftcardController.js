const catchAsync = require('./../utils/catchAsync')
const{Giftcard} = require('./../models');
const AppError = require('../utils/appError');
const fs = require("fs");
const path = require("path");


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
        // 1. Remove previous image
        if (card.cardImage) {
            // card.cardImage has full URL, so extract filename(http://127.0.0.1:9000/img/giftcards/cardImage-1755526645717-77652870.jpg)
            const oldImage = card.cardImage.split("/img/giftcards/")[1];
            const oldImagePath = path.join(__dirname, "..", "public", "img", "giftcards", oldImage);

            fs.unlink(oldImagePath, (err) => {
            if (err) {
                console.error("Failed to delete old image:", err.message);
            } else {
                console.log("Old image deleted:", oldImage);
            }
            });
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

