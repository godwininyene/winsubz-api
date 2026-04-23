// const axios = require('./../lib/axios')
// const { VTUTransaction, Wallet } = require('../models');
// const normalizeProviderResponse = require('../utils/normalizeProviderResponse');

// exports.verifyTransactionInternal = async (tx) => {
//     // ⛔ Skip if already resolved
//     if (tx.status === 'success' || tx.status === 'failed') return;

//     // ⛔ Retry limit
//     if (tx.verificationAttempts >= 5) {
//         await tx.update({ status: 'failed_manual_review' });
//         return;
//     }

//     // ⛔ Cooldown (avoid hitting provider too often)
//     const now = new Date();
//     const lastCheck = tx.lastVerifiedAt;

//     if (lastCheck && (now - lastCheck) < 60 * 1000) {
//         return; // wait at least 60 seconds
//     }

//     const providerRequestId =
//         tx.providerRequestId ||
//         tx.requestId.split('-').slice(0, 4).join('-');

//     try {
//         const formData = new FormData();
//         formData.append("requestID", providerRequestId);
//         formData.append("api", process.env.GSUBZ_API_KEY);

//         const response = await axios.post(`api/verify/`, formData, {
//             headers: {
//                 Authorization: `Bearer ${process.env.GSUBZ_API_KEY}`
//             }
//         });

//         const {
//             status: normalizedStatus,
//             isSuccessStatus,
//             isFailedStatus,
//             isSuccessCode,
//             providerRef
//         } = normalizeProviderResponse(response.data);

//         // ✅ SUCCESS
//         if (isSuccessCode && isSuccessStatus) {
//             await tx.update({
//                 status: "success",
//                 providerStatus: normalizedStatus,
//                 providerRef: providerRef || tx.providerRef,
//                 lastVerifiedAt: now
//             });
//             return;
//         }

//         // ❌ FAILED → REFUND
//         if (isFailedStatus) {
//             const wallet = await Wallet.findOne({
//                 where: { userId: tx.userId }
//             });

//             if (wallet) {
//                 wallet.vtuBalance += tx.sellingPrice;
//                 await wallet.save();

//                 await tx.update({
//                     status: "failed",
//                     providerStatus: normalizedStatus,
//                     finalBalance: wallet.vtuBalance,
//                     lastVerifiedAt: now
//                 });
//             }
//             return;
//         }

//         // ⏳ STILL PENDING
//         await tx.update({
//             verificationAttempts: tx.verificationAttempts + 1,
//             lastVerifiedAt: now
//         });

//     } catch (err) {
//         console.log("CRON VERIFY ERROR:", err.message);

//         await tx.update({
//             verificationAttempts: tx.verificationAttempts + 1,
//             lastVerifiedAt: new Date()
//         });
//     }
// };

const axios = require('./../lib/axios');
const FormData = require('form-data');
const { VTUTransaction, Wallet } = require('../models');
const normalizeProviderResponse = require('../utils/normalizeProviderResponse');

exports.verifyTransactionInternal = async (tx) => {

    const now = new Date();

    // 🧠 Allow re-checking success for 10 minutes (for reversal detection)
    const isRecentlySuccessful =
        tx.status === "success" &&
        (now - new Date(tx.updatedAt) < 10 * 60 * 1000);

    // ⛔ Skip fully resolved (except recent success)
    if (!isRecentlySuccessful && (tx.status === 'success' || tx.status === 'failed' || tx.status === 'reversed')) {
        return;
    }

    // ⛔ Retry limit
    if (tx.verificationAttempts >= 5) {
        await tx.update({ status: 'failed_manual_review' });
        return;
    }

    // ⛔ Cooldown (60s)
    if (tx.lastVerifiedAt && (now - new Date(tx.lastVerifiedAt)) < 60 * 1000) {
        return;
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

        console.log("VERIFY RESPONSE:", response.data);

        const {
            status: normalizedStatus,
            isSuccessStatus,
            isFailedStatus,
            isReversedStatus,
            isSuccessCode,
            providerRef
        } = normalizeProviderResponse(response.data);

        // =========================
        // 🔁 REVERSAL (HIGHEST PRIORITY)
        // =========================
        if (isReversedStatus) {

            // 🛡️ Prevent double refund
            if (tx.status !== "reversed") {
                const wallet = await Wallet.findOne({
                    where: { userId: tx.userId }
                });

                if (wallet) {
                    wallet.vtuBalance += tx.sellingPrice;
                    await wallet.save();

                    await tx.update({
                        status: "reversed",
                        providerStatus: normalizedStatus,
                        finalBalance: wallet.vtuBalance,
                        lastVerifiedAt: now
                    });
                }
            }

            return;
        }

        // =========================
        // ✅ SUCCESS
        // =========================
        if (isSuccessCode && isSuccessStatus) {
            await tx.update({
                status: "success",
                providerStatus: normalizedStatus,
                providerRef: providerRef || tx.providerRef,
                lastVerifiedAt: now
            });
            return;
        }

        // =========================
        // ❌ FAILED → REFUND
        // =========================
        if (isFailedStatus) {

            // 🛡️ Prevent double refund
            if (tx.status !== "failed") {
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
            }

            return;
        }

        // =========================
        // ⏳ STILL PENDING
        // =========================
        await tx.update({
            verificationAttempts: tx.verificationAttempts + 1,
            lastVerifiedAt: now
        });

    } catch (err) {
        console.log("CRON VERIFY ERROR:", err.message);

        await tx.update({
            verificationAttempts: tx.verificationAttempts + 1,
            lastVerifiedAt: now
        });
    }
};