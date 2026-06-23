const axios = require('axios');
const AppError = require("../utils/appError");
const catchAsync = require("../utils/catchAsync");
const getCachedPlans = require('./../utils/planCache');
const getCostPrice = require('./../utils/getCostPrice');
const transactionService = require('../services/transactionService');
const providerService = require('../services/providerService');
const { User, Wallet } = require('./../models');

const BASE_URL = `${process.env.PEYFLEX_BASE_URL}/api`;

exports.getProviders = catchAsync(async (req, res, next) => {
    try {
        const result = await axios.get(`${BASE_URL}/cable/providers/`);
        res.status(200).json({
            status: "success",
            data: { providers: result.data.providers }
        });
    } catch (err) {
        if (err.response) {
            return next(new AppError(err.response.data?.message || 'Service temporarily unavailable', "", err.response.status));
        }
        if (err.request) {
            return next(new AppError('Service temporarily unavailable', "", 502));
        }
        return next(err);
    }
});

exports.getDataPlans = catchAsync(async (req, res, next) => {
    try {
        const result = await axios.get(`${BASE_URL}/cable/plans/${req.query.provider}/`);
        res.status(200).json({
            status: "success",
            identifier: result.data.identifier,
            data: { plans: result.data.plans }
        });
    } catch (err) {
        if (err.response) {
            return next(new AppError(err.response.data?.message || 'Service temporarily unavailable', "", err.response.status));
        }
        if (err.request) {
            return next(new AppError('Service temporarily unavailable', "", 502));
        }
        return next(err);
    }
});

exports.verifyCableCard = catchAsync(async (req, res, next) => {
    const { iuc, identifier } = req.body;

    if (!iuc || !identifier) {
        return next(new AppError("Please provide cable IUC and identifier", "", 400));
    }

    try {
        const response = await axios.post(
            `${BASE_URL}/cable/verify/`, 
            { iuc, identifier },
            { headers: { Authorization: `Token ${process.env.PEYFLEX_API_KEY}` } }
        );

        const data = response.data;
        if (!data.customer_name || data.customer_name.toLowerCase() === "unknown") {
            return next(new AppError("Invalid cable IUC number.", "", 400));
        }

        res.status(200).json({
            status: "success",
            data: { customer: data.customer_name }
        });
    } catch (error) {
        if (error.response) {
            const message = error.response.data?.responseMessage || error.response.data?.message || "Unable to verify cable IUC";
            return next(new AppError(message, "", error.response.status));
        }
        return next(new AppError("Cable IUC verification service unavailable", "", 503));
    }
});

exports.buyCableSub = catchAsync(async (req, res, next) => {
    const { identifier, plan, iuc, phone, requestId } = req.body;

    if (!identifier || !phone || !iuc || !plan || !requestId) {
        return next(new AppError("identifier, phone, iuc, plan, and requestId are required", "", 400));
    }

    let plansList;
    try {
        plansList = await getCachedPlans(identifier);
    } catch (err) {
        return next(new AppError("Unable to fetch cable plans", "", 503));
    }

    const selectedPlan = plansList.find(item => item.plan_code === plan);
    if (!selectedPlan) {
        return next(new AppError("Invalid cable plan selected", "", 400));
    }

    const faceValue = Number(selectedPlan.amount);
    const sellingPrice = faceValue;

    // Secure database initialization context using row locking
    const context = await transactionService.initialize({
        userId: req.user.id,
        type: "cable",
        provider: "peyflex",
        serviceId: identifier,
        serviceName: `${identifier.toUpperCase()} ${selectedPlan.display || selectedPlan.plan_code}`,
        beneficiary: iuc,
        faceValue,
        sellingPrice,
        requestId,
        extraFields: { planCode: plan, planLabel: selectedPlan.description ||selectedPlan.display }
    });

    if (context.isDuplicate) {
        return res.status(200).json({
            status: "success",
            data: { transaction: await transactionService.getResponsePayload(context.tx.id) }
        });
    }

    let resData = {};
    try {
        // resData = await providerService.dispatch("peyflex", "cable", {
        //     identifier, plan, iuc, phone, amount: faceValue
        // });
        resData = await providerService.dispatch("peyflex", "cable", {
            identifier, plan, iuc, phone, amount: 100
        });
    } catch (err) {
        resData = err.response?.data || {};
    }

    const success = resData.status === "SUCCESSFUL" || resData.status === "SUCCESS";
    const actualCost = getCostPrice("peyflex", faceValue, { type: "cable" });

    if (!success) {
        await transactionService.processRefund(context.tx, context.wallet, sellingPrice);
    } else {
        await context.tx.update({
            status: "success",
            providerStatus: resData.status || null,
            providerRef: resData.reference || null,
            costPrice: Math.round(actualCost),
            amountPaid: actualCost,
            profit: Math.round(sellingPrice - actualCost),
            providerDiscount: Math.round(Math.max(faceValue - actualCost, 0)),
            finalBalance: context.wallet.vtuBalance
        });
    }

    const output = await transactionService.getResponsePayload(context.tx.id);

    if (success) {
        return res.status(200).json({
            status: "success",
            data: { transaction: output }
        });
    }

    if (resData?.message?.toLowerCase().includes("wallet")) {
        return next(new AppError("Service temporarily unavailable. Please try again later.", "Provider wallet low", 503));
    }

    return res.status(400).json({
        status: "fail",
        message: resData?.message || "Cable TV subscription failed",
        data: { transaction: output }
    });
});