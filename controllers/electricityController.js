const catchAsync = require("../utils/catchAsync");
// const axios = require('../lib/axios');
const axios = require('axios')
const AppError = require('../utils/appError');
const {
  VTUTransaction,
  Wallet,
  sequelize
} = require("../models");


function applyElectricityMarkup(amount) {
  const RATE = 0.02;   // 2%
  const MIN = 30;
  const MAX = 150;

  let profit = Math.round(amount * RATE);
  if (profit < MIN) profit = MIN;
  if (profit > MAX) profit = MAX;

  return amount + profit;
}


exports.getPlans = catchAsync(async (req, res, next) => {
  try {
    const response = await axios.get(`${process.env.PEYFLEX_BASE_URL}/api/electricity/plans/?identifier=electricity`);
    res.status(200).json({
      status: "success",
      data: {
        plans: response.data.plans
      }
    })
  } catch (error) {
    if (error.response) {
      const message =
        error.response.data?.responseMessage ||
        "Unable to fetch electricity plans";

      return next(new AppError(message, "", error.response.status));
    }
    // Handle network errors
    return next(new AppError("Electricity service unavailable", "", 500));
  }

})

exports.verifyMeter = catchAsync(async (req, res, next) => {

  const { meter, plan, type } = req.body;

  if (!meter || !plan || !type) {
    return next(
      new AppError(
        "Please provide meter number, electricity plan, and meter type",
        "",
        400
      )
    );
  }

  try {

    const response = await axios.get(
      `${process.env.PEYFLEX_BASE_URL}/api/electricity/verify/`,
      {
        params: {
          identifier: "electricity",
          meter,
          plan,
          type
        },
        headers: {
          Authorization: `Token ${process.env.PEYFLEX_API_KEY}`
        }
      }
    );

    const data = response.data;

    if (!data.customer_name || data.customer_name === "Unknown") {
      return next(new AppError("Invalid meter number.", "", 400));
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
        "Unable to verify meter";

      return next(
        new AppError(message, "", error.response.status)
      );
    }

    // Network error
    return next(
      new AppError(
        "Meter verification service unavailable",
        "",
        503
      )
    );
  }

});



exports.buyElectricity = catchAsync(async (req, res, next) => {

  const { meter, plan, amount, type, phone } = req.body;

  if (!meter || !plan || !amount || !type || !phone) {
    return next(
      new AppError(
        "meter, plan, amount, type and phone are required",
        "",
        400
      )
    );
  }

  const faceValue = Number(amount);

  if (!Number.isFinite(faceValue) || faceValue <= 0) {
    return next(new AppError("Invalid electricity amount", "", 400));
  }

  // const sellingPrice = applyElectricityMarkup(faceValue);
  const sellingPrice = faceValue;

  const requestId = `EL-${Date.now()}-${req.user.id}`;

  // 🔁 Idempotency check
  const existingTx = await VTUTransaction.findOne({ where: { requestId } });

  if (existingTx) {
    return res.status(200).json({
      status: "success",
      data: {
        transaction: {
          service: existingTx.serviceName,
          amount: existingTx.sellingPrice,
          status: existingTx.status,
          beneficiary: existingTx.beneficiary,
          ref: existingTx.providerRef || "N/A",
          createdAt: existingTx.createdAt
        }
      }
    });
  }

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

    wallet.vtuBalance -= sellingPrice;
    await wallet.save({ transaction: t });

    tx = await VTUTransaction.create({
      userId: req.user.id,
      type: "electricity",
      provider: "peyflex",
      serviceId: "electricity",
      serviceName: plan.replace("-", " ").toUpperCase(),
      beneficiary: meter,

      faceValue: faceValue,
      costPrice: faceValue,
      sellingPrice,

      profit: 0,
      amountPaid: null,
      providerDiscount: 0,
      providerRef: null,
      token: null,

      requestId,
      status: "pending",
      providerStatus: null,

      initialBalance,
      finalBalance: null

    }, { transaction: t });

    await t.commit();

  } catch (err) {
    await t.rollback();
    throw err;
  }


  let providerResponse;
  let success = false;
  let data = {};

  try {

    const payload = {
      identifier: "electricity",
      meter,
      plan,
      amount: String(faceValue),
      type,
      phone
    };

    providerResponse = await axios.post(
      "https://client.peyflex.com.ng/api/electricity/subscribe/",
      payload,
      {
        headers: {
          Authorization: `Token ${process.env.PEYFLEX_API_KEY}`,
          "Content-Type": "application/json"
        }
      }
    );

    data = providerResponse.data;

    console.log('PEYFLEX RESPONSE', providerResponse);
    

  } catch (err) {

    // Peyflex returns error responses inside err.response
    data = err.response?.data || {};
    providerResponse = err.response;


  }

  success = data.status === "SUCCESSFUL" || data.status === "SUCCESS";

  const actualCost = Number(data.amount || faceValue);
  const providerDiscount = Math.max(faceValue - actualCost, 0);
  const realProfit = sellingPrice - actualCost;

  if (!success) {
    wallet.vtuBalance += sellingPrice;
    await wallet.save();
  }

  await tx.update({

    status: success ? "success" : "failed",
    providerStatus: data.status || null,
    providerRef: data.reference || null,
    token: data.token || null,

    costPrice: Math.round(actualCost),
    amountPaid: actualCost,

    profit: Math.round(realProfit),
    providerDiscount: Math.round(providerDiscount),

    finalBalance: wallet.vtuBalance

  });


  const refreshedTx = await VTUTransaction.findByPk(tx.id);

  const transaction = {
    service: refreshedTx.serviceName,
    amount: refreshedTx.sellingPrice,
    status: refreshedTx.status,
    beneficiary: refreshedTx.beneficiary,
    token: refreshedTx.token || null,
    ref: refreshedTx.providerRef || "N/A",
    createdAt: refreshedTx.createdAt
  };


  if (success) {
    return res.status(200).json({
      status: "success",
      data: { transaction }
    });
  }


  // 🚫 Hide provider wallet balance issue
  if (data?.message?.toLowerCase().includes("wallet")) {
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
    message: data?.message || "Electricity purchase failed",
    data: { transaction }
  });

});
