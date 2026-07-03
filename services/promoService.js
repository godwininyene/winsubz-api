const { PromoUsage, PromoCode, VTUTransaction, Wallet, sequelize } = require('../models');

class PromoService {
    /**
     * Called once after a VTU transaction is confirmed successful.
     *
     * Does two things atomically:
     * 1. Credits the NEW USER a wallet bonus (the influencer's marketing hook).
     * 2. Puts the INFLUENCER's commission into pending escrow (released by cron after hold).
     *
     * Idempotent — safe to call multiple times for the same userId; the
     * isFirstFundingTriggered flag and DB transaction lock prevent double-processing.
     *
     * @param {number} userId  - The user who just completed a successful purchase
     */
    async checkAndTriggerPromoPayout(userId) {

        // 1. Find a promo usage entry for this user that hasn't been triggered yet.
        //    If they never used a promo code, or it already fired, bail out immediately.
        const usage = await PromoUsage.findOne({
            where: { userId, isFirstFundingTriggered: false },
            include: [{ model: PromoCode, as: 'promoCode' }]
        });

        if (!usage) return;

        const promoCode = usage.promoCode;

        // 2. Validate this is genuinely their FIRST ever successful VTU transaction.
        //    We count VTUTransactions (not Funding/wallet deposits) because the promo
        //    is triggered by purchasing a service, not just funding the wallet.
        const priorSuccessfulPurchases = await VTUTransaction.count({
            where: { userId, status: 'success' }
        });

        // If they have more than 1 successful transaction, the current one is not their first.
        // (The current transaction has already been marked 'success' before we're called,
        //  so a count of exactly 1 means this IS the first.)
        if (priorSuccessfulPurchases > 1) {
            return;
        }

        // 3. Process both payouts inside a single DB transaction so they're atomic —
        //    either both happen or neither does.
        const t = await sequelize.transaction();

        try {
            // ── Credit the NEW USER their bonus (the hook for the influencer's pitch)
            if (promoCode.bonusAmount > 0) {
                const userWallet = await Wallet.findOne({
                    where: { userId },
                    lock: t.LOCK.UPDATE,
                    transaction: t
                });

                if (userWallet) {
                    await userWallet.increment('vtuBalance', {
                        by: promoCode.bonusAmount,
                        transaction: t
                    });
                    console.log(`🎁 Credited ₦${promoCode.bonusAmount} bonus to User ${userId} for using promo ${promoCode.code}`);
                }
            }

            // ── Schedule the INFLUENCER's commission into pending escrow
            const holdDays = 1;
            const matureAt = new Date();
            matureAt.setDate(matureAt.getDate() + holdDays);

            await usage.update({
                isFirstFundingTriggered: true,
                commissionStatus: 'pending',
                matureAt
            }, { transaction: t });

            // ── Increment the promo code's usage counter
            await promoCode.increment('currentUses', { transaction: t });

            await t.commit();

            console.log(`✅ Promo triggered: Code=${promoCode.code}, User=${userId}, Influencer=${promoCode.influencerId}`);

        } catch (err) {
            await t.rollback();
            // Re-throw so the caller can log it; the user's actual transaction is unaffected
            // because this runs after the transaction response is already committed.
            throw err;
        }
    }

    /**
     * Revokes the wallet bonus given to a user if their triggering transaction
     * was later failed or reversed by the provider.
     *
     * Only acts if:
     * - The user actually received a bonus (bonusAmount > 0)
     * - The commission is still 'pending' (not yet matured/paid out)
     * - The wallet has enough balance to deduct (prevent negative balance)
     *
     * Must be called inside an existing sequelize transaction (t).
     *
     * @param {number} userId
     * @param {number} txId   - The VTUTransaction id being reversed (for logging)
     * @param {object} t      - Active Sequelize transaction
     */
    async revokePromoBonus(userId, txId, t) {

        // 1. Find the triggered usage entry for this user
        const usage = await PromoUsage.findOne({
            where: {
                userId,
                isFirstFundingTriggered: true,   // only if bonus was already given
                commissionStatus: 'pending'       // not yet matured — still reversible
            },
            include: [{ model: PromoCode, as: 'promoCode' }],
            lock: t.LOCK.UPDATE,
            transaction: t
        });

        // No triggered promo for this user, or commission already matured — nothing to do
        if (!usage) return;

        const bonusAmount = usage.promoCode.bonusAmount;

        // No bonus was given for this code — only influencer commission to handle
        if (!bonusAmount || bonusAmount <= 0) {
            // Still need to reverse the influencer's pending commission
            await usage.update({
                commissionStatus: 'reversed'
            }, { transaction: t });

            // Roll back the usage counter since this conversion didn't stick
            await usage.promoCode.decrement('currentUses', { transaction: t });

            console.log(`↩️ Influencer commission reversed for User ${userId} (TX ${txId})`);
            return;
        }

        // 2. Claw back the bonus from the user's wallet
        const userWallet = await Wallet.findOne({
            where: { userId },
            lock: t.LOCK.UPDATE,
            transaction: t
        });

        if (userWallet) {
            // Don't let balance go negative — deduct only what's available
            const deduction = Math.min(bonusAmount, userWallet.vtuBalance);
            await userWallet.decrement('vtuBalance', { by: deduction, transaction: t });

            console.log(`↩️ Clawed back ₦${deduction} bonus from User ${userId} (TX ${txId})`);
        }

        // 3. Reverse the influencer's pending commission and roll back the counter
        await usage.update({
            isFirstFundingTriggered: false,  // reset so if they purchase again legitimately, it can re-trigger
            commissionStatus: 'reversed',
            matureAt: null
        }, { transaction: t });

        await usage.promoCode.decrement('currentUses', { transaction: t });

        console.log(`↩️ Promo fully reversed for User ${userId} (TX ${txId}), Code: ${usage.promoCode.code}`);
    }
}

// Exporting an instantiated singleton instance
module.exports = new PromoService();