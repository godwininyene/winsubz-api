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


function applyMarkup(amount) {
    //Old Charge
    // const RATE = 0.07;   // 7%
    // const MIN = 50;
    // const MAX = 250;

    // let profit = Math.round(amount * RATE);

    // if (profit < MIN) profit = MIN;
    // if (profit > MAX) profit = MAX;

    // const sellingPrice = amount + profit;
    // // Round final price to nearest ₦50
    // return Math.round(sellingPrice / 50) * 50;

    const RATE = 0.03;   // 3%
    const MIN = 30;
    const MAX = 100;

    let profit = Math.round(amount * RATE);

    if (profit < MIN) profit = MIN;
    if (profit > MAX) profit = MAX;

    const sellingPrice = amount + profit;
    return sellingPrice
}



exports.getDataPlans = catchAsync(async (req, res, next) => {
    try {
        const result = await axios.get(`api/plans?service=${req.query.network}`);
        const plans = result.data.plans;
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

    // ✅ Idempotency check
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
            requestId,
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
    let success = false;

    try {
        const formData = new FormData();
        formData.append('serviceID', serviceId);
        formData.append("requestID", requestId);
        formData.append('plan', plan);
        formData.append('phone', phone);
        formData.append('amount', '');
        formData.append('api', process.env.GSUBZ_API_KEY);

        providerResponse = await axios.post(`api/pay/`, formData, {
            headers: { Authorization: `Bearer ${process.env.GSUBZ_API_KEY}` }
        });

        console.log('PROVIDER RESPONSE',providerResponse);
        

        const providerCode = String(providerResponse.data?.code);
        const providerStatus = String(providerResponse.data?.status || "").toLowerCase();

        success = providerCode === "200" &&
            (providerStatus === "successful" || providerStatus === "transaction_successful");

        const actualCost = Number(providerResponse.data?.amountPaid || faceValue);
        const providerDiscount = Math.max(faceValue - actualCost, 0);
        const realProfit = sellingPrice - actualCost;

        // ❌ If failed → refund
        if (!success) {
            wallet.vtuBalance += sellingPrice;
            await wallet.save();
        }

        // ✅ Update transaction
        await tx.update({
            status: success ? 'success' : 'failed',
            providerStatus: providerResponse.data?.status || null,
            providerRef: providerResponse.data?.transactionID || null,
            costPrice: Math.round(actualCost),
            amountPaid: actualCost,
            profit: Math.round(realProfit),
            providerDiscount: Math.round(providerDiscount),
            finalBalance: wallet.vtuBalance
        });

        // 🎯 =========================
        // 🔥 REFERRAL LOGIC STARTS HERE
        // 🎯 =========================
        if (success && req.user.referralId) {

            // 🛡️ Avoid abuse → minimum transaction
            const MINIMUM_FOR_REFERRAL = 500;
            const referrer = await User.findOne({
                where: { accountId: req.user.referralId }
            });

            // 🛡️ Prevent self-referral
            if (referrer && referrer.id !== req.user.id) {

                const referralWallet = await Wallet.findOne({
                    where: { userId: referrer.id }
                });

                if (referralWallet) {

                    const REFERRAL_BONUS = 2; // 💰 Flat ₦2

                    referralWallet.referralBalance += REFERRAL_BONUS;

                    await referralWallet.save();

                    // 🧾 Log referral earning
                    // await VTUTransaction.create({
                    //     userId: referrer.id,
                    //     type: 'referral_bonus',
                    //     provider: 'system',
                    //     serviceName: 'Referral Bonus',
                    //     beneficiary: req.user.phone,
                    //     sellingPrice: REFERRAL_BONUS,
                    //     profit: REFERRAL_BONUS,
                    //     status: 'success',
                    //     initialBalance: referralWallet.referralBalance - REFERRAL_BONUS,
                    //     finalBalance: referralWallet.referralBalance
                    // });
                }
            }

        }
        // 🎯 =========================
        // 🔥 REFERRAL LOGIC ENDS HERE
        // 🎯 =========================

    } catch (err) {
        wallet.vtuBalance += sellingPrice;
        await wallet.save();

        await tx.update({
            status: 'failed',
            finalBalance: wallet.vtuBalance
        });

        throw err;
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

    if (success) {
        return res.status(200).json({
            status: "success",
            data: { transaction }
        });
    }

    if (!success && providerResponse.data?.description === 'INSUFFICIENT_BALANCE') {
        return next(new AppError(
            "Service temporarily unavailable. Please try again later.",
            "Provider wallet low",
            503
        ));
    }

    return res.status(400).json({
        status: "fail",
        message: providerResponse?.data?.description || "Transaction failed",
        data: { transaction }
    });
});

