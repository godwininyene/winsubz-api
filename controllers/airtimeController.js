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

  // Initialize row locking and ledger creations securely
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
    // 🔥 Call the newly extracted unified processor engine
    await providerService.processGsubzTransaction({
        context,
        serviceType: "airtime",
        serviceId: serviceID,
        faceValue,
        sellingPrice: faceValue,
        payload: { serviceId: serviceID, faceValue, phone, providerRequestId: context.providerRequestId }
    });

  } catch (err) {
    console.error("Airtime runtime processing failure:", err);
    if (context && context.tx) {
      await context.tx.update({
        status: 'pending',
        deliveryMessage: err.message || "Network connection error"
      });
    }
  }

  // 🏁 Output uniform response structure
  const output = await transactionService.getResponsePayload(context.tx.id);
  return res.status(200).json({
    status: "success",
    message: output.status === "success" 
      ? "Airtime purchase successful" 
      : (output.deliveryMessage || "Transaction processing. Check status shortly."),
    data: { transaction: output }
  });
});