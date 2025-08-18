const catchAsync = require('./../utils/catchAsync');
const AppError = require('./../utils/appError');
const{User} = require('./../models');

const filterBody = (obj, ...allowedFields)=>{
    const newObj = {};
    if(obj){
        Object.keys(obj).forEach(el=>{
        if(allowedFields.includes(el)) newObj[el] = obj[el];
    });
    }

    return newObj;
}

exports.updateMe = catchAsync(async(req, res, next)=>{
    // 1. Raise error if user try to POST password
    if(req.body?.password || req.body?.passwordConfirm){
        return next(new AppError('This route is not for password updates. Please use /updateMyPassword route!', '', 400));
    }

    // 2. Filter out unwanted fields and only allow specific updates
    const allowedFields = ['firstName', 'lastName', 'email', 'phone', 'photo'];
    const filteredBody = filterBody(req.body, ...allowedFields);

    // 3. Handle file upload if present
    if (req.file) {
       filteredBody.photo = `${process.env.APP_URL}/img/users/${req.file.filename}`;
    }

    // 4. Update user document
    const user = await User.findByPk(2);
    if(!user){
        return next(new AppError("User not found", "", 404))
    }
    await user.update(filteredBody, {validate:true})

    res.status(200).json({
        status:"success",
        data:{
            user
        }
    })
})

exports.getAllUsers = catchAsync(async(req, res, next)=>{
    const users = await User.findAll();

    res.status(200).json({
        status:"success",
        result:users.length,
        data:{
            users
        }
    })
})