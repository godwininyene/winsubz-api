const {User, Wallet} = require("../models");
const AppError = require("../utils/appError");
const catchAsync = require("../utils/catchAsync");
const jwt = require('jsonwebtoken');


const signToken = user=>{
    return jwt.sign({id:user.id}, process.env.JWT_SECRET, {
        expiresIn:process.env.JWT_EXPIRESIN
    })
}

const createSendToken = (user, statusCode, req, res) => {
    const token = signToken(user);
    const cookieOption = {
        expires: new Date(Date.now() + process.env.JWT_COOKIE_EXPIRESIN * 24 * 60 * 60 * 1000),
        httpOnly: true,
        sameSite: 'None',
    };

    // Set 'secure' flag in production or if the request is secure
    if (process.env.NODE_ENV === 'production' || req.secure) {
        cookieOption.secure = true;
    }
    // Send the cookie
    res.cookie('jwt', token, cookieOption);
    // Remove password from the output
    user.password = undefined;
    user.passwordConfirm = undefined;
    // Send the response
    res.status(statusCode).json({
        status: "success",
        token,
        data: {
            user,
        },
    });
};


exports.signup = catchAsync(async(req, res,next)=>{
    //1. Create user
    const user = await User.create(
        {
            firstName:req.body?.firstName,
            lastName: req.body?.lastName,
            email: req.body?.email,
            phone:req.body?.phone,
            password:req.body?.password,
            passwordConfirm:req.body?.passwordConfirm,
            referralId:req.body?.referralId,
        }
    );
    //2. Create a wallet for the newly created user
    await Wallet.create({userId:user.id});
    //3. Send token to user
    createSendToken(user, 201, req, res)
});

exports.login = catchAsync(async(req, res, next)=>{
    //1. Get user based on POSTed email
    const{email, password} = req.body;

    //2. Check if email and password is there
    if(!email || !password){
        return next(new AppError("Please provide email and password", '', 401))
    }

    //3. Check if user exist,  password is correct, and active check
    const user = await User.scope(['withPassword', 'defaultScope']).findOne(
        {where: { email },
        include:[{model: Wallet, as:'wallet'}]
    });

    if(!user || !(await user.correctPassword(password, user.password))){
        return next(new AppError('Password or email is incorrect', '', 400))
    }

    //4. Check if account is active
    if(user.status !== 'active' && user.status !== 'pending'){
        return next(new AppError(`Your account has been ${user.status}. If you believe this is a mistake, please contact our support team.` , '', 400))
    }

    //5. Everything is okay, send token to client
    createSendToken(user, 200, req, res)
});

exports.logout = (req, res) => {
    res.cookie('jwt', 'loggedout', {
      expires: new Date(Date.now() + 10 * 1000),
      httpOnly: true,
      secure:true,
      sameSite: 'None',
    });
    res.status(200).json({ status: 'success' });
  };
