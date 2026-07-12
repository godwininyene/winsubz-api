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

  let context;

  // 1. Initialize row locking and ledger creations securely
  try {
    context = await transactionService.initialize({
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
  } catch (initErr) {
    console.error("Critical: Data transaction failed to initialize in DB:", initErr.message);

    //If it's a known business validation rule (like low balance), pass it straight through
    if (initErr.isOperational) {
      return next(new AppError(initErr.message, "", initErr.statusCode || 400));
    }

    // Safely fail early since no transaction was written and the user wasn't debited
    return next(new AppError("System busy. Please try again shortly.", "", 500));
  }

  // 2. Handle duplicate requests safely
  if (context.isDuplicate) {
    return res.status(200).json({
      status: "success",
      data: { transaction: await transactionService.getResponsePayload(context.tx.id) }
    });
  }

  // 3. Dispatch to Provider Engine
  try {
    await providerService.processGsubzTransaction({
      context,
      serviceType: "airtime",
      serviceId: serviceID,
      faceValue,
      sellingPrice: faceValue,
      payload: { serviceId: serviceID, faceValue, phone, providerRequestId: context.providerRequestId }
    });

  } catch (err) {
    console.error("Airtime upstream runtime processing failure:", err);
    if (context && context.tx) {
      try {
        await context.tx.update({
          status: 'pending',
          deliveryMessage: err.message || "Network connection error"
        });
      } catch (dbErr) {
        console.error("Critical: Database pool dropped during fallback logging:", dbErr.message);
      }
    }
  }

  // 4. Output uniform response structure safely
  let output;
  try {
    output = await transactionService.getResponsePayload(context.tx.id);
  } catch (payloadErr) {
    console.error("Failed fetching live payload from DB, serving fallback memory state:", payloadErr.message);
    output = {
      service: `${serviceID.toUpperCase()} Airtime`,
      amount: faceValue,
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
      ? "Airtime purchase successful"
      : (output.deliveryMessage || "Transaction processing. Check status shortly."),
    data: { transaction: output }
  });
});