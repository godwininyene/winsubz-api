const catchAsync = require('./../utils/catchAsync');
const AppError = require('../utils/appError');
const getCostPrice = require('./../utils/getCostPrice');
const normalizeProviderResponse = require('./../utils/normalizeProviderResponse');
const transactionService = require('../services/transactionService');
const providerService = require('../services/providerService');

exports.buyAirtime = catchAsync(async (req, res, next) => {
  const { serviceID, phone, amount, requestId } = req.body;

  if (!requestId) return next(new AppError("Request ID is required", "", 400));
  if (!serviceID || !phone || !amount) return next(new AppError("serviceID, phone and amount are required", "", 400));

  const faceValue = Number(amount);
  if (!Number.isFinite(faceValue) || faceValue < 100) return next(new AppError("Airtime amount should not be less than N100", "", 400));

  const context = await transactionService.initialize({
    userId: req.user.id,
    type: 'airtime',
    provider: 'gsubz',
    serviceId: serviceID,
    serviceName: `${serviceID.toUpperCase()} Airtime`,
    beneficiary: phone,
    faceValue,
    sellingPrice: faceValue,
    requestId,
    extraFields: { isRefunded: false }
  });

  if (context.isDuplicate) {
    return res.status(200).json({
      status: "success",
      data: { transaction: await transactionService.getResponsePayload(context.tx.id) }
    });
  }

  try {
    const resData = await providerService.dispatch("gsubz", "airtime", {
      serviceId: serviceID, faceValue, phone, providerRequestId: context.providerRequestId
    });

    const { status: normalizedStatus, isSuccessStatus, isSuccessCode, providerRef } = normalizeProviderResponse(resData);
    const isSuccess = isSuccessCode && isSuccessStatus && providerRef;

    const actualCost = getCostPrice("gsubz", faceValue, { type: "airtime", apiResponse: resData });
    const roundedCost = Math.round(actualCost);

    await context.tx.update({
      status: isSuccess ? "success" : "pending",
      providerStatus: normalizedStatus,
      providerRef: providerRef || null,
      costPrice: roundedCost,
      amountPaid: actualCost,
      profit: faceValue - roundedCost,
      providerDiscount: Math.round(Math.max(faceValue - roundedCost, 0)),
      finalBalance: context.wallet.vtuBalance
    });

    if (resData?.description === 'INSUFFICIENT_BALANCE') {
      return next(new AppError("Service unavailable. Please try again later.", "Low Provider Balance", 503));
    }
  } catch (err) {
    await context.tx.update({ status: 'pending' });
  }

  const output = await transactionService.getResponsePayload(context.tx.id);
  return res.status(200).json({
    status: "success",
    message: output.status === "success" ? "Airtime purchase successful" : "Transaction processing. Check status shortly.",
    data: { transaction: output }
  });
});