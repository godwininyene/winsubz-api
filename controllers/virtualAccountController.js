const { VirtualAccount } = require("../models");
const monnifyService = require("../services/monnifyService");
const AppError = require("../utils/appError");
const catchAsync = require("../utils/catchAsync");

/**
 *1. Request and Create a New Dedicated Virtual Bank Account
 * Automatically uses our centralized service class for the API handshake.
 */
exports.createVirtualAccount = catchAsync(async (req, res, next) => {
    const user = req.user;
    const { bvn, nin } = req.body;

    // A user must provide at least one form of valid identification to tie to the account
    if (!bvn && !nin) {
        return next(new AppError("BVN or NIN is required to generate a virtual account", "", 400));
    }

    // Ensure national identity configurations contain the correct character count string format
    if (nin && !/^\d{11}$/.test(String(nin))) {
        return next(new AppError("NIN must be exactly 11 digits", "", 400));
    }

    if (bvn && !/^\d{11}$/.test(String(bvn))) {
        return next(new AppError("BVN must be exactly 11 digits", "", 400));
    }

    // Check if we have already provisioned a bank account for this user profile
    const existingAccount = await VirtualAccount.findOne({
        where: { userId: user.id }
    });

    if (existingAccount) {
        return next(new AppError("User already has a virtual account", "", 400));
    }

    let accountData;

    try {
        // Use our clean, unified service class wrapper
        accountData = await monnifyService.createReservedAccount({
            userId: user.id,
            customerName: `${user.firstName} ${user.lastName}`,
            customerEmail: user.email,
            bvn,
            nin
        });
    } catch (error) {
        // If the Monnify API rejects the creation request (e.g., identity verification issues), pass the reason on
        if (error.response) {
            const message = error.response.data?.responseMessage || "Unable to create virtual account";
            return next(new AppError(message, "", error.response.status));
        }

        // Fallback for timeout or offline communication errors
        return next(new AppError("Monnify service unavailable", "", 500));
    }

    // Grab the first available bank option provided back from Monnify's multi-bank pool array
    const primaryAccount = accountData.accounts[0];

    // Log the newly minted virtual accounts inside our local database tracker
    const virtualAccount = await VirtualAccount.create({
        userId: user.id,
        accountReference: accountData.accountReference,
        accountName: accountData.accountName,
        accountNumber: primaryAccount.accountNumber,
        bankName: primaryAccount.bankName,
        bankCode: primaryAccount.bankCode || null,
        currency: accountData.currencyCode || "NGN",
        status: "active"
    });

    // Send the generated details right back to the user interface
    res.status(200).json({
        status: "success",
        data: {
            accountName: virtualAccount.accountName,
            accountNumber: virtualAccount.accountNumber,
            bankName: virtualAccount.bankName
        }
    });
});

/**
 * 🔍 2. Fetch Active Virtual Bank Accounts Saved Under the User Profile
 */
exports.getMyVirtualAccount = catchAsync(async (req, res, next) => {
    const account = await VirtualAccount.findOne({ 
        where: { userId: req.user.id } 
    });
    
    res.status(200).json({
        status: "success",
        data: {
            account
        }
    });
});