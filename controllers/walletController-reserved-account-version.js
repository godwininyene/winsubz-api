const AppError = require("../utils/appError");
const catchAsync = require("../utils/catchAsync");
const { User, Wallet, Funding, sequelize } = require('./../models');
const fs = require('fs')
const crypto = require("crypto");

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
    // Fixed VTU wallet funding charge
    const VTU_CHARGE = 50;

    // Get signature from Monnify headers
    const signature = req.headers["monnify-signature"];

    // Convert raw buffer body to string
    const rawBody = req.body.toString();

    // Compute HMAC SHA512 hash to verify webhook authenticity
    const hash = crypto
        .createHmac("sha512", process.env.MONNIFY_SECRET_KEY)
        .update(rawBody)
        .digest("hex");

    // If signature mismatch, reject webhook
    if (signature !== hash) {
        return res.status(401).json({
            status: "fail",
            message: "Invalid webhook signature",
            signature,
            hash
        });
    }

    // Parse webhook event from raw body
    const event = JSON.parse(rawBody);
    const eventData = event.eventData;

    // Only process successful transactions
    if (event.eventType !== "SUCCESSFUL_TRANSACTION") {
        return res.status(200).json({ status: "ignored" });
    }

    // Optional: log the webhook for debugging
    fs.writeFileSync('./monnify-response.json', JSON.stringify(event));

    // Extract transaction info
    const reference = eventData.transactionReference;
    const amount = eventData.amountPaid;

    // Get account reference to determine user
    const accountReference = eventData.product?.reference || eventData.productReference;
    const userId = accountReference.split("-")[1];

    // Check if transaction has already been processed
    const existingTransaction = await Funding.findOne({ where: { reference } });
    if (existingTransaction) {
        return res.status(200).json({
            status: "success",
            message: "Transaction already processed"
        });
    }

    // Start database transaction
    const t = await sequelize.transaction();

    // Lock wallet row to prevent race conditions
    const wallet = await Wallet.findOne({
        where: { userId },
        transaction: t,
        lock: t.LOCK.UPDATE
    });

    if (!wallet) {
        return next(new AppError("Wallet not found", "", 404));
    }

    try {
        // Credit wallet after deducting VTU charge
        const creditedAmount = amount - VTU_CHARGE;
        wallet.vtuBalance += creditedAmount;
        await wallet.save({ transaction: t });

        // Save funding record including original amount, charge, and credited amount
        await Funding.create({
            reference,
            amount,
            status: "success",
            type: "deposit",
            userId,
            charge: VTU_CHARGE,
            creditedAmount
        }, { transaction: t });

        // Commit DB transaction
        await t.commit();

        // Return success response
        res.status(200).json({
            status: "success"
        });

    } catch (error) {
        // Rollback if any operation fails
        await t.rollback();
        return next(new AppError("Transaction processing failed", "", 500));
    }
});