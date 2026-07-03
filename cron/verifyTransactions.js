const cron = require('node-cron');
const { Op } = require('sequelize');
const { VTUTransaction } = require('../models');
const transactionService = require('../services/transactionService');

let isRunning = false;

const startVerificationCron = () => {
    cron.schedule('*/2 * * * *', async () => {

        if (isRunning) {
            console.log("⏭️ Cron skipped (still running)");
            return;
        }

        isRunning = true;
        console.log("🔁 Running VTU verification cron...");

        const TEN_MINUTES_AGO = new Date(Date.now() - 10 * 60 * 1000);

        try {
            const txs = await VTUTransaction.findAll({
                where: {
                    isRefunded: false,
                    [Op.or]: [
                        { status: 'pending' },
                        {
                            status: 'success',
                            updatedAt: { [Op.gte]: TEN_MINUTES_AGO }
                        }
                    ]
                },
                order: [['updatedAt', 'DESC']],
                limit: 30
            });

            console.log(`🔍 Found ${txs.length} transactions to verify`);

            for (const tx of txs) {
                try {
                
                    await transactionService.verifyTransactionInternal(tx);
                } catch (err) {
                    console.log(`❌ Error verifying TX ${tx.id}:`, err.message);
                }
            }

        } catch (err) {
            console.log("❌ CRON FETCH ERROR:", err.message);
        }

        isRunning = false;
    });
};

module.exports = startVerificationCron;