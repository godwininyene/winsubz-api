const catchAsync = require("../utils/catchAsync");
const getCostPrice = require('./../utils/getCostPrice');
const axios = require('axios');
const AppError = require('../utils/appError');
const transactionService = require('../services/transactionService');
const providerService = require('../services/providerService');
const { VTUTransaction } = require("../models");

exports.getPlans = catchAsync(async (req, res, next) => {
  try {
    const response = await axios.get(`${process.env.PEYFLEX_BASE_URL}/api/electricity/plans/?identifier=electricity`);
    res.status(200).json({
      status: "success",
      data: { plans: response.data.plans }
    });
  } catch (error) {
    if (error.response) {
      const message = error.response.data?.responseMessage || "Unable to fetch electricity plans";
      return next(new AppError(message, "", error.response.status));
    }
    return next(new AppError("Electricity service unavailable", "", 500));
  }
});

exports.verifyMeter = catchAsync(async (req, res, next) => {
  const { meter, plan, type } = req.body;
  if (!meter || !plan || !type) return next(new AppError("Please provide meter number, electricity plan, and meter type", "", 400));

  try {
    const response = await axios.get(`${process.env.PEYFLEX_BASE_URL}/api/electricity/verify/`, {
      params: { identifier: "electricity", meter, plan, type },
      headers: { Authorization: `Token ${process.env.PEYFLEX_API_KEY}` }
    });

    const data = response.data;
    if (!data.customer_name || data.customer_name === "Unknown") {
      return next(new AppError("Invalid meter number.", "", 400));
    }

    res.status(200).json({ status: "success", data: { customer: data.customer_name } });
  } catch (error) {
    if (error.response) {
      const message = error.response.data?.responseMessage || error.response.data?.message || "Unable to verify meter";
      return next(new AppError(message, "", error.response.status));
    }
    return next(new AppError("Meter verification service unavailable", "", 503));
  }
});

exports.buyElectricity = catchAsync(async (req, res, next) => {
  const { meter, plan, amount, type, phone } = req.body;

  if (!meter || !plan || !amount || !type || !phone) return next(new AppError("meter, plan, amount, type and phone are required", "", 400));

  const faceValue = Number(amount);
  if (!Number.isFinite(faceValue) || faceValue <= 0) return next(new AppError("Invalid electricity amount", "", 400));

  const sellingPrice = faceValue;
  const requestId = `EL-${Date.now()}-${req.user.id}`;

  let context;
  // 1. Initialize row locking and ledger creations securely with explicit error safety
  try {
    context = await transactionService.initialize({
      userId: req.user.id,
      type: "electricity",
      provider: "peyflex",
      serviceId: "electricity",
      serviceName: plan.replace("-", " ").toUpperCase(),
      beneficiary: meter,
      faceValue,
      sellingPrice,
      requestId
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

  let resData = {};
  try {
    resData = await providerService.dispatch("peyflex", "electricity", {
      meter, plan, faceValue, type, phone
    });
  } catch (err) {
    resData = err.response?.data || {};
  }

  const success = resData.status === "SUCCESSFUL" || resData.status === "SUCCESS";
  const actualCost = getCostPrice("peyflex", faceValue, { type: "electricity" });

  if (!success) {
    await transactionService.processRefund(context.tx, context.wallet, faceValue);
  } else {
    await context.tx.update({
      status: "success",
      providerStatus: resData.status || null,
      providerRef: resData.reference || null,
      token: resData.token || null,
      costPrice: Math.round(actualCost),
      amountPaid: actualCost,
      profit: Math.round(faceValue - actualCost),
      providerDiscount: Math.round(Math.max(faceValue - actualCost, 0)),
      finalBalance: context.wallet.vtuBalance
    });
  }

  const output = await transactionService.getResponsePayload(context.tx.id);

  if (success) {
    return res.status(200).json({ status: "success", data: { transaction: output } });
  }

  if (resData?.message?.toLowerCase().includes("wallet")) {
    return next(new AppError("Service temporarily unavailable. Please try again later.", "Provider wallet low", 503));
  }

  return res.status(400).json({
    status: "fail",
    message: resData?.message || "Electricity purchase failed",
    data: { transaction: output }
  });
});