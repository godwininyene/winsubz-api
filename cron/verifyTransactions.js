// const cron = require('node-cron');
// const { VTUTransaction } = require('../models');
// const { verifyTransactionInternal } = require('../utils/verifyTransactionService');

// const startVerificationCron = () => {
//     cron.schedule('*/2 * * * *', async () => {
//         console.log("🔁 Running VTU verification cron...");

//         const pendingTxs = await VTUTransaction.findAll({
//             where: { status: 'pending' },
//             limit: 20 // 🔥 prevent overload
//         });

//         for (const tx of pendingTxs) {
//             await verifyTransactionInternal(tx);
//         }
//     });
// };

// module.exports = startVerificationCron;


const cron = require('node-cron');
const { Op } = require('sequelize');
const { VTUTransaction } = require('../models');
const { verifyTransactionInternal } = require('../utils/verifyTransactionService');

const startVerificationCron = () => {
    cron.schedule('*/2 * * * *', async () => {
        console.log("🔁 Running VTU verification cron...");

        const TEN_MINUTES_AGO = new Date(Date.now() - 10 * 60 * 1000);

        try {
            const txs = await VTUTransaction.findAll({
                where: {
                    [Op.or]: [
                        // ⏳ Still pending
                        { status: 'pending' },

                        // ✅ Recently successful (monitor for reversal)
                        {
                            status: 'success',
                            updatedAt: { [Op.gte]: TEN_MINUTES_AGO }
                        }
                    ]
                },
                order: [['updatedAt', 'DESC']],
                limit: 30 // 🔥 slightly increased but still safe
            });

            console.log(`🔍 Found ${txs.length} transactions to verify`);

            for (const tx of txs) {
                try {
                    await verifyTransactionInternal(tx);
                } catch (err) {
                    console.log(`❌ Error verifying TX ${tx.id}:`, err.message);
                }
            }

        } catch (err) {
            console.log("❌ CRON FETCH ERROR:", err.message);
        }
    });
};

module.exports = startVerificationCron;