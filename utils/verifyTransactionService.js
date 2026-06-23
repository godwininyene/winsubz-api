const axios = require('./../lib/axios');
const FormData = require('form-data');
const { VTUTransaction, Wallet, sequelize } = require('../models');
const normalizeProviderResponse = require('../utils/normalizeProviderResponse');

exports.verifyTransactionInternal = async (tx) => {
    const now = new Date();

    // ==========================================
    // 🚫 TYPE GUARD & STATUS CHECK
    // ==========================================
    if (!['data', 'airtime'].includes(tx.type)) return;

    // Allow re-checking successful tx for 10 mins (to catch late provider reversals)
    const isRecentlySuccessful =
        tx.status === "success" &&
        (now - new Date(tx.updatedAt) < 10 * 60 * 1000);

    // Stop if already resolved (unless it's a recent success we need to monitor)
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

        // console.log('PROVIDER RESPONSE', response.data);

        const {
            status: normalizedStatus,
            isSuccessStatus,
            isFailedStatus,
            isReversedStatus,
            isSuccessCode,
            providerRef
        } = normalizeProviderResponse(response.data);

        // ==========================================
        // 💰 REFUND LOGIC (FAILED OR REVERSED)
        // ==========================================
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

                // 3. Perform the Math
                const amountToRefund = freshTx.sellingPrice;
                wallet.vtuBalance += amountToRefund;
                await wallet.save({ transaction: t });

                // 4. Mark as Refunded immediately in the same block
                await freshTx.update({
                    status: isReversedStatus ? "reversed" : "failed",
                    providerStatus: normalizedStatus,
                    isRefunded: true, // 🔒 This prevents the double refund
                    finalBalance: wallet.vtuBalance,
                    lastVerifiedAt: now
                }, { transaction: t });

                console.log(`✅ Refunded ${amountToRefund} to User ${freshTx.userId}. New Balance: ${wallet.vtuBalance}`);
            });
            return;
        }

        // ==========================================
        // ✅ SUCCESS LOGIC
        // ==========================================
        if (isSuccessCode && isSuccessStatus) {
            await tx.update({
                status: "success",
                providerStatus: normalizedStatus,
                providerRef: providerRef || tx.providerRef,
                lastVerifiedAt: now
            });
            return;
        }

        // ==========================================
        // ⏳ STILL PENDING
        // ==========================================
        await tx.update({
            verificationAttempts: tx.verificationAttempts + 1,
            lastVerifiedAt: now
        });

    } catch (err) {
        console.error("CRON VERIFY ERROR:", err.message);
        await tx.update({
            verificationAttempts: tx.verificationAttempts + 1,
            lastVerifiedAt: now
        });
    }
};