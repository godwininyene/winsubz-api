'use strict';

const { SmmTransaction, Wallet, sequelize } = require("../models");
const providerService = require('./providerService');

class SmmTransactionService {
  /**
   * Initializes an SMM order securely by locking down user balance
   */
  async initialize({
    userId,
    provider = 'owlet',
    platform,
    serviceId,
    serviceName,
    link,
    quantity,
    costPrice,
    sellingPrice,
    profit,
    requestId
  }) {
    // 1. Strict Idempotency Barrier Check
    const existingTx = await SmmTransaction.findOne({ where: { requestId } });
    if (existingTx) {
      return { isDuplicate: true, tx: existingTx };
    }

    const t = await sequelize.transaction();

    try {
      // 2. Strict Row Locking to Eliminate Balance Race Conditions
      const wallet = await Wallet.findOne({
        where: { userId },
        lock: t.LOCK.UPDATE,
        transaction: t
      });

      if (!wallet) {
        const error = new Error("Wallet not found");
        error.isOperational = true;
        error.statusCode = 404;
        throw error;
      }

      // 3. Balance Safeguard Verification
      if (Number(wallet.vtuBalance) < Number(sellingPrice)) {
        const error = new Error("Insufficient wallet balance");
        error.isOperational = true;
        error.statusCode = 400;
        throw error;
      }

      const initialBalance = Number(wallet.vtuBalance);

      // Perform balance deduction using safe numeric casting
      wallet.vtuBalance = Number((initialBalance - Number(sellingPrice)).toFixed(4));
      await wallet.save({ transaction: t });

      // 4. Create Transaction Log Initial State
      const tx = await SmmTransaction.create({
        userId,
        provider,
        platform,
        serviceId,
        serviceName,
        link,
        quantity,
        costPrice,
        sellingPrice,
        profit,
        requestId,
        status: 'pending',
        initialBalance,
      }, { transaction: t });

      await t.commit();
      return { isDuplicate: false, tx, wallet };
    } catch (err) {
      if (!t.finished) await t.rollback();
      throw err;
    }
  }

  /**
   * Atomic Refund Method - MUST accept a transaction instance to remain thread-safe
   */
  async processRefund(tx, wallet, sellingPrice, transactionHost) {
    if (!transactionHost) {
      throw new Error("Transactional boundaries are mandatory for executing refunds safely.");
    }

    // Increment balance securely within the active database lock window
    await Wallet.increment('vtuBalance', {
      by: Number(sellingPrice),
      where: { id: wallet.id },
      transaction: transactionHost
    });
  }

  /**
   * Cron-driven Async order status verification sync engine
   */

  /**
  * Owlet orders are async — unlike VTU data/airtime, they don't
  * resolve in seconds. This checks status and maps Owlet's terms
  * to our internal enum. Run on a cron for anything sitting in
  * 'processing' for more than a few minutes.
  */
  async verifyOrderStatus(tx, force=false) {
    if (!['pending', 'processing', 'partial'].includes(tx.status)) return;
    if (!tx.providerOrderId) return;

    if (tx.verificationAttempts >= 10) {
      await tx.update({
        status: 'failed',
        providerStatus: 'max_attempts_exceeded',
        deliveryMessage: 'Order execution checks exceeded system limits. Please contact support.'
      });
      return;
    }

    // Cooldown check to prevent hitting provider rate limits
    // if (tx.lastVerifiedAt && (Date.now() - new Date(tx.lastVerifiedAt)) < 2 * 60 * 1000) {
    //   return;
    // }
    // Only apply the rate limit block if it is NOT a forced check
    if (!force && tx.lastVerifiedAt && (Date.now() - new Date(tx.lastVerifiedAt)) < 2 * 60 * 1000) {
      return;
    }

    try {
      const resData = await providerService.dispatch("owlet", "status", tx.providerOrderId);
      const now = new Date();

      // Owlet's standard status strings: Pending, In progress, Completed,
      // Partial, Processing, Canceled — map to our internal set.
      const statusMap = {
        'completed': 'success',
        'partial': 'partial',
        'canceled': 'canceled',
        'cancelled': 'canceled',
        'in progress': 'processing',
        'processing': 'processing',
        'pending': 'pending',
      };

      const mappedStatus = statusMap[resData?.status?.toLowerCase()] || 'processing';

      // Handle critical status changes atomically using managed database transactions
      if (mappedStatus === 'canceled' && !tx.isRefunded) {
        await sequelize.transaction(async (t) => {
          // Re-fetch and lock the target transaction row and wallet atomically
          const lockedTx = await SmmTransaction.findByPk(tx.id, { lock: t.LOCK.UPDATE, transaction: t });

          if (lockedTx.isRefunded || lockedTx.status === 'canceled') return; // Guard against concurrent execution updates

          const wallet = await Wallet.findOne({
            where: { userId: lockedTx.userId },
            lock: t.LOCK.UPDATE,
            transaction: t
          });

          if (wallet) {
            await this.processRefund(lockedTx, wallet, lockedTx.sellingPrice, t);

            const postRefundBalance = Number((Number(wallet.vtuBalance) + Number(lockedTx.sellingPrice)).toFixed(4));

            await lockedTx.update({
              status: 'canceled',
              providerStatus: resData?.status,
              startCount: resData?.start_count ? parseInt(resData.start_count, 10) : lockedTx.startCount,
              remains: resData?.remains !== undefined ? parseInt(resData.remains, 10) : lockedTx.remains,
              verificationAttempts: lockedTx.verificationAttempts + 1,
              lastVerifiedAt: now,
              isRefunded: true,
              finalBalance: postRefundBalance,
              deliveryMessage: "Order was canceled by provider — automatically refunded to wallet."
            }, { transaction: t });
          }
        });
      } else {
        // Non-refund state updates can safely execute normally
        const updates = {
          status: mappedStatus,
          providerStatus: resData?.status,
          startCount: resData?.start_count ? parseInt(resData.start_count, 10) : tx.startCount,
          remains: resData?.remains !== undefined ? parseInt(resData.remains, 10) : tx.remains,
          verificationAttempts: tx.verificationAttempts + 1,
          lastVerifiedAt: now,
        };

        if (mappedStatus === 'success') {
          updates.deliveryMessage = `Delivered successfully — ${resData?.remains ?? 0} remaining of ${tx.quantity} requested.`;
        }

        await tx.update(updates);
      }
    } catch (err) {
      console.error(`SMM status check failed for TX ${tx.id}:`, err.message);
      await tx.update({
        verificationAttempts: tx.verificationAttempts + 1,
        lastVerifiedAt: new Date(),
      });
    }
  }

  async getResponsePayload(txId) {
    const refreshed = await SmmTransaction.findByPk(txId);
    return {
      id: refreshed.id,
      requestId: refreshed.requestId,
      service: refreshed.serviceName,
      platform: refreshed.platform,
      link: refreshed.link,
      quantity: refreshed.quantity,
      costPrice:refreshed.costPrice,
      sellingPrice: refreshed.sellingPrice,
      amount: refreshed.sellingPrice,
      initialBalance:refreshed.initialBalance,
      finalBalance:refreshed.finalBalance,
      profit:refreshed.profit,
      status: refreshed.status,
      providerStatus: refreshed.providerStatus,
      providerOrderId:refreshed.providerOrderId,
      deliveryMessage: refreshed.deliveryMessage,
      remains: refreshed.remains,
      createdAt: refreshed.createdAt,
    };
  }
}

module.exports = new SmmTransactionService();