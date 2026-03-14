const AppError = require("../utils/appError");
const catchAsync = require("../utils/catchAsync");
const { User, Wallet, Funding, sequelize } = require('./../models');
const fs = require('fs')

exports.fundWallet = catchAsync(async (req, res, next) => {
    const wallet = await Wallet.findOne({ where: { userId: req.params.id } });

    const { action, amount } = req.body;
    if (action === 'increment') {
        wallet.vtuBalance += parseInt(amount)
    } else if (action === 'decrement') {
        wallet.vtuBalance -= parseInt(amount)
    } else {
        return next(new AppError('Invalid action. Action is either increment or decrement', '', 400))
    }

    if (!amount || Number(amount) < 100) {
        return next(new AppError('"Minimum amount is ₦100"', '', 400))
    }

    await wallet.save();
    const user = await User.findByPk(req.params.id)
    res.status(200).json({
        status: 'success',
        data: {
            user
        }
    })
});


exports.monnifyWebhook = catchAsync(async (req, res, next) => {
    const crypto = require("crypto");

    const signature = req.headers["monnify-signature"];

    const hash = crypto
        .createHmac("sha512", process.env.MONNIFY_SECRET_KEY)
        .update(JSON.stringify(req.body))
        .digest("hex");

    // Verify webhook authenticity
    if (signature !== hash) {
        return res.status(401).json({
            status: "fail",
            message: "Invalid webhook signature",
            signature,
            hash
        });
    }

    const event = JSON.parse(req.body);
    const eventData = event.eventData;
    // Only process successful payments 
    if (event.eventType !== "SUCCESSFUL_TRANSACTION") {
        return res.status(200).json({ status: "ignored" });
    }

    fs.writeFileSync('./monnify-response.json', JSON.stringify(event))
    
    const reference = eventData.transactionReference;
    const amount = eventData.amountPaid;
    const accountReference = eventData.product.reference;

    const userId = accountReference.split("-")[1];

    // Check if transaction already processed
    const existingTransaction = await Funding.findOne({
        where: { reference }
    });

    if (existingTransaction) {
        return res.status(200).json({
            status: "success",
            message: "Transaction already processed"
        });
    }

    const wallet = await Wallet.findOne({
        where: { userId },
        lock: true
    });

    if (!wallet) {
        return next(new AppError("Wallet not found", "", 404));
    }

    // DATABASE TRANSACTION STARTS HERE
    const t = await sequelize.transaction();

    try {

        // Credit wallet
        wallet.vtuBalance += amount;
        await wallet.save({ transaction: t });

        // Save funding record
        await Funding.create({
            reference,
            amount,
            status: "success",
            type: "deposit",
            userId
        }, { transaction: t });

        // Commit transaction
        await t.commit();

        res.status(200).json({
            status: "success"
        });

    } catch (error) {

        // Rollback if anything fails
        await t.rollback();

        return next(new AppError("Transaction processing failed", "", 500));
    }

});