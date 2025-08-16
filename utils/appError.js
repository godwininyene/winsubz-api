class AppError extends Error{
    constructor(message, errors, statusCode){
        super(message);
        this.errors = errors;
        this.statusCode = statusCode;
        this.status = `${statusCode}`.startsWith('4') ? 'fail' : 'error';
        this.isOperational = true;
    }
}

module.exports = AppError;