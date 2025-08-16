const AppError = require("../utils/appError");

const handleSequelizeDuplicateError = err=>{
    const errors = err.errors.reduce((acc, error)=>{
        acc[error.path] = `${error.path} is already in used. Please use another value`;
        return acc;
    }, {})

    return new AppError('Invalid  Data supplied', errors, 400)
}
const handleSequelizeValidationError = err=>{
    const errors = err.errors.reduce((acc, error)=>{
        acc[error.path] = error.message
        return acc;
    }, {})
    return new AppError('Invalid  Data supplied', errors, 400)
}

const handleCastErrorDb = err=>{
    let error =err;
    if(err.name== 'CastError' || err.reason == null){
        error = `Invalid ${err.path}: ${err.value}`;
    }
   
    if(err.reasons){
        if(err.reason.code == 'ERR_ASSERTION'){
            error = [{[err.path] :err.message}]
        }
    }
    return new AppError('Invalid data', error, 400)
}

const sendErrorProd = (err,  res)=>{
      
    //Operational error, trusted error
    if(err.isOperational){
        res.status(err.statusCode).json({
            status:err.status,
            message:err.message,
            errors:err.errors
        });
    //programming  and unknown error: Don't Leak detail
    }else{
        res.status(err.statusCode).json({
            status:err.status,
            message:'something went very wrong!',
            error:err.errors
        })
    }
   
}

const sendErrorDev = (err,  res)=>{
    res.status(err.statusCode).json({
        status:err.status,
        message:err.message,
        error:err
    })
}
module.exports = (err, req, res, next)=>{
    err.statusCode = err.statusCode || 500
    err.status = err.status || 'error'
   console.log(err)
    if(process.env.NODE_ENV === 'development'){
        sendErrorDev(err, res)
    }else if(process.env.NODE_ENV === 'production'){

        let error = { ...err, message: err.message, name: err.name };
        //Handle sequelize Errors
        if(error.name == 'CastError') error = handleCastErrorDb(error)
        if(error.name === 'SequelizeValidationError') error = handleSequelizeValidationError(error)
        if(error.name === 'SequelizeUniqueConstraintError') error = handleSequelizeDuplicateError(error)
      
        sendErrorProd(error,  res)
    }
   
}