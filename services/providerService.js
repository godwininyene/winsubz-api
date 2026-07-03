const axios = require('../lib/axios');
const rawAxios = require('axios');
const normalizeProviderResponse =require('./../utils/normalizeProviderResponse')
const sanitizeDeliveryMessage = require('./../utils/sanitizeDeliveryMessage');
const getCostPrice = require('./../utils/getCostPrice');
const transactionService = require('./transactionService');

/**
 * Standardizes outbound provider API communications
 */
class ProviderService {
  /**
   * Dispatches the API call to the appropriate vendor
   */
  async dispatch(provider, type, payload) {
    const method = `${provider.toLowerCase()}_${type.toLowerCase()}`;
    if (typeof this[method] !== "function") {
      throw new Error(`Provider method ${method} is not implemented.`);
    }
    return await this[method](payload);
  }

  // --- GSUBZ IMPLEMENTATIONS ---
  async gsubz_data(payload) {
    const formData = new FormData();
    formData.append('serviceID', payload.serviceId);
    formData.append("requestID", payload.providerRequestId);
    formData.append('plan', payload.plan);
    formData.append('phone', payload.phone);
    formData.append('amount', '');
    formData.append('api', process.env.GSUBZ_API_KEY);

    const res = await axios.post(`api/pay/`, formData, {
      headers: { Authorization: `Bearer ${process.env.GSUBZ_API_KEY}` }
    });
    return res.data;
  }

  async gsubz_airtime(payload) {
    const formData = new FormData();
    formData.append('serviceID', payload.serviceId);
    formData.append("requestID", payload.providerRequestId);
    formData.append('phone', payload.phone);
    formData.append('amount', String(payload.faceValue));
    formData.append('api', process.env.GSUBZ_API_KEY);

    const res = await axios.post(`api/pay/`, formData, {
      headers: { Authorization: `Bearer ${process.env.GSUBZ_API_KEY}` }
    });
    return res.data;
  }
  /**
  * 🚀 UNIFIED ORCHESTRATOR FOR GSUBZ WORKFLOWS
  * Handles dispatching, intercepting balance errors, status normalization, and immediate wallet refunds.
  */
  async processGsubzTransaction({ context, serviceType, serviceId, payload, faceValue, sellingPrice }) {
    // 1. Fire upstream request to Gsubz using safe instance binding
    const resData = await this.dispatch("gsubz", serviceType, payload);
    console.log(`PROVIDER ${serviceType.toUpperCase()} RESPONSE:`, resData);

    // 2. Clear out immediate provider balance exhaustion hurdles
    if (resData?.description === 'INSUFFICIENT_BALANCE') {
      const amountToRefund = context.tx.sellingPrice;
      await transactionService.processRefund(context.tx, context.wallet, amountToRefund);

      await context.tx.update({
        status: "failed",
        providerStatus: "INSUFFICIENT_BALANCE",
        isRefunded: true,
        finalBalance: context.wallet.vtuBalance + amountToRefund,
        deliveryMessage: "Service temporarily unavailable due to upstream provider maintenance."
      });
      return "failed"; // Stop processing further down
    }

    // 3. Normalize structural layout elements
    const {
      status: normalizedStatus,
      isSuccessStatus,
      isFailedStatus,
      isReversedStatus,
      isSuccessCode,
      providerRef
    } = normalizeProviderResponse(resData);

    // Evaluate final transactional state metrics
    const isSuccess = isSuccessCode && isSuccessStatus && providerRef;
    const isExplicitFailure = isFailedStatus || isReversedStatus || resData?.code === 400;

    let status = "pending";
    if (isSuccess) status = "success";
    if (isExplicitFailure) status = isReversedStatus ? "reversed" : "failed";

    const deliveryMessage = sanitizeDeliveryMessage(resData?.api_response, resData?.message);
    const actualCost = getCostPrice("gsubz", faceValue, { type: serviceType, apiResponse: resData });
    const roundedCost = Math.round(actualCost);

    // 4. Handle Ledger States & Wallet Refunds Synchronously
    if (isExplicitFailure) {
      const amountToRefund = context.tx.sellingPrice;
      await transactionService.processRefund(context.tx, context.wallet, amountToRefund);

      await context.tx.update({
        status,
        providerStatus: normalizedStatus,
        providerRef: providerRef || null,
        costPrice: roundedCost,
        amountPaid: actualCost,
        profit: sellingPrice - roundedCost,
        providerDiscount: Math.round(Math.max(faceValue - roundedCost, 0)),
        isRefunded: true,
        finalBalance: context.wallet.vtuBalance + amountToRefund, // Update final visual balance snapshot
        deliveryMessage
      });
    } else {
      await context.tx.update({
        status,
        providerStatus: normalizedStatus,
        providerRef: providerRef || null,
        costPrice: roundedCost,
        amountPaid: actualCost,
        profit: sellingPrice - roundedCost,
        providerDiscount: Math.round(Math.max(faceValue - roundedCost, 0)),
        finalBalance: context.wallet.vtuBalance,
        deliveryMessage
      });
    }

    return status; // Return final execution status string for controller success hooks
  }

  // --- PEYFLEX IMPLEMENTATIONS ---
  async peyflex_electricity(payload) {
    const res = await rawAxios.post(
      "https://client.peyflex.com.ng/api/electricity/subscribe/",
      {
        identifier: "electricity",
        meter: payload.meter,
        plan: payload.plan,
        amount: String(payload.faceValue),
        type: payload.type,
        phone: payload.phone
      },
      {
        headers: {
          Authorization: `Token ${process.env.PEYFLEX_API_KEY}`,
          "Content-Type": "application/json"
        }
      }
    );
    return res.data;
  }

  async peyflex_cable(payload) {
    const rawAxios = require('axios');
    const res = await rawAxios.post(
      "https://client.peyflex.com.ng/api/cable/subscribe/",
      {
        identifier: payload.identifier,
        plan: payload.plan,
        iuc: payload.iuc,
        phone: payload.phone,
        amount: String(payload.amount)
      },
      {
        headers: {
          Authorization: `Token ${process.env.PEYFLEX_API_KEY}`,
          "Content-Type": "application/json"
        }
      }
    );
    return res.data;
  }
}

module.exports = new ProviderService();