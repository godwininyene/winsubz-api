const axios = require('../lib/axios');
const FormData = require('form-data');
const { VTUTransaction, Wallet, User, sequelize } = require("../models");
const normalizeProviderResponse = require('../utils/normalizeProviderResponse');
const sanitizeDeliveryMessage = require('../utils/sanitizeDeliveryMessage');
const promoService = require('./promoService');

class TransactionService {
  /**
   * Securely initializes a financial transaction lock and registers the ledger record
   */
  async initialize({ userId, type, provider, serviceId, serviceName, beneficiary, faceValue, sellingPrice, requestId, extraFields = {} }) {
    const existingTx = await VTUTransaction.findOne({ where: { requestId } });
    if (existingTx) {
      return { isDuplicate: true, tx: existingTx };
    }

    const providerRequestId = requestId.split('-').slice(0, 4).join('-');
    const t = await sequelize.transaction();

    try {
      const wallet = await Wallet.findOne({
        where: { userId },
        lock: t.LOCK.UPDATE,
        transaction: t
      });

      if (!wallet) {
        await t.rollback();
        throw new Error("Wallet not found");
      }

      if (wallet.vtuBalance < sellingPrice) {
        await t.rollback();
        throw new Error("Insufficient wallet balance");
      }

      const initialBalance = wallet.vtuBalance;
      wallet.vtuBalance -= sellingPrice;
      await wallet.save({ transaction: t });

      const tx = await VTUTransaction.create({
        userId,
        type,
        provider,
        serviceId,
        serviceName,
        beneficiary,
        faceValue,
        sellingPrice,
        costPrice: faceValue,
        profit: 0,
        requestId,
        providerRequestId,
        status: 'pending',
        initialBalance,
        ...extraFields
      }, { transaction: t });

      await t.commit();
      return { isDuplicate: false, tx, providerRequestId, wallet };
    } catch (err) {
      await t.rollback();
      throw err;
    }
  }

  /**
   * Concurrency-safe balance reversal update using atomic increments
   */
  async processRefund(tx, wallet, sellingPrice, transactionHost = null) {
    const options = transactionHost ? { transaction: transactionHost } : {};
    await Wallet.increment('vtuBalance', { by: sellingPrice, where: { id: wallet.id }, ...options });
    await tx.update({ status: 'failed' }, options);
  }

  /**
  * Verifies a pending transaction status against the third-party gateway 
  */
  async verifyTransactionInternal(tx) {
    const now = new Date();

    // 🚫 TYPE GUARD & STATUS CHECK
    if (!['data', 'airtime'].includes(tx.type)) return;

    // Allow re-checking successful tx for 10 mins (to catch late provider reversals)
    const isRecentlySuccessful =
      tx.status === "success" &&
      (now - new Date(tx.updatedAt) < 10 * 60 * 1000);// 10 minutes in milliseconds (600,000 ms)

    // Stop if already resolved
    if (!isRecentlySuccessful &&
      (['success', 'failed', 'reversed'].includes(tx.status) || tx.isRefunded)) {
      return;
    }

    // ⛔ Stop retry after 5 attempts to prevent infinite loops
    if (tx.verificationAttempts >= 5) {
      await tx.update({ status: 'failed_manual_review' });
      return;
    }

    // ⛔ Cooldown: Don't spam the provider API
    if (tx.lastVerifiedAt && (now - new Date(tx.lastVerifiedAt)) < 60 * 1000) {
      return;
    }

    const providerRequestId = tx.providerRequestId || tx.requestId.split('-').slice(0, 4).join('-');

    try {
      const formData = new FormData();
      formData.append("requestID", providerRequestId);
      formData.append("api", process.env.GSUBZ_API_KEY);

      const response = await axios.post(`api/verify/`, formData, {
        headers: { Authorization: `Bearer ${process.env.GSUBZ_API_KEY}` }
      });

      const {
        status: normalizedStatus,
        isSuccessStatus,
        isFailedStatus,
        isReversedStatus,
        isSuccessCode,
        providerRef
      } = normalizeProviderResponse(response.data);

      // console.log('PROVIDER RESPONSE', response);


      // Safely extract messaging context from background verification payload
      const deliveryMessage = sanitizeDeliveryMessage(response.data?.api_response, response.data?.message);

      // 💰 REFUND LOGIC (FAILED OR REVERSED)
      if (isFailedStatus || isReversedStatus) {
        // We use a managed transaction to ensure the refund is ATOMIC
        await sequelize.transaction(async (t) => {
          // 1. Re-fetch the transaction with a UPDATE lock to prevent race conditions
          const freshTx = await VTUTransaction.findOne({
            where: { id: tx.id, isRefunded: false },
            lock: t.LOCK.UPDATE,
            transaction: t
          });

          // If freshTx is null, it means it was already refunded by another process
          if (!freshTx) {
            console.log(`⚠️ Transaction ${tx.id} already refunded. Skipping.`);
            return;
          }

          // 2. Fetch and Lock Wallet
          const wallet = await Wallet.findOne({
            where: { userId: freshTx.userId },
            lock: t.LOCK.UPDATE,
            transaction: t
          });

          if (!wallet) throw new Error("Wallet not found during refund");

          // 3. Leverage the class method safely inside the atomic transaction block
          const amountToRefund = freshTx.sellingPrice;
          await this.processRefund(freshTx, wallet, amountToRefund, t);

          // 4. Mark as Refunded immediately in the same block
          await freshTx.update({
            status: isReversedStatus ? "reversed" : "failed",
            providerStatus: normalizedStatus,
            isRefunded: true, // 🔒 This prevents the double refund
            finalBalance: wallet.vtuBalance + amountToRefund, // Reflect the updated balance sum accurately
            deliveryMessage,
            lastVerifiedAt: now
          }, { transaction: t });

          // 5── Claw back promo bonus if this was the transaction that triggered it
          try {
            await promoService.revokePromoBonus(freshTx.userId, freshTx.id, t);
          } catch (promoErr) {
            // Log but don't rollback the refund over a promo issue
            console.error(`Promo bonus revocation failed for TX ${freshTx.id}:`, promoErr.message);
          }
          console.log(`✅ Refunded ${amountToRefund} to User ${freshTx.userId}. New Balance: ${wallet.vtuBalance + amountToRefund}`);
        });
        return;
      }

      // ✅ SUCCESS LOGIC
      if (isSuccessCode && isSuccessStatus) {
        // 🎯 Check if this is the EXACT moment it transitions to success
        const isInitialSuccessTransition = tx.status !== "success";

        if (isInitialSuccessTransition) {
          await tx.update({
            status: "success",
            providerStatus: normalizedStatus,
            providerRef: providerRef || tx.providerRef,
            deliveryMessage,
            lastVerifiedAt: now
          });

          // 🚀 Only trigger the promotional payout if it just transitioned to success
          try {
            await promoService.checkAndTriggerPromoPayout(tx.userId);
            console.log(`🎁 Promo check triggered via Cron for User ${tx.userId} on TX ${tx.id}`);
          } catch (promoErr) {
            console.error(`❌ Promo check failed silently in Service for TX ${tx.id}:`, promoErr.message);
          }
        } else {
          // It's a re-check of a recent success. Update tracking quietly without modifying the model instance's updatedAt field.
          // This ensures it naturally ages out of the cron's 10-minute window!
          await tx.update({
            lastVerifiedAt: now
          }, { silent: true });
        }
        return;
      }

      // ⏳ STILL PENDING
      await tx.update({
        verificationAttempts: tx.verificationAttempts + 1,
        lastVerifiedAt: now
      });

    } catch (err) {
      console.error("SERVICE VERIFY ERROR:", err.message);
      await tx.update({
        verificationAttempts: tx.verificationAttempts + 1,
        lastVerifiedAt: now
      });
    }
  }

  /**
   * Resolves and formats consistent database states for standard client outputs
   */
  async getResponsePayload(txId) {
    const refreshed = await VTUTransaction.findByPk(txId);
    return {
      service: refreshed.serviceName,
      amount: refreshed.sellingPrice,
      status: refreshed.status,
      beneficiary: refreshed.beneficiary,
      token: refreshed.token || null,
      ref: refreshed.providerRef || 'N/A',
      deliveryMessage: refreshed.deliveryMessage || null,
      createdAt: refreshed.createdAt
    };
  }
}

// Exporting an instantiated singleton instance
module.exports = new TransactionService();