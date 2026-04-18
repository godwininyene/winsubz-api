const cron = require('node-cron');
const { VTUTransaction } = require('../models');
const { verifyTransactionInternal } = require('../utils/verifyTransactionService');

const startVerificationCron = () => {
    cron.schedule('*/2 * * * *', async () => {
        console.log("🔁 Running VTU verification cron...");

        const pendingTxs = await VTUTransaction.findAll({
            where: { status: 'pending' },
            limit: 20 // 🔥 prevent overload
        });

        for (const tx of pendingTxs) {
            await verifyTransactionInternal(tx);
        }
    });
};

module.exports = startVerificationCron;