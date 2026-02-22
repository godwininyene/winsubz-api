const express = require('express');
const cookieParser = require('cookie-parser');
const path = require('path')
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { xss } = require('express-xss-sanitizer'); 
const hpp = require('hpp');
const cors = require('cors');
const globalErrorController = require('./controllers/errorController')
//routers
const userRouter = require('./routes/userRoutes');
const giftcardRouter = require('./routes/giftcardRoutes')
const coinRouter = require('./routes/coinRoutes')
const dataRouter = require('./routes/dataRoutes')
const airtimeRouter = require('./routes/airtimeRoutes')
const electricityRouter = require('./routes/electricityRoutes')
const cableRouter  = require('./routes/cableRoutes');
const transactionRouter = require('./routes/transactionRoutes')
const bankAccountRouter = require('./routes/bankAccountRoutes')
const statsRouter = require('./routes/statsRoutes')
const settingsRouter = require('./routes/settingsRoutes')



const AppError = require('./utils/appError');

const app = express();
// Tell Express to trust proxy headers like X-Forwarded-For
app.set('trust proxy', 1);

// Security middleware
app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));

// Rate limiting
const limiter = rateLimit({
    max: 300,
    windowMs: 60 * 60 * 1000,
    message: "Too many requests from this IP, please try again in an hour!"
});
app.use('/api', limiter);


app.set('view engine', 'pug')
app.set('views', path.join(__dirname, 'views'));
// Enable nested query parsing (like Express 4)
app.set('query parser', 'extended');

// Body parsing
app.use(express.json());
app.use(cookieParser());

//Serve static file
app.use(express.static(path.join(__dirname, 'public')))

// Data sanitization (AFTER body parsing)
app.use(xss()); 
app.use(hpp());

// CORS (after security middleware)
app.use(cors({
    origin: process.env.FRONTEND_URL,
    credentials: true
}));
app.options(/.*/, cors({
    origin: process.env.FRONTEND_URL,
    credentials: true
}));


// Routes
app.use('/api/v1/users', userRouter);
app.use('/api/v1/giftcards', giftcardRouter);
app.use('/api/v1/coins', coinRouter);
app.use('/api/v1/transactions', transactionRouter);
app.use('/api/v1/bankAccounts', bankAccountRouter);
app.use('/api/v1/stats', statsRouter);
app.use('/api/v1/settings', settingsRouter)
app.use('/api/v1/data', dataRouter)
app.use('/api/v1/airtime', airtimeRouter);
app.use('/api/v1/electricity', electricityRouter)
app.use('/api/v1/cables', cableRouter)
//Not found route
app.all(/.*/, (req, res, next)=>{
    return next(new AppError(`The requested URL ${req.originalUrl} was not found on this server!`, '', 404))
})

// Error handling
app.use(globalErrorController);
module.exports = app;