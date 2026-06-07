const axios = require('../lib/axios');
const catchAsync = require('./../utils/catchAsync');
const AppError = require('../utils/appError');
const normalizeProviderResponse = require('./../utils/normalizeProviderResponse')
const {
    VTUTransaction,
    Wallet,
    sequelize,
    User
} = require("../models");


// function applyMarkup(amount) {
//     const RATE = 0.03;   // 3%
//     const MIN = 30;
//     const MAX = 100;

//     let profit = Math.round(amount * RATE);

//     if (profit < MIN) profit = MIN;
//     if (profit > MAX) profit = MAX;

//     const sellingPrice = amount + profit;
//     return sellingPrice
// }

function applyMarkup(amount) {
    const RATE = 0.03; // 3%
    const MIN = 30;
    const MAX = 100;

    let profit = Math.round(amount * RATE);

    // Apply min/max rules
    if (profit < MIN) profit = MIN;
    if (profit > MAX) profit = MAX;

    // 🎉 Promo configuration
    const promoEnabled =
        process.env.DATA_PROMO_ENABLED === "true";

    const promoStart = process.env.DATA_PROMO_START
        ? new Date(process.env.DATA_PROMO_START)
        : null;

    const promoEnd = process.env.DATA_PROMO_END
        ? new Date(process.env.DATA_PROMO_END)
        : null;

    const now = new Date();

    // During promo, remove our markup completely
    if (
        promoEnabled &&
        promoStart &&
        promoEnd &&
        now >= promoStart &&
        now <= promoEnd
    ) {
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
            return next(new AppError('No plans available please try again later.', '', 404))
        }

    } catch (err) {
        if (err.response) {
            return next(
                new AppError(err.response.data?.error || 'External API error', "", err.response.status)
            );
        }

        if (err.request) {
            return next(
                new AppError(
                    'External API did not respond',
                    'Service temporarily unavailable',
                    502
                )
            );
        }

        return next(err);
    }
});

exports.buyData = catchAsync(async (req, res, next) => {
    const { serviceId, plan, phone, requestId } = req.body;

    if (!requestId) {
        return next(new AppError("Request ID is required", "", 400));
    }

    if (!serviceId || !phone || !plan) {
        return next(new AppError("serviceID, phone and plan are required", "", 400));
    }

    // ✅ Generate providerRequestId (truncate UUID safely)
    const providerRequestId = requestId.split('-').slice(0, 4).join('-');

    // ✅ Idempotency check (still based on YOUR requestId)
    const existingTx = await VTUTransaction.findOne({ where: { requestId } });

    if (existingTx) {
        return res.status(200).json({
            status: "success",
            data: {
                service: existingTx.serviceName,
                amount: existingTx.sellingPrice,
                status: existingTx.status,
                beneficiary: existingTx.beneficiary,
                createdAt: existingTx.createdAt
            }
        });
    }

    // ✅ Fetch plans
    const plansRes = await axios.get(`api/plans?service=${serviceId}`);
    const plans = plansRes.data.plans;

    const selectedPlan = plans.find(p => p.value === plan);

    if (!selectedPlan) {
        return next(new AppError("Invalid data plan selected", "", 400));
    }

    const faceValue = parseInt(selectedPlan.price);
    const sellingPrice = applyMarkup(faceValue);

    const t = await sequelize.transaction();
    let wallet;
    let tx;

    try {
        wallet = await Wallet.findOne({
            where: { userId: req.user.id },
            lock: t.LOCK.UPDATE,
            transaction: t
        });

        if (!wallet) {
            await t.rollback();
            return next(new AppError("Wallet not found", "", 404));
        }

        if (wallet.vtuBalance < sellingPrice) {
            await t.rollback();
            return next(new AppError("Insufficient wallet balance", "", 400));
        }

        const initialBalance = wallet.vtuBalance;

        // 💸 Debit user
        wallet.vtuBalance -= sellingPrice;
        await wallet.save({ transaction: t });

        // 🧾 Create transaction
        tx = await VTUTransaction.create({
            userId: req.user.id,
            type: 'data',
            provider: 'gsubz',
            serviceId,
            serviceName: plansRes.data.service || selectedPlan.displayName,
            beneficiary: phone,
            planCode: plan,
            planLabel: selectedPlan.displayName,

            faceValue,
            costPrice: faceValue,
            sellingPrice,

            profit: 0,
            providerRef: null,

            requestId,               // ✅ your full ID
            providerRequestId,       // ✅ provider-safe ID

            status: 'pending',
            providerStatus: null,
            initialBalance,
            finalBalance: null,
            providerDiscount: 0
        }, { transaction: t });

        await t.commit();

    } catch (err) {
        await t.rollback();
        throw err;
    }

    let providerResponse;

    try {
        const formData = new FormData();
        formData.append('serviceID', serviceId);
        formData.append("requestID", providerRequestId); // ✅ USE SHORT ONE
        formData.append('plan', plan);
        formData.append('phone', phone);
        formData.append('amount', '');
        formData.append('api', process.env.GSUBZ_API_KEY);

        providerResponse = await axios.post(`api/pay/`, formData, {
            headers: { Authorization: `Bearer ${process.env.GSUBZ_API_KEY}` }
        });

        console.log('PROVIDER RESPONSE', providerResponse.data);

        // ✅ Normalize response
        const {
            code,
            status: normalizedStatus,
            isSuccessStatus,
            isSuccessCode,
            providerRef
        } = normalizeProviderResponse(providerResponse.data);

        const isClearlySuccessful =
            isSuccessCode &&
            isSuccessStatus &&
            providerRef;

        const status = isClearlySuccessful ? "success" : "pending";

        const actualCost = Number(providerResponse.data?.amountPaid || faceValue);
        const providerDiscount = Math.max(faceValue - actualCost, 0);
        const roundedCost = Math.round(actualCost);
        const realProfit = sellingPrice - roundedCost;

        await tx.update({
            status,
            providerStatus: normalizedStatus,
            providerRef,
            costPrice: roundedCost,
            amountPaid: actualCost,
            profit: realProfit,
            providerDiscount: Math.round(providerDiscount),
            finalBalance: wallet.vtuBalance
        });

        // ⚠️ Provider wallet issue (NO REFUND)
        if (providerResponse.data?.description === 'INSUFFICIENT_BALANCE') {
            return next(new AppError(
                "Service temporarily unavailable. Please try again later.",
                "Provider wallet low",
                503
            ));
        }

        // 🎯 Referral Logic (ONLY on success)
        if (status === "success" && req.user.referralId) {
            const referrer = await User.findOne({
                where: { accountId: req.user.referralId }
            });

            if (referrer && referrer.id !== req.user.id) {
                const referralWallet = await Wallet.findOne({
                    where: { userId: referrer.id }
                });

                if (referralWallet) {
                    const REFERRAL_BONUS = 2;
                    referralWallet.referralBalance += REFERRAL_BONUS;
                    await referralWallet.save();
                }
            }
        }

    } catch (err) {
        // ❗ DO NOT REFUND
        console.log("PROVIDER ERROR:", err.message);

        await tx.update({
            status: "pending"
        });
    }

    const refreshedTx = await VTUTransaction.findByPk(tx.id);

    const transaction = {
        service: refreshedTx.serviceName,
        amount: refreshedTx.sellingPrice,
        status: refreshedTx.status,
        beneficiary: refreshedTx.beneficiary,
        ref: refreshedTx.providerRef || 'N/A',
        createdAt: refreshedTx.createdAt
    };

    return res.status(200).json({
        status: "success",
        message:
            refreshedTx.status === "success"
                ? "Transaction successful"
                : "Transaction is being processed. Please check back shortly.",
        data: { transaction }
    });
});


exports.verifyTransaction = catchAsync(async (req, res, next) => {
    const { requestId } = req.params;

    if (!requestId) {
        return next(new AppError("Request ID is required", "", 400));
    }

    // 🔍 Find transaction using YOUR ID
    const tx = await VTUTransaction.findOne({ where: { requestId } });

    if (!tx) {
        return next(new AppError("Transaction not found", "", 404));
    }

    // ✅ Already successful → no need to verify
    if (tx.status === "success") {
        return res.status(200).json({
            status: "success",
            message: "Transaction already successful",
            data: { transaction: tx }
        });
    }

    // 🔥 Resolve providerRequestId (BACKWARD SAFE)
    const providerRequestId =
        tx.providerRequestId ||
        tx.requestId.split('-').slice(0, 4).join('-');

    let providerResponse;

    try {
        const formData = new FormData();
        formData.append("requestID", providerRequestId);
        formData.append("api", process.env.GSUBZ_API_KEY);

        providerResponse = await axios.post(`api/verify/`, formData, {
            headers: {
                Authorization: `Bearer ${process.env.GSUBZ_API_KEY}`
            }
        });

        //console.log("VERIFY RESPONSE:", providerResponse.data);

        const {
            code,
            status: normalizedStatus,
            isSuccessStatus,
            isFailedStatus,
            isSuccessCode,
            providerRef
        } = normalizeProviderResponse(providerResponse.data);

        const isClearlySuccessful =
            isSuccessCode &&
            isSuccessStatus;

        // 🎯 SUCCESS CASE
        if (isClearlySuccessful) {
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

        // ❌ FAILURE CASE (ONLY HERE WE REFUND)
        if (isFailedStatus) {
            // 🚨 Avoid double refund
            if (tx.status !== "failed") {
                const wallet = await Wallet.findOne({
                    where: { userId: tx.userId }
                });

                if (wallet) {
                    wallet.vtuBalance += tx.sellingPrice;
                    await wallet.save();

                    await tx.update({
                        status: "failed",
                        providerStatus: normalizedStatus,
                        finalBalance: wallet.vtuBalance
                    });
                }
            }

            return res.status(200).json({
                status: "success",
                message: "Transaction failed and refunded",
                data: { transaction: tx }
            });
        }

        // ⏳ STILL PENDING / UNCLEAR
        return res.status(200).json({
            status: "success",
            message: "Transaction still pending",
            data: { transaction: tx }
        });

    } catch (err) {
        //console.log("VERIFY ERROR:", err.message);

        return res.status(200).json({
            status: "success",
            message: "Unable to verify at the moment. Please try again later.",
            data: { transaction: tx }
        });
    }
});