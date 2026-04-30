const axios = require('../lib/axios');
const catchAsync = require('./../utils/catchAsync');
const AppError = require('../utils/appError');
const normalizeProviderResponse = require('./../utils/normalizeProviderResponse')
const {
  VTUTransaction,
  Wallet,
  sequelize
} = require("../models");

function applyAirtimeMarkup(faceValue) {
  let profit = 0;

  if (faceValue <= 200) {
    profit = 2;                    // ₦100 → ₦102
  } else if (faceValue <= 1000) {
    profit = Math.round(faceValue * 0.01);  // 1%
  } else if (faceValue <= 5000) {
    profit = Math.round(faceValue * 0.0075); // 0.75%
  } else {
    profit = Math.round(faceValue * 0.005);  // 0.5%
  }

  return Math.round(faceValue + profit);
}

// exports.buyAirtime = catchAsync(async (req, res, next) => {
//   const { serviceID, phone, amount, requestId } = req.body;

//   if (!requestId) {
//     return next(new AppError("Request ID is required", "", 400));
//   }

//   if (!serviceID || !phone || !amount) {
//     return next(new AppError("serviceID, phone and amount are required", "", 400));
//   }

//   const faceValue = Number(amount);
//   if (!Number.isFinite(faceValue) || faceValue < 100) {
//     return next(new AppError("Airtime amount should not be less than N100", "", 400));
//   }

//   // ✅ Generate providerRequestId (truncate UUID safely)
//   const providerRequestId = requestId.split('-').slice(0, 4).join('-');

//   // const sellingPrice = applyAirtimeMarkup(faceValue);
//   const sellingPrice = faceValue;

//   // 🔁 Idempotency
//   const existingTx = await VTUTransaction.findOne({ where: { requestId } });
//   if (existingTx) {
//     return res.status(200).json({
//       status: "success",
//       data: {
//         transaction: {
//           service: existingTx.serviceName,
//           amount: existingTx.sellingPrice,
//           status: existingTx.status,
//           beneficiary: existingTx.beneficiary,
//           ref: existingTx.providerRef || 'N/A',
//           createdAt: existingTx.createdAt
//         }
//       }
//     });
//   }



//   // 🔐 Anti-double-spend
//   const t = await sequelize.transaction();
//   let wallet;
//   let tx;

//   try {
//     wallet = await Wallet.findOne({
//       where: { userId: req.user.id },
//       lock: t.LOCK.UPDATE,
//       transaction: t
//     });

//     if (!wallet) {
//       await t.rollback();
//       return next(new AppError("Wallet not found", "", 404));
//     }

//     if (wallet.vtuBalance < sellingPrice) {
//       await t.rollback();
//       return next(new AppError("Insufficient wallet balance", "", 400));
//     }

//     const initialBalance = wallet.vtuBalance;

//     wallet.vtuBalance -= sellingPrice;
//     await wallet.save({ transaction: t });

//     tx = await VTUTransaction.create({
//       userId: req.user.id,
//       type: 'airtime',
//       provider: 'gsubz',
//       serviceId: serviceID,
//       serviceName: `${serviceID.toUpperCase()} Airtime`,
//       beneficiary: phone,

//       faceValue: faceValue,           // ✅ what user is buying
//       costPrice: faceValue,           // temp, will be replaced by actualCost
//       sellingPrice,                   // ✅ what user pays

//       profit: 0,                  // temp
//       amountPaid: null,
//       providerDiscount: 0,
//       providerRef: null,
//       requestId,
//       providerRequestId,
//       status: 'pending',
//       providerStatus: null,
//       initialBalance,
//       finalBalance: null          // 🔥 don't lie yet
//     }, { transaction: t });

//     await t.commit();
//   } catch (err) {
//     await t.rollback();
//     throw err;
//   }

//   // 🌐 Call provider AFTER DB is safe
//   let providerResponse;
//   let success = false;

//   try {
//     const formData = new FormData();
//     formData.append('serviceID', serviceID);
//     formData.append("requestID", providerRequestId); // ✅ USE SHORT ONE
//     formData.append('phone', phone);
//     formData.append('api', process.env.GSUBZ_API_KEY);
//     formData.append('amount', String(faceValue));

//     providerResponse = await axios({
//       method: 'post',
//       url: 'api/pay/',
//       data: formData,
//       headers: {
//         Authorization: `Bearer ${process.env.GSUBZ_API_KEY}`,
//       },
//       maxBodyLength: Infinity
//     });

//     console.log('PROVIDER RESPONSE', providerResponse);

//     const providerCode = String(providerResponse.data?.code);
//     const providerStatus = String(providerResponse.data?.status || '').toLowerCase();

//     success =
//       providerCode === "200" &&
//       (providerStatus === "successful" || providerStatus === "transaction_successful");

 
//     const actualCost = Number(providerResponse.data?.amountPaid || faceValue);
//     const roundedCost = Math.round(actualCost);
//     const providerDiscount = Math.max(faceValue - roundedCost, 0);
//     const realProfit = sellingPrice - roundedCost;

//     // 🔁 Refund on failure
//     if (!success) {
//       wallet.vtuBalance += sellingPrice;
//       await wallet.save();
//     }

//     await tx.update({
//       status: success ? 'success' : 'failed',
//       providerStatus: providerResponse.data?.status || null,
//       providerRef: providerResponse.data?.transactionID || null,
//       token: providerResponse.data?.api_response || null,
//       costPrice: roundedCost,          // ✅ use rounded
//       amountPaid: actualCost,          // keep decimal for analytics
//       profit: realProfit,              // ✅ matches validator
//       providerDiscount: Math.round(providerDiscount),
//       finalBalance: wallet.vtuBalance     // ✅ true final balance
//     });

//   } catch (err) {
//     // Provider crashed → refund user
//     wallet.vtuBalance += sellingPrice;
//     await wallet.save();

//     await tx.update({
//       status: 'failed',
//       finalBalance: wallet.vtuBalance     // ✅ true final balance
//     });

//     throw err;
//   }

//   // 📦 Frontend response
//   const refreshedTx = await VTUTransaction.findByPk(tx.id);

//   const transaction = {
//     service: refreshedTx.serviceName,
//     amount: refreshedTx.sellingPrice,
//     status: refreshedTx.status,
//     beneficiary: refreshedTx.beneficiary,
//     ref: refreshedTx.providerRef || 'N/A',
//     createdAt: refreshedTx.createdAt
//   };

//   if (success) {
//     return res.status(200).json({
//       status: "success",
//       data: { transaction }
//     });
//   }

//   if (!success && providerResponse?.data?.description === 'INSUFFICIENT_BALANCE') {
//     return next(new AppError(
//       "Service temporarily unavailable. Please try again later.",
//       "Provider wallet low",
//       503
//     ));
//   }

//   return res.status(400).json({
//     status: "fail",
//     message: providerResponse?.data?.description || "Airtime purchase failed",
//     data: { transaction }
//   });
// });


exports.buyAirtime = catchAsync(async (req, res, next) => {
  const { serviceID, phone, amount, requestId } = req.body;

  // 1. Validations
  if (!requestId) return next(new AppError("Request ID is required", "", 400));
  if (!serviceID || !phone || !amount) {
    return next(new AppError("serviceID, phone and amount are required", "", 400));
  }

  const faceValue = Number(amount);
  if (!Number.isFinite(faceValue) || faceValue < 100) {
    return next(new AppError("Airtime amount should not be less than N100", "", 400));
  }

  const providerRequestId = requestId.split('-').slice(0, 4).join('-');
  const sellingPrice = faceValue;

  // 2. Idempotency Check
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

  // 3. Debit User & Create Transaction Record
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
      type: 'airtime',
      provider: 'gsubz',
      serviceId: serviceID,
      serviceName: `${serviceID.toUpperCase()} Airtime`,
      beneficiary: phone,
      faceValue,
      costPrice: faceValue,
      sellingPrice,
      profit: 0,
      requestId,
      providerRequestId,
      status: 'pending',
      initialBalance,
      isRefunded: false // Explicitly set
    }, { transaction: t });

    await t.commit();
  } catch (err) {
    await t.rollback();
    throw err;
  }

  // 4. Call Provider API
  try {
    const formData = new FormData();
    formData.append('serviceID', serviceID);
    formData.append("requestID", providerRequestId);
    formData.append('phone', phone);
    formData.append('amount', String(faceValue));
    formData.append('api', process.env.GSUBZ_API_KEY);

    const providerResponse = await axios.post(`api/pay/`, formData, {
      headers: { Authorization: `Bearer ${process.env.GSUBZ_API_KEY}` }
    });

    // ✅ Use Normalizer
    const {
      status: normalizedStatus,
      isSuccessStatus,
      isSuccessCode,
      providerRef
    } = normalizeProviderResponse(providerResponse.data);

    const isClearlySuccessful = isSuccessCode && isSuccessStatus && providerRef;
    
    // Determine internal status
    const status = isClearlySuccessful ? "success" : "pending";

    const actualCost = Number(providerResponse.data?.amountPaid || faceValue);
    const roundedCost = Math.round(actualCost);
    const realProfit = sellingPrice - roundedCost;

    // 🔥 UPDATE TRANSACTION (NO MANUAL REFUND HERE)
    await tx.update({
      status,
      providerStatus: normalizedStatus,
      providerRef: providerRef || null,
      costPrice: roundedCost,
      amountPaid: actualCost,
      profit: realProfit,
      providerDiscount: Math.round(Math.max(faceValue - roundedCost, 0)),
      finalBalance: wallet.vtuBalance // This reflects the balance after debit
    });

    // Handle provider wallet issues
    if (providerResponse.data?.description === 'INSUFFICIENT_BALANCE') {
      return next(new AppError("Service unavailable. Please try again later.", "Low Provider Balance", 503));
    }

    // 5. Build Response
    const refreshedTx = await VTUTransaction.findByPk(tx.id);
    return res.status(200).json({
      status: "success",
      message: refreshedTx.status === "success" 
        ? "Airtime purchase successful" 
        : "Transaction processing. Check status shortly.",
      data: {
        transaction: {
          service: refreshedTx.serviceName,
          amount: refreshedTx.sellingPrice,
          status: refreshedTx.status,
          beneficiary: refreshedTx.beneficiary,
          ref: refreshedTx.providerRef || 'N/A',
          createdAt: refreshedTx.createdAt
        }
      }
    });

  } catch (err) {
    // ❗ CRITICAL: If provider API crashes, we leave it PENDING. 
    // The Cron will handle the verification and refund if necessary.
    console.error("AIRTIME PROVIDER ERROR:", err.message);
    
    await tx.update({ status: 'pending' });

    return res.status(200).json({
        status: "success",
        message: "Transaction is being processed. Please check back shortly.",
        data: { transaction: { status: 'pending', amount: sellingPrice } }
    });
  }
});