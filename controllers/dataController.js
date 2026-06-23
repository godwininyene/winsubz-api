const axios = require('../lib/axios');
const catchAsync = require('./../utils/catchAsync');
const AppError = require('../utils/appError');
const getCostPrice = require('./../utils/getCostPrice');
const normalizeProviderResponse = require('./../utils/normalizeProviderResponse');
const transactionService = require('../services/transactionService');
const providerService = require('../services/providerService');
const { VTUTransaction, Wallet, User } = require("../models");

function applyMarkup(amount) {
    const RATE = 0.03; // 3%
    const MIN = 30;
    const MAX = 100;

    let profit = Math.round(amount * RATE);

    if (profit < MIN) profit = MIN;
    if (profit > MAX) profit = MAX;

    //Promo configuration
    const promoEnabled = process.env.DATA_PROMO_ENABLED === "true";
    const promoStart = process.env.DATA_PROMO_START ? new Date(process.env.DATA_PROMO_START) : null;
    const promoEnd = process.env.DATA_PROMO_END ? new Date(process.env.DATA_PROMO_END) : null;
    const now = new Date();

    // During promo, remove our markup completely
    if (promoEnabled && promoStart && promoEnd && now >= promoStart && now <= promoEnd) {
        profit = 0;
    }

    return amount + profit;
}

exports.getDataPlans = catchAsync(async (req, res, next) => {
    try {
        const result = await axios.get(`api/plans?service=${req.query.network}`);
        const plans = result.data.plans;

        if (plans) {
            const formattedPlans = plans.map(plan => {
                return {
                    serviceId: req.query.network,
                    plan: plan.value,
                    provider_amount: parseInt(plan.price),
                    amount: applyMarkup(parseInt(plan.price)),
                    label: plan.displayName
                };
            });
            res.status(200).json({
                status: "success",
                data: {
                    network: result.data.network,
                    plans: formattedPlans
                }
            });
        } else {
            return next(new AppError('No plans available please try again later.', '', 404));
        }
    } catch (err) {
        if (err.response) {
            return next(new AppError(err.response.data?.error || 'External API error', "", err.response.status));
        }
        if (err.request) {
            return next(new AppError('External API did not respond', 'Service temporarily unavailable', 502));
        }
        return next(err);
    }
});

exports.buyData = catchAsync(async (req, res, next) => {
    const { serviceId, plan, phone, requestId } = req.body;

    if (!requestId) return next(new AppError("Request ID is required", "", 400));
    if (!serviceId || !phone || !plan) return next(new AppError("serviceID, phone and plan are required", "", 400));

    // Fetch plan details
    const plansRes = await axios.get(`api/plans?service=${serviceId}`);
    const selectedPlan = plansRes.data.plans.find(p => p.value === plan);
    if (!selectedPlan) return next(new AppError("Invalid data plan selected", "", 400));

    const faceValue = parseInt(selectedPlan.price);
    const sellingPrice = applyMarkup(faceValue);

    // Initialize row locking and ledger creations securely
    const context = await transactionService.initialize({
        userId: req.user.id,
        type: 'data',
        provider: 'gsubz',
        serviceId,
        serviceName: plansRes.data.service || selectedPlan.displayName,
        beneficiary: phone,
        faceValue,
        sellingPrice,
        requestId,
        extraFields: { planCode: plan, planLabel: selectedPlan.displayName }
    });

    if (context.isDuplicate) {
        return res.status(200).json({
            status: "success",
            data: { transaction: await transactionService.getResponsePayload(context.tx.id) }
        });
    }

    try {
        const resData = await providerService.dispatch("gsubz", "data", {
            serviceId, plan, phone, providerRequestId: context.providerRequestId
        });

        const { status: normalizedStatus, isSuccessStatus, isSuccessCode, providerRef } = normalizeProviderResponse(resData);
        const isSuccess = isSuccessCode && isSuccessStatus && providerRef;
        const status = isSuccess ? "success" : "pending";

        const actualCost = getCostPrice("gsubz", faceValue, { type: "data", apiResponse: resData });
        const roundedCost = Math.round(actualCost);

        await context.tx.update({
            status,
            providerStatus: normalizedStatus,
            providerRef,
            costPrice: roundedCost,
            amountPaid: actualCost,
            profit: sellingPrice - roundedCost,
            providerDiscount: Math.round(Math.max(faceValue - actualCost, 0)),
            finalBalance: context.wallet.vtuBalance
        });

        if (resData?.description === 'INSUFFICIENT_BALANCE') {
            return next(new AppError("Service temporarily unavailable. Please try again later.", "Provider wallet low", 503));
        }

        //Referral Logic (ONLY on success)
        if (status === "success" && req.user.referralId) {
            const referrer = await User.findOne({ where: { accountId: req.user.referralId } });
            if (referrer && referrer.id !== req.user.id) {
                const referralWallet = await Wallet.findOne({ where: { userId: referrer.id } });
                if (referralWallet) {
                    referralWallet.referralBalance += 2; // ₦2 Bonus
                    await referralWallet.save();
                }
            }
        }
    } catch (err) {
        await context.tx.update({ status: "pending" });
    }

    const output = await transactionService.getResponsePayload(context.tx.id);
    return res.status(200).json({
        status: "success",
        message: output.status === "success" ? "Transaction successful" : "Transaction is being processed. Please check back shortly.",
        data: { transaction: output }
    });
});

exports.verifyTransaction = catchAsync(async (req, res, next) => {
    const { requestId } = req.params;
    if (!requestId) return next(new AppError("Request ID is required", "", 400));

    const tx = await VTUTransaction.findOne({ where: { requestId } });
    if (!tx) return next(new AppError("Transaction not found", "", 404));

    if (tx.status === "success") {
        return res.status(200).json({
            status: "success",
            message: "Transaction already successful",
            data: { transaction: tx }
        });
    }

    const providerRequestId = tx.providerRequestId || tx.requestId.split('-').slice(0, 4).join('-');

    try {
        const formData = new FormData();
        formData.append("requestID", providerRequestId);
        formData.append("api", process.env.GSUBZ_API_KEY);

        const providerResponse = await axios.post(`api/verify/`, formData, {
            headers: { Authorization: `Bearer ${process.env.GSUBZ_API_KEY}` }
        });

        const { status: normalizedStatus, isSuccessStatus, isFailedStatus, isSuccessCode, providerRef } = normalizeProviderResponse(providerResponse.data);

        if (isSuccessCode && isSuccessStatus) {
            await tx.update({
                status: "success",
                providerStatus: normalizedStatus,
                providerRef: providerRef || tx.providerRef
            });
            return res.status(200).json({
                status: "success",
                message: "Transaction confirmed successful",
                data: { transaction: tx }
            });
        }

        if (isFailedStatus) {
            if (tx.status !== "failed") {
                const wallet = await Wallet.findOne({ where: { userId: tx.userId } });
                if (wallet) {
                    await transactionService.processRefund(tx, wallet, tx.sellingPrice);
                    await tx.update({ providerStatus: normalizedStatus, finalBalance: wallet.vtuBalance + tx.sellingPrice });
                }
            }
            return res.status(200).json({
                status: "success",
                message: "Transaction failed and refunded",
                data: { transaction: tx }
            });
        }

        return res.status(200).json({ status: "success", message: "Transaction still pending", data: { transaction: tx } });
    } catch (err) {
        return res.status(200).json({ status: "success", message: "Unable to verify at the moment. Please try again later.", data: { transaction: tx } });
    }
});