const axios = require('./../lib/axios')
const { VTUTransaction, Wallet } = require('../models');
const normalizeProviderResponse = require('../utils/normalizeProviderResponse');

exports.verifyTransactionInternal = async (tx) => {
    // ⛔ Skip if already resolved
    if (tx.status === 'success' || tx.status === 'failed') return;

    // ⛔ Retry limit
    if (tx.verificationAttempts >= 5) {
        await tx.update({ status: 'failed_manual_review' });
        return;
    }

    // ⛔ Cooldown (avoid hitting provider too often)
    const now = new Date();
    const lastCheck = tx.lastVerifiedAt;

    if (lastCheck && (now - lastCheck) < 60 * 1000) {
        return; // wait at least 60 seconds
    }

    const providerRequestId =
        tx.providerRequestId ||
        tx.requestId.split('-').slice(0, 4).join('-');

    try {
        const formData = new FormData();
        formData.append("requestID", providerRequestId);
        formData.append("api", process.env.GSUBZ_API_KEY);

        const response = await axios.post(`api/verify/`, formData, {
            headers: {
                Authorization: `Bearer ${process.env.GSUBZ_API_KEY}`
            }
        });

        const {
            status: normalizedStatus,
            isSuccessStatus,
            isFailedStatus,
            isSuccessCode,
            providerRef
        } = normalizeProviderResponse(response.data);

        // ✅ SUCCESS
        if (isSuccessCode && isSuccessStatus) {
            await tx.update({
                status: "success",
                providerStatus: normalizedStatus,
                providerRef: providerRef || tx.providerRef,
                lastVerifiedAt: now
            });
            return;
        }

        // ❌ FAILED → REFUND
        if (isFailedStatus) {
            const wallet = await Wallet.findOne({
                where: { userId: tx.userId }
            });

            if (wallet) {
                wallet.vtuBalance += tx.sellingPrice;
                await wallet.save();

                await tx.update({
                    status: "failed",
                    providerStatus: normalizedStatus,
                    finalBalance: wallet.vtuBalance,
                    lastVerifiedAt: now
                });
            }
            return;
        }

        // ⏳ STILL PENDING
        await tx.update({
            verificationAttempts: tx.verificationAttempts + 1,
            lastVerifiedAt: now
        });

    } catch (err) {
        console.log("CRON VERIFY ERROR:", err.message);

        await tx.update({
            verificationAttempts: tx.verificationAttempts + 1,
            lastVerifiedAt: new Date()
        });
    }
};