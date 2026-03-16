const catchAsync = require("../utils/catchAsync");
const axios = require('../lib/axios');
const AppError = require('../utils/appError');
const {
  VTUTransaction,
  Wallet,
  sequelize
} = require("../models");

const MIN_ELECTRICITY = {
  'abuja-electric': 1000,
  'eko-electric': 1000,
  'ibadan-electric': 1000,
  'ikeja-electric': 1000,
  'jos-electric': 1000,
  'kaduna-electric': 1000,
  'kano-electric': 1000,
  'portharcourt-electric': 1000,
  'aba-electric': 1000,
  'yola-electric': 1000,
  'benin-electric': 1000,
  'enugu-electric': 1000,
  'ibedc-electric': 1000
};

function getMinElectricityAmount(serviceID) {
  return MIN_ELECTRICITY[serviceID] || 500;
}

function applyElectricityMarkup(amount) {
  const RATE = 0.02;   // 2%
  const MIN = 30;
  const MAX = 150;

  let profit = Math.round(amount * RATE);
  if (profit < MIN) profit = MIN;
  if (profit > MAX) profit = MAX;

  return amount + profit;
}

exports.buyElectricity = catchAsync(async (req, res, next) => {
  const { serviceID, phone, customerID, amount, variation_code, requestId } = req.body;

  if (!requestId) return next(new AppError("Request ID is required", "", 400));
  if (!serviceID || !phone || !customerID || !amount || !variation_code) {
    return next(new AppError("serviceID, phone, customerID, variation code and amount are required", "", 400));
  }

  const faceValue = Number(amount);
  const minAmount = getMinElectricityAmount(serviceID);

  if (!Number.isFinite(faceValue) || faceValue < minAmount) {
    return next(new AppError(`Minimum amount for this service is ₦${minAmount}`, "", 400));
  }

  const sellingPrice = applyElectricityMarkup(faceValue);

  // 🔁 Idempotency
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
          ref: existingTx.providerRef || 'N/A',
          createdAt: existingTx.createdAt
        }
      }
    });
  }

  // 🔐 Anti-double-spend
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
      type: 'electricity',
      provider: 'gsubz',
      serviceId: serviceID,
      serviceName: serviceID.replace('-', ' ').toUpperCase(),
      beneficiary: customerID,
      faceValue: Number(amount),      // ✅ what user is buying
      costPrice: Number(amount),        // temp, will be replaced by actualCost
      sellingPrice,                    // ✅ what user pays
      profit: 0,
      amountPaid: null,
      providerDiscount: 0,
      providerRef: null,
      requestId,
      status: 'pending',
      providerStatus: null,
      initialBalance,
      finalBalance: null
    }, { transaction: t });

    await t.commit();
  } catch (err) {
    await t.rollback();
    throw err;
  }

  // 🌐 Call provider
  let providerResponse;
  let success = false;

  try {
    const formData = new FormData();
    formData.append('serviceID', serviceID);
    formData.append('api', process.env.GSUBZ_API_KEY);
    formData.append('phone', phone);
    formData.append('customerID', customerID);
    formData.append('amount', String(faceValue));
    if (variation_code) formData.append('variation_code', variation_code);
    formData.append('requestID', requestId);

    providerResponse = await axios.post(`api/pay/`, formData, {
      headers: { Authorization: `Bearer ${process.env.GSUBZ_API_KEY}` }
    });

    const providerCode = String(providerResponse.data?.code);
    const providerStatus = String(providerResponse.data?.status || '').toLowerCase();

    success =
      providerCode === "200" &&
      (providerStatus === "successful" || providerStatus === "transaction_successful");

    const actualCost = Number(providerResponse.data?.amountPaid || faceValue);
    const providerDiscount = Math.max(faceValue - actualCost, 0);
    const realProfit = sellingPrice - actualCost;

    await tx.update({
      status: success ? 'success' : 'failed',
      providerStatus: providerResponse.data?.status || null,
      providerRef: providerResponse.data?.transactionID || null,
      token: providerResponse.data?.token || providerResponse.data?.api_response || null,
      costPrice: Math.round(actualCost),// what provider charged
      amountPaid: actualCost,
      profit: Math.round(realProfit),
      providerDiscount: Math.round(providerDiscount),
      finalBalance: wallet.vtuBalance
    });

    if (!success) {
      wallet.vtuBalance += sellingPrice;
      await wallet.save();
      await tx.update({ finalBalance: wallet.vtuBalance });
    }

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
    token: refreshedTx.token || null,
    ref: refreshedTx.providerRef || 'N/A',
    createdAt: refreshedTx.createdAt
  };

  if (success) {
    return res.status(200).json({ status: "success", data: { transaction } });
  }

  if (providerResponse?.data?.description === 'INSUFFICIENT_BALANCE') {
    return next(new AppError(
      "Service temporarily unavailable. Please try again later.",
      "Provider wallet low",
      503
    ));
  }

  return res.status(400).json({
    status: "fail",
    message: providerResponse?.data?.description || "Electricity purchase failed",
    data: { transaction }
  });
});