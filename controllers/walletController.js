const AppError = require("../utils/appError");
const catchAsync = require("../utils/catchAsync");
const{User, Wallet} = require('./../models');

exports.fundWallet = catchAsync(async(req, res, next)=>{
    const wallet = await Wallet.findOne({where: {userId:req.params.id}});

    const{action, amount} = req.body;
    if(action === 'increment'){
        wallet.vtuBalance+= parseInt(amount)
    }else if(action === 'decrement'){
        wallet.vtuBalance-= parseInt(amount)
    }else{
        return next(new AppError('Invalid action. Action is either increment or decrement', '', 400))
    }

    if (!amount || Number(amount) < 100) {
       return next(new AppError('"Minimum amount is ₦100"', '', 400))
    }
    
    await wallet.save();
    const user = await User.findByPk(req.params.id)
    res.status(200).json({
        status:'success',
        data:{
            user
        }
    })
});