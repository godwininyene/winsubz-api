const catchAsync = require('./../utils/catchAsync')
const{Giftcard} = require('./../models')

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
})