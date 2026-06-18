const catchAsync = require("../utils/catchAsync");
const getMonnifyToken = require("../utils/monnifyAuth");
const axios = require("../lib/axios");
const { VirtualAccount } = require("../models");
const AppError = require("../utils/appError");

exports.createVirtualAccount = catchAsync(async (req, res, next) => {

    const user = req.user;
    const { bvn, nin } = req.body;

    if (!bvn && !nin) {
        return next(new AppError("BVN or NIN is required to generate a virtual account", "", 400));
    }

    if (nin && !/^\d{11}$/.test(String(nin))) {
        return next(new AppError("NIN must be exactly 11 digits", "", 400));
    }

    if (bvn && !/^\d{11}$/.test(String(bvn))) {
        return next(new AppError("BVN must be exactly 11 digits", "", 400));
    }
    const existingAccount = await VirtualAccount.findOne({
        where: { userId: user.id }
    });

    if (existingAccount) {
        return next(new AppError("User already has a virtual account", "", 400));
    }

    const token = await getMonnifyToken();

    const payload = {
        accountReference: `winsubz-${user.id}`,
        accountName: `${user.firstName} ${user.lastName}`,
        currencyCode: "NGN",
        contractCode: process.env.MONNIFY_CONTRACT_CODE,
        customerEmail: user.email,
        customerName: `${user.firstName} ${user.lastName}`,
        getAllAvailableBanks: true
    };

    if (bvn) payload.bvn = bvn;
    if (nin) payload.nin = nin;

    let response;

    try {
        response = await axios.post(
            `${process.env.MONNIFY_BASE_URL}/api/v2/bank-transfer/reserved-accounts`,
            payload,
            {
                headers: {
                    Authorization: `Bearer ${token}`,
                },
            }
        );

        
    } catch (error) {

        // Handle Monnify error response
        if (error.response) {
            const message =
                error.response.data?.responseMessage ||
                "Unable to create virtual account";

            return next(new AppError(message, "", error.response.status));
        }

        // Handle network errors
        return next(new AppError("Monnify service unavailable", "", 500));
    }

    const accountData = response.data.responseBody;
    const primaryAccount = accountData.accounts[0];

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

    res.status(200).json({
        status: "success",
        data: {
            accountName: virtualAccount.accountName,
            accountNumber: virtualAccount.accountNumber,
            bankName: virtualAccount.bankName
        }
    });

});

exports.getMyVirtualAccount = catchAsync(async(req,res,next)=>{ 
    const account = await VirtualAccount.findOne({where: {userId: req.user.id}});
    res.status(200).json({
        status:"success",
        data:{
            account
        }
    })
})

