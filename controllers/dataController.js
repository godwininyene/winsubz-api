const axios = require('../lib/axios');
const catchAsync = require('./../utils/catchAsync');
const AppError = require('../utils/appError');
const getCostPrice = require('./../utils/getCostPrice');
const normalizeProviderResponse = require('./../utils/normalizeProviderResponse');
const transactionService = require('../services/transactionService');
const providerService = require('../services/providerService');
const promoService = require('../services/promoService');
const { VTUTransaction, Wallet, User, sequelize } = require("../models");

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

    let context;

    // 1. Initialize row locking and ledger creations securely with explicit error safety
    try {
        context = await transactionService.initialize({
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
    } catch (initErr) {
        console.error("Critical: Data transaction failed to initialize in DB:", initErr.message);

        //If it's a known business validation rule (like low balance), pass it straight through
        if (initErr.isOperational) {
            return next(new AppError(initErr.message, "", initErr.statusCode || 400));
        }

        // Safely fail early since no transaction was written and the user wasn't debited
        return next(new AppError("System busy. Please try again shortly.", "", 500));
    }

    if (context.isDuplicate) {
        return res.status(200).json({
            status: "success",
            data: { transaction: await transactionService.getResponsePayload(context.tx.id) }
        });
    }

    try {
        // Call the unified processor engine
        const finalStatus = await providerService.processGsubzTransaction({
            context,
            serviceType: "data",
            serviceId,
            faceValue,
            sellingPrice,
            payload: { serviceId, plan, phone, providerRequestId: context.providerRequestId }
        });

        // SUCCESS HOOKS: Run only if the unified processor confirmed true success
        if (finalStatus === "success") {
            if (req.user.referralId) {
                try {
                    await sequelize.transaction(async (t) => {
                        const referrer = await User.findOne({
                            where: { accountId: req.user.referralId },
                            transaction: t
                        });
                        if (referrer && referrer.id !== req.user.id) {
                            const referralWallet = await Wallet.findOne({
                                where: { userId: referrer.id },
                                lock: t.LOCK.UPDATE,
                                transaction: t
                            });
                            if (referralWallet) {
                                referralWallet.referralBalance += 2;
                                await referralWallet.save({ transaction: t });
                            }
                        }
                    });
                } catch (referralErr) {
                    // Log it, but the transaction itself already succeeded —
                    // never let this crash cascade into the outer catch below.
                    console.error(`Referral bonus crediting failed for TX ${context.tx.id}:`, referralErr.message);
                }
            }

            try {
                await promoService.checkAndTriggerPromoPayout(req.user.id);
            } catch (promoErr) {
                console.error("Promo processing failed silently:", promoErr);
            }
        }

    } catch (err) {
        console.error("Data runtime processing failure:", err);
        if (context && context.tx) {
            try {
                // Safe database fallback update
                await context.tx.update({
                    status: "pending",
                    deliveryMessage: err.message || "Network connection error"
                });
            } catch (dbErr) {
                console.error("Critical: Database pool dropped during fallback logging:", dbErr.message);
            }
        }
    }

    // 2. Output uniform response structure safely
    let output;
    try {
        output = await transactionService.getResponsePayload(context.tx.id);
    } catch (payloadErr) {
        console.error("Failed fetching live data payload from DB, serving fallback memory state:", payloadErr.message);
        output = {
            service: plansRes.data.service || selectedPlan.displayName,
            amount: sellingPrice,
            status: "pending",
            beneficiary: phone,
            token: null,
            ref: 'N/A',
            deliveryMessage: "Transaction processing. Check status shortly.",
            createdAt: new Date()
        };
    }

    return res.status(200).json({
        status: "success",
        message: output.status === "success"
            ? "Transaction successful"
            : (output.deliveryMessage || "Transaction is being processed. Please check back shortly."),
        data: { transaction: output }
    });
});

exports.verifyTransaction = catchAsync(async (req, res, next) => {
    const { requestId } = req.params;
    if (!requestId) return next(new AppError("Request ID is required", "", 400));

    const tx = await VTUTransaction.findOne({ where: { requestId } });
    if (!tx) return next(new AppError("Transaction not found", "", 404));

    // 🚀 REFACTOR: Forward directly to your unified service engine to eliminate race conditions!
    try {
        await transactionService.verifyTransactionInternal(tx);

        // Fetch fresh state out of the engine payload mapping
        const output = await transactionService.getResponsePayload(tx.id);

        return res.status(200).json({
            status: "success",
            message: output.status === "success"
                ? "Transaction successful"
                : output.status === "failed"
                    ? "Transaction failed and processed"
                    : "Transaction is pending execution",
            data: { transaction: output }
        });
    } catch (err) {
        return res.status(200).json({
            status: "success",
            message: "Unable to complete real-time verification. Status will update via background systems shortly.",
            data: { transaction: await transactionService.getResponsePayload(tx.id) }
        });
    }
});