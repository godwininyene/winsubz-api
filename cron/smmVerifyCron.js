const cron = require('node-cron');
const { Op } = require('sequelize');
const { SmmTransaction } = require('../models');
const smmTransactionService = require('../services/smmTransactionService');

let isRunning = false;

const startSmmVerificationCron = () => {
  // Run every 2 minutes ('*/2 * * * *') to sync with the internal verificationCooldown safety window
  cron.schedule('*/2 * * * *', async () => {

    if (isRunning) {
      console.log("⏭️ SMM Verification Cron skipped (still running instance active)");
      return;
    }

    isRunning = true;
    console.log("🔁 Running SMM transaction verification sync cron...");

    try {
      // Find orders that are actively active or processing, but haven't hit the absolute limits
      const pendingOrders = await SmmTransaction.findAll({
        where: {
          status: { [Op.in]: ['pending', 'processing', 'partial'] },
          isRefunded: false,
          providerOrderId: { [Op.ne]: null }, // Can only check if an order ID exists from the provider
          verificationAttempts: { [Op.lt]: 10 } // Safeguard threshold against infinite loops
        },
        order: [['lastVerifiedAt', 'ASC']], // Prioritize checking the oldest verified entries first
        limit: 20 // Processing chunk sizing to stay clear of memory/API lockups
      });

      console.log(`🔍 Found ${pendingOrders.length} active SMM orders awaiting verification updates`);

      for (const tx of pendingOrders) {
        try {
          // Pass control to your service instance logic
          await smmTransactionService.verifyOrderStatus(tx);
        } catch (err) {
          console.error(`❌ Error verifying SMM status for TX ID ${tx.id}:`, err.message);
        }
      }

    } catch (err) {
      console.error("❌ SMM CRON EXECUTION FETCH ERROR:", err.message);
    } finally {
      isRunning = false;
    }
  });
};

module.exports = startSmmVerificationCron;