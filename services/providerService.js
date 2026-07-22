const axios = require('../lib/axios');
const rawAxios = require('axios');
const normalizeProviderResponse = require('./../utils/normalizeProviderResponse')
const sanitizeDeliveryMessage = require('./../utils/sanitizeDeliveryMessage');
const getCostPrice = require('./../utils/getCostPrice');
const transactionService = require('./transactionService');
const { sequelize } = require("../models");

const OWLET_BASE_URL = process.env.OWLET_API_URL;

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

  // --- OWLET SMM IMPLEMENTATIONS ---

  // Fetch the live service catalog (id, name, rate per 1000, min/max)
  async owlet_services() {
    const res = await rawAxios.post(OWLET_BASE_URL, {
      key: process.env.OWLET_API_KEY,
      action: 'services'
    });
    return res.data; // array of { service, name, type, category, rate, min, max, refill, cancel }
  }

  // Place an order
  async owlet_add(payload) {
    const res = await rawAxios.post(OWLET_BASE_URL, {
      key: process.env.OWLET_API_KEY,
      action: 'add',
      service: payload.serviceId,
      link: payload.link,
      quantity: payload.quantity
    });
    return res.data; // { order: <id> } or { error: "..." }
  }

  // Check order status
  async owlet_status(providerOrderId) {
    const res = await rawAxios.post(OWLET_BASE_URL, {
      key: process.env.OWLET_API_KEY,
      action: 'status',
      order: providerOrderId
    });
    return res.data; // { charge, start_count, status, remains, currency }
  }
  // Check our Owlet wallet balance (useful for an admin low-balance alert)
  async owlet_balance() {
    const res = await rawAxios.post(OWLET_BASE_URL, {
      key: process.env.OWLET_API_KEY,
      action: 'balance'
    });
    return res.data; // { balance, currency }
  }


  /**
  * 🚀 UNIFIED ORCHESTRATOR FOR OWLET WORKFLOWS
  * Connects cleanly to the transaction pipeline with managed rollbacks on direct failures
  */
  async processOwletTransaction({ context, serviceId, link, quantity, costPrice, sellingPrice }) {
    const smmTransactionService = require('./smmTransactionService');
    try {
      const resData = await this.dispatch("owlet", "add", { serviceId, link, quantity });
      //console.log("PROVIDER OWLET ADD RESPONSE:", resData);

      // Handle explicit errors returned upstream by SMM endpoint
      if (resData?.error) {
        // Mask operational balance issues so we do not leak business details to the user
        const isProviderLowFunds = resData.error.toLowerCase().includes("funds") || resData.error.toLowerCase().includes("balance");
        const userFacingMessage = isProviderLowFunds
          ? "Service temporarily unavailable due to upstream provider maintenance."
          : `Provider rejected request: ${resData.error}`;

        await sequelize.transaction(async (t) => {
          await smmTransactionService.processRefund(context.tx, context.wallet, context.tx.sellingPrice, t);

          const postRefundBalance = Number((Number(context.wallet.vtuBalance) + Number(context.tx.sellingPrice)).toFixed(4));

          await context.tx.update({
            status: "failed",
            providerStatus: resData.error, // Safe to keep raw string internally inside DB for internal logging
            deliveryMessage: userFacingMessage, // Safe masked message displayed on the user's dashboard/Postman
            isRefunded: true,
            finalBalance: postRefundBalance,
          }, { transaction: t });
        });
        return "failed";
      }

      if (!resData?.order) {
        await context.tx.update({
          status: "pending",
          providerStatus: "unknown_response",
          deliveryMessage: "Unexpected response from provider — awaiting manual check.",
          finalBalance: Number(context.wallet.vtuBalance),
        });
        return "pending";
      }

      // Order successfully passed downstream to processing pipeline
      // Order successfully passed downstream to processing pipeline
      // Order accepted — Owlet orders start as "Pending"/"In progress" on
      // their end and complete asynchronously, unlike gsubz's near-instant
      // data/airtime delivery. So this stays "processing", not "success",
      // until a status check confirms completion.
      const calculatedProfit = Number((Number(sellingPrice) - Number(costPrice)).toFixed(4));

      await context.tx.update({
        status: "processing",
        providerOrderId: String(resData.order),
        providerStatus: "Pending",
        deliveryMessage: "Order placed successfully and is in progress. Do not place another order for this link until this is completed.",
        costPrice: Number(Number(costPrice).toFixed(4)),
        profit: calculatedProfit,
        finalBalance: Number(context.wallet.vtuBalance),
      });

      return "processing";

    } catch (error) {
      console.error("Critical failure during Owlet pipeline execution step:", error.message);

      // Keep transaction logs stable as pending so that fallback sync crons can evaluate state safely later
      await context.tx.update({
        status: "pending",
        providerStatus: "network_dispatch_error",
        deliveryMessage: "System encountered a temporary connection issue. Your order state will sync automatically."
      });
      return "pending";
    }
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