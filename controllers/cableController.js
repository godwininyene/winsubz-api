const axios = require("../lib/axios");
const AppError = require("../utils/appError");
const catchAsync = require("../utils/catchAsync");
const { Wallet, VTUTransaction, sequelize } = require('./../models')

const getCachedPlans = require('./../utils/planCache')

exports.getDataPlans = catchAsync(async (req, res, next) => {
    try {
        const result = await axios.get(`api/plans?service=${req.query.service}`);

        const plans = result.data.list;

        res.status(200).json({
            status: "success",
            data: {
                plans
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

exports.verifyCableCard = catchAsync(async (req, res, next) => {

    const { iuc, identifier } = req.body;

    if (!iuc || !identifier) {
        return next(
            new AppError(
                "Please provide cable IUC, and identifier",
                "",
                400
            )
        );
    }

    try {

        const payload = { iuc, identifier }
        const response = await axios.post(
            `${process.env.PEYFLEX_BASE_URL}/api/cable/verify/`, payload,
            {

                headers: {
                    Authorization: `Token ${process.env.PEYFLEX_API_KEY}`
                }
            }
        );

        const data = response.data;

        if (!data.customer_name || data.customer_name.toLowerCase() === "unknown") {
            return next(new AppError("Invalid cable IUC number.", "", 400));
        }


        res.status(200).json({
            status: "success",
            data: {
                customer: data.customer_name
            }
        });

    } catch (error) {

        if (error.response) {
            const message =
                error.response.data?.responseMessage ||
                error.response.data?.message ||
                "Unable to verify cable IUC";

            return next(
                new AppError(message, "", error.response.status)
            );
        }

        // Network error
        return next(
            new AppError(
                "Cable IUC verification service unavailable",
                "",
                503
            )
        );
    }

});


exports.buyCableSub = catchAsync(async (req, res, next) => {
    const { serviceID, phone, customerID, variation_code, requestId } = req.body;

    // ✅ Validation
    if (!requestId) {
        return next(new AppError("Request ID is required", "", 400));
    }

    if (!serviceID || !phone || !customerID || !variation_code) {
        return next(
            new AppError(
                "serviceID, phone, customerID and variation_code are required",
                "",
                400
            )
        );
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

    // 🔍 Fetch plans (cached)
    let plans;
    try {
        plans = await getCachedPlans(serviceID);
    } catch (err) {
        console.log('ERROR', err);
        return next(new AppError("Unable to fetch cable plans", "", 503));


    }



    // 🎯 Validate plan
    const selectedPlan = plans.find(
        (plan) => plan.value === variation_code
    );

    if (!selectedPlan) {
        return next(new AppError("Invalid cable plan selected", "", 400));
    }

    const faceValue = Number(selectedPlan.price);
    const sellingPrice = faceValue;

    const t = await sequelize.transaction();
    let wallet;
    let tx;

    try {
        // 🔐 Lock wallet
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

        // 💸 Debit
        wallet.vtuBalance -= sellingPrice;
        await wallet.save({ transaction: t });

        // 🧾 Create transaction
        tx = await VTUTransaction.create({
            userId: req.user.id,
            type: "cable",
            provider: "gsubz",
            serviceId: serviceID,
            serviceName: selectedPlan.display_name || serviceID,
            beneficiary: customerID,
            planCode: variation_code,
            planLabel: selectedPlan.display_name,

            faceValue,
            costPrice: faceValue,
            sellingPrice,

            profit: 0,
            providerRef: null,
            requestId,
            status: "pending",
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
        // 🌐 Call provider
        const form = new FormData();

        form.append("serviceID", serviceID);
        form.append("phone", phone);
        form.append("customerID", customerID);
        form.append("variation_code", variation_code);
        form.append("amount", "");
        form.append("requestID", requestId);
        form.append("api", process.env.GSUBZ_API_KEY);

        providerResponse = await axios.post(
            "https://gsubz.com/api/pay/",
            form,
            {
                headers: {
                    // ...form.getHeaders(),
                    Authorization: `Bearer ${process.env.GSUBZ_API_KEY}`
                }
            }
        );
        

        console.log('PROVIDER RESPONSES', providerResponse.data);


        const providerCode = String(providerResponse.data?.code);
        const providerStatus = String(providerResponse.data?.status || "").toLowerCase();

        success =
            providerCode === "200" &&
            (providerStatus === "successful" ||
                providerStatus === "transaction_successful");

        const actualCost = Number(providerResponse.data?.amountPaid || faceValue);
        const providerDiscount = Math.max(faceValue - actualCost, 0);
        const realProfit = sellingPrice - actualCost;

        // ❌ Refund if failed
        if (!success) {
            wallet.vtuBalance += sellingPrice;
            await wallet.save();
        }

        // ✅ Update transaction
        await tx.update({
            status: success ? "success" : "failed",
            providerStatus: providerResponse.data?.status || null,
            providerRef: providerResponse.data?.transactionID || null,
            costPrice: Math.round(actualCost),
            amountPaid: actualCost,
            profit: Math.round(realProfit),
            providerDiscount: Math.round(providerDiscount),
            finalBalance: wallet.vtuBalance
        });

        // 🎯 REFERRAL LOGIC
        if (success && req.user.referralId) {
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
        // ❌ Refund on error
        wallet.vtuBalance += sellingPrice;
        await wallet.save();

        await tx.update({
            status: "failed",
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
        ref: refreshedTx.providerRef || "N/A",
        createdAt: refreshedTx.createdAt
    };

    if (success) {
        return res.status(200).json({
            status: "success",
            data: { transaction }
        });
    }

    if (!success && providerResponse.data?.description === "AMOUNT_BELOW_MIN") {
        return next(
            new AppError(
                "Service temporarily unavailable. Please try again later.",
                "Provider wallet low",
                503
            )
        );
    }

    return res.status(400).json({
        status: "fail",
        message:
            providerResponse?.data?.description || "Transaction failed",
        data: { transaction }
    });
});