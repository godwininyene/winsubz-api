const cron = require('node-cron');
const { Op } = require('sequelize');
const { PromoUsage, PromoCode, Wallet, sequelize } = require('../models');

// Run every night at midnight (00:00)
const releasePromoCron = () => {
  cron.schedule('0 0 * * *', async () => {
    console.log('--- 🕒 Starting Midnight Promo Commission Release Job ---');

    // Use a Managed Transaction to guarantee data integrity across updates
    const t = await sequelize.transaction();

    try {
      // 1. Find ALL entries across the entire app that are matured but still pending
      const matureUsages = await PromoUsage.findAll({
        where: {
          commissionStatus: 'pending',
          isFirstFundingTriggered: true, // Safety check to ensure conversion actually happened
          matureAt: { [Op.lte]: new Date() } // matureAt is older than or equal to right now
        },
        include: [{ model: PromoCode, as: 'promoCode' }],
        transaction: t,
        lock: t.LOCK.UPDATE // Explicit lock prevents any other process from touching these rows during evaluation
      });

      if (matureUsages.length === 0) {
        console.log('No matured commissions to release tonight.');
        await t.commit();
        return;
      }

      console.log(`Found ${matureUsages.length} mature commissions to process...`);

      // 2. Map and aggregate total earnings per influencer
      const payoutsMap = {}; // { influencerId: totalAmount }
      const matureIds = [];

      for (let usage of matureUsages) {
        const influencerId = usage.promoCode.influencerId;
        const amount = usage.promoCode.commissionAmount;

        if (!payoutsMap[influencerId]) {
          payoutsMap[influencerId] = 0;
        }
        payoutsMap[influencerId] += amount;
        
        // Track the IDs to execute a unified bulk update later
        matureIds.push(usage.id);
      }

      // ⚡ OPTIMIZATION: Instead of individual row saves inside a loop, update ALL statuses in one query!
      await PromoUsage.update(
        { commissionStatus: 'mature' },
        { 
          where: { id: { [Op.in]: matureIds } },
          transaction: t 
        }
      );

      // 3. Credit each influencer's wallet safely in bulk
      for (const [influencerId, totalPayout] of Object.entries(payoutsMap)) {
        // 🔒 Lock each wallet for writing during the fetch to completely avoid withdrawal race conditions
        const wallet = await Wallet.findOne({ 
          where: { userId: influencerId }, 
          lock: t.LOCK.UPDATE,
          transaction: t 
        });
        
        if (wallet) {
          await wallet.increment('referralBalance', { by: totalPayout, transaction: t });
          console.log(`Released ₦${totalPayout} to Influencer ID: ${influencerId}`);
        }
      }

      // Commit everything safely to database
      await t.commit();
      console.log('--- ✅ Midnight Promo Commission Job Completed Successfully ---');

    } catch (error) {
      // Rollback changes completely if any part fails
      await t.rollback();
      console.error('--- ❌ Cron Job Failed, Changes Rolled Back:', error);
    }
  });
};

module.exports = releasePromoCron;
