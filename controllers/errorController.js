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
    return new AppError('Invalid field value', errors, 400)
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

const handleJWTExpired = ()=> new AppError( "Your token has expired. Please log in again!", " ", 401)
const handleJWTError = ()=> new AppError("Invalid token. Please log in again!", " ", 401)

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
module.exports = (err, req, res, next) => {
    console.log('LIVE ERROR', err);

    err.statusCode = err.statusCode || 500;

    // 🚩 FIX: never trust a pre-existing err.status — some libraries
    // (axios errors, for example) already define their own `.status`
    // property as a raw HTTP status NUMBER (e.g. 401), which is truthy
    // and therefore survived `err.status || 'error'` untouched, leaking
    // the number straight into the API response instead of your
    // app's string convention ('fail' / 'error').
    //
    // Always derive it fresh from statusCode instead.
    err.status = `${err.statusCode}`.startsWith('4') ? 'fail' : 'error';

    if (process.env.NODE_ENV === 'development') {
        sendErrorDev(err, res);
    } else if (process.env.NODE_ENV === 'production') {

        let error = { ...err, message: err.message, name: err.name };
        // Handle jwt error
        if (error.name === 'TokenExpiredError') error = handleJWTExpired();
        if (error.name === 'JsonWebTokenError') error = handleJWTError();

        // Handle sequelize Errors
        if (error.name == 'CastError') error = handleCastErrorDb(error);
        if (error.name === 'SequelizeValidationError') error = handleSequelizeValidationError(error);
        if (error.name === 'SequelizeUniqueConstraintError') error = handleSequelizeDuplicateError(error);

        // 🚩 Also re-derive status here — the handlers above create fresh
        // AppError instances with their own statusCode, and those AppError
        // constructors may set .status independently. Keep it consistent
        // no matter which path produced the final `error` object.
        error.statusCode = error.statusCode || 500;
        error.status = `${error.statusCode}`.startsWith('4') ? 'fail' : 'error';

        sendErrorProd(error, res);
    }
};

// module.exports = (err, req, res, next)=>{
//     console.log('LIVE ERROR', err);
    
//     err.statusCode = err.statusCode || 500
//     err.status = err.status || 'error'
//     if(process.env.NODE_ENV === 'development'){
//         sendErrorDev(err, res)
//     }else if(process.env.NODE_ENV === 'production'){

//         let error = { ...err, message: err.message, name: err.name };
//         //Handle jwt error
//         if(error.name === 'TokenExpiredError') error = handleJWTExpired()
//         if(error.name === 'JsonWebTokenError') error = handleJWTError()
    
//         //Handle sequelize Errors
//         if(error.name == 'CastError') error = handleCastErrorDb(error)
//         if(error.name === 'SequelizeValidationError') error = handleSequelizeValidationError(error)
//         if(error.name === 'SequelizeUniqueConstraintError') error = handleSequelizeDuplicateError(error)
      
//         sendErrorProd(error,  res)
//     }
   
// }