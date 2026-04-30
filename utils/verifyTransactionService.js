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

// const axios = require('./../lib/axios');
// const FormData = require('form-data');
// const { VTUTransaction, Wallet } = require('../models');
// const normalizeProviderResponse = require('../utils/normalizeProviderResponse');

// exports.verifyTransactionInternal = async (tx) => {

//     const now = new Date();

//     // 🧠 Allow re-checking success for 10 minutes (for reversal detection)
//     const isRecentlySuccessful =
//         tx.status === "success" &&
//         (now - new Date(tx.updatedAt) < 10 * 60 * 1000);

//     // ⛔ Skip fully resolved (except recent success)
//     if (!isRecentlySuccessful && (tx.status === 'success' || tx.status === 'failed' || tx.status === 'reversed')) {
//         return;
//     }

//     // ⛔ Retry limit
//     if (tx.verificationAttempts >= 5) {
//         await tx.update({ status: 'failed_manual_review' });
//         return;
//     }

//     // ⛔ Cooldown (60s)
//     if (tx.lastVerifiedAt && (now - new Date(tx.lastVerifiedAt)) < 60 * 1000) {
//         return;
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

//         console.log("VERIFY RESPONSE:", response.data);

//         const {
//             status: normalizedStatus,
//             isSuccessStatus,
//             isFailedStatus,
//             isReversedStatus,
//             isSuccessCode,
//             providerRef
//         } = normalizeProviderResponse(response.data);

//         // =========================
//         // 🔁 REVERSAL (HIGHEST PRIORITY)
//         // =========================
//         if (isReversedStatus) {

//             // 🛡️ Prevent double refund
//             if (tx.status !== "reversed") {
//                 const wallet = await Wallet.findOne({
//                     where: { userId: tx.userId }
//                 });

//                 if (wallet) {
//                     wallet.vtuBalance += tx.sellingPrice;
//                     await wallet.save();

//                     await tx.update({
//                         status: "reversed",
//                         providerStatus: normalizedStatus,
//                         finalBalance: wallet.vtuBalance,
//                         lastVerifiedAt: now
//                     });
//                 }
//             }

//             return;
//         }

//         // =========================
//         // ✅ SUCCESS
//         // =========================
//         if (isSuccessCode && isSuccessStatus) {
//             await tx.update({
//                 status: "success",
//                 providerStatus: normalizedStatus,
//                 providerRef: providerRef || tx.providerRef,
//                 lastVerifiedAt: now
//             });
//             return;
//         }

//         // =========================
//         // ❌ FAILED → REFUND
//         // =========================
//         if (isFailedStatus) {

//             // 🛡️ Prevent double refund
//             if (tx.status !== "failed") {
//                 const wallet = await Wallet.findOne({
//                     where: { userId: tx.userId }
//                 });

//                 if (wallet) {
//                     wallet.vtuBalance += tx.sellingPrice;
//                     await wallet.save();

//                     await tx.update({
//                         status: "failed",
//                         providerStatus: normalizedStatus,
//                         finalBalance: wallet.vtuBalance,
//                         lastVerifiedAt: now
//                     });
//                 }
//             }

//             return;
//         }

//         // =========================
//         // ⏳ STILL PENDING
//         // =========================
//         await tx.update({
//             verificationAttempts: tx.verificationAttempts + 1,
//             lastVerifiedAt: now
//         });

//     } catch (err) {
//         console.log("CRON VERIFY ERROR:", err.message);

//         await tx.update({
//             verificationAttempts: tx.verificationAttempts + 1,
//             lastVerifiedAt: now
//         });
//     }
// };

// const axios = require('./../lib/axios');
// const FormData = require('form-data');
// const { VTUTransaction, Wallet, sequelize } = require('../models');
// const normalizeProviderResponse = require('../utils/normalizeProviderResponse');

// exports.verifyTransactionInternal = async (tx) => {

//     const now = new Date();

//     // =========================
//     // 🚫 TYPE GUARD (IMPORTANT)
//     // =========================
//     // Only allow airtime and data transactions
//     if (!['data', 'airtime'].includes(tx.type)) {
//         return;
//     }

//     // 🧠 Allow re-checking successful tx for 10 mins (to catch reversal)
//     const isRecentlySuccessful =
//         tx.status === "success" &&
//         (now - new Date(tx.updatedAt) < 10 * 60 * 1000);

//     // ⛔ Skip already resolved (except recent success)
//     if (!isRecentlySuccessful &&
//         (tx.status === 'success' || tx.status === 'failed' || tx.status === 'reversed')) {
//         return;
//     }

//     // ⛔ Stop retry after 5 attempts
//     if (tx.verificationAttempts >= 5) {
//         await tx.update({ status: 'failed_manual_review' });
//         return;
//     }

//     // ⛔ Cooldown (avoid hitting provider too frequently)
//     if (tx.lastVerifiedAt && (now - new Date(tx.lastVerifiedAt)) < 60 * 1000) {
//         return;
//     }

//     // ✅ Use provider-safe request ID
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

//         console.log("VERIFY RESPONSE:", response.data);

//         const {
//             status: normalizedStatus,
//             isSuccessStatus,
//             isFailedStatus,
//             isReversedStatus,
//             isSuccessCode,
//             providerRef
//         } = normalizeProviderResponse(response.data);

//         // =========================
//         // 🔁 REVERSAL (HIGHEST PRIORITY)
//         // =========================
//         if (isReversedStatus) {

//             // 🔥 STEP 1: atomic update (ONLY ONE PROCESS CAN WIN THIS)
//             const [updatedRows] = await VTUTransaction.update(
//                 {
//                     status: "reversed",
//                     providerStatus: normalizedStatus,
//                     isRefunded: true,
//                     lastVerifiedAt: now
//                 },
//                 {
//                     where: {
//                         id: tx.id,
//                         isRefunded: false // 🔒 prevents double refund
//                     }
//                 }
//             );

//             // 🛑 If 0 rows updated → another cron already handled it
//             if (updatedRows === 0) return;

//             // 💰 STEP 2: safely refund inside transaction
//             await sequelize.transaction(async (t) => {

//                 const wallet = await Wallet.findOne({
//                     where: { userId: tx.userId },
//                     lock: t.LOCK.UPDATE,
//                     transaction: t
//                 });

//                 wallet.vtuBalance += tx.sellingPrice;
//                 await wallet.save({ transaction: t });

//                 await tx.update({
//                     finalBalance: wallet.vtuBalance
//                 }, { transaction: t });

//             });

//             return;
//         }

//         // =========================
//         // ✅ SUCCESS
//         // =========================
//         if (isSuccessCode && isSuccessStatus) {
//             await tx.update({
//                 status: "success",
//                 providerStatus: normalizedStatus,
//                 providerRef: providerRef || tx.providerRef,
//                 lastVerifiedAt: now
//             });
//             return;
//         }

//         // =========================
//         // ❌ FAILED (REFUND ONCE ONLY)
//         // =========================
//         if (isFailedStatus) {

//             // 🔥 STEP 1: atomic update
//             const [updatedRows] = await VTUTransaction.update(
//                 {
//                     status: "failed",
//                     providerStatus: normalizedStatus,
//                     isRefunded: true,
//                     lastVerifiedAt: now
//                 },
//                 {
//                     where: {
//                         id: tx.id,
//                         isRefunded: false // 🔒 prevents double refund
//                     }
//                 }
//             );

//             if (updatedRows === 0) return;

//             // 💰 STEP 2: refund safely
//             await sequelize.transaction(async (t) => {

//                 const wallet = await Wallet.findOne({
//                     where: { userId: tx.userId },
//                     lock: t.LOCK.UPDATE,
//                     transaction: t
//                 });

//                 wallet.vtuBalance += tx.sellingPrice;
//                 await wallet.save({ transaction: t });

//                 await tx.update({
//                     finalBalance: wallet.vtuBalance
//                 }, { transaction: t });

//             });

//             return;
//         }

//         // =========================
//         // ⏳ STILL PENDING
//         // =========================
//         await tx.update({
//             verificationAttempts: tx.verificationAttempts + 1,
//             lastVerifiedAt: now
//         });

//     } catch (err) {
//         console.log("CRON VERIFY ERROR:", err.message);

//         await tx.update({
//             verificationAttempts: tx.verificationAttempts + 1,
//             lastVerifiedAt: now
//         });
//     }
// };


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

        console.log('PROVIDER RESPONSE', response.data);

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