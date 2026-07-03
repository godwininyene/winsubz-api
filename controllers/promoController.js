const { PromoCode, User, PromoUsage, Wallet } = require('../models');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/appError');
const generatePaginationMeta = require("./../utils/pagination");
const APIFeatures = require("../utils/apiFeatures");
const { Op } = require('sequelize');


/**
 * Create a new campaign promo code for an influencer
 */
exports.createPromoCode = catchAsync(async (req, res, next) => {
    const { code, influencerId, commissionAmount, bonusAmount, maxUses, expiryDate } = req.body;

    // 1. Verify that the assigned influencer actually exists in the system
    const influencer = await User.findByPk(influencerId);
    if (!influencer) {
        return next(new AppError('No user found with that ID to assign as influencer.', '', 404));
    }

    // 2. Build the record
    const newPromo = await PromoCode.create({
        code,
        influencerId,
        commissionAmount,
        bonusAmount,
        maxUses,
        expiryDate
    });

    res.status(201).json({
        status: 'success',
        data: { promo: newPromo }
    });
});
/**
 * Get all configured campaigns with their active conversions metrics (Paginated & Filtered)
 */
exports.getAllPromoCodes = catchAsync(async (req, res, next) => {
    // 1. Initialize APIFeatures with query params and model name
    const features = new APIFeatures(req.query, "PromoCode")
        .filter()
        .sort()
        .limitFields()
        .paginate();

    // 2. Inject structural relationships (Always include the influencer's profile details)
    // We check if an include array exists first to safely support limitFields or default configurations
    if (!features.queryOptions.include) {
        features.queryOptions.include = [];
    }

    features.queryOptions.include.push({
        model: User,
        as: 'influencer',
        attributes: ['id', 'firstName', 'lastName', 'email', 'phone']
    });

    // 3. Execute the database query with total row count calculations
    // Use getFeaures() to pass the fully structured options block into Sequelize
    const { count, rows: completePromos } = await PromoCode.findAndCountAll(features.getFeaures());

    // 4. Generate pagination metadata calculations
    const { page, limit } = features.getPaginationInfo();
    const pagination = generatePaginationMeta(req, page, limit, count);

    // 5. Send optimized payload response
    res.status(200).json({
        status: 'success',
        pagination,
        results: completePromos.length,
        data: {
            promos: completePromos
        }
    });
});

/**
 * Get details for a single code, along with individual conversion history logs and calculated performance metrics
 */
exports.getPromoCode = catchAsync(async (req, res, next) => {
    // 1. Fetch the raw campaign configuration and relational usage logs
    const promo = await PromoCode.findByPk(req.params.id, {
        include: [
            {
                model: User,
                as: 'influencer',
                attributes: ['id', 'firstName', 'lastName']
            },
            {
                model: PromoUsage,
                as: 'usages',
                include: [
                    {
                        model: User,
                        as: 'referredUser',
                        attributes: ['id', 'firstName', 'lastName', 'email', 'phone', 'createdAt']
                    }
                ]
            }
        ]
    });

    if (!promo) {
        return next(new AppError('No promo code campaign found with that ID', '', 404));
    }

    // 2. Perform Source-of-Truth financial and structural analytics
    const rawUsages = promo.usages || [];

    // Filter based on database property states
    const activatedCount = rawUsages.filter(u => u.isFirstFundingTriggered && u.commissionStatus !== 'reversed').length;
    const pendingCount = rawUsages.filter(u => !u.isFirstFundingTriggered).length;

    const totalLeads = activatedCount + pendingCount;
    const conversionRate = totalLeads === 0
        ? 0
        : parseFloat(((activatedCount / totalLeads) * 100).toFixed(1));

    const totalCommissionPaid = activatedCount * Number(promo.commissionAmount);
    const totalBonusDistributed = activatedCount * Number(promo.bonusAmount);
    const totalCampaignExpense = totalCommissionPaid + totalBonusDistributed;

    // 🎯 FIXED: Map the usage items explicitly to format the exact status string properties the frontend checks for
    const formattedUsages = rawUsages.map(usage => {
        const plainUsage = usage.get({ plain: true });

        // Define clean virtual UI flags matching your exact frontend conditional statements
        if (usage.isFirstFundingTriggered && usage.commissionStatus !== 'reversed') {
            plainUsage.status = 'completed'; // Matches frontend u.status === 'completed'
        } else {
            plainUsage.status = 'pending_purchase';
        }

        return plainUsage;
    });

    // 3. Convert the main parent object to plain data to cleanly hot-swap the usages collection payload
    const sanitizedPromo = promo.get({ plain: true });
    sanitizedPromo.usages = formattedUsages;

    res.status(200).json({
        status: 'success',
        data: {
            promo: sanitizedPromo,
            metrics: {
                activatedCount,
                pendingCount,
                totalLeads,
                conversionRate,
                financials: {
                    totalCommissionPaid,
                    totalBonusDistributed,
                    totalCampaignExpense
                }
            }
        }
    });
});

/**
 * Update parameters (e.g. Extending budget limits or updating expiration timelines)
 */
/**
 * Update parameters (Extending budget, fixing mistakes, modifying financial rewards safely)
 */
exports.updatePromoCode = catchAsync(async (req, res, next) => {
    const {
        code,
        influencerId,
        commissionAmount,
        bonusAmount,
        maxUses,
        expiryDate,
        status
    } = req.body;

    // 1. Locate the existing campaign
    const promo = await PromoCode.findByPk(req.params.id);
    if (!promo) {
        return next(new AppError('No promo code campaign found with that ID', '', 404));
    }

    // 2. DATA INTEGRITY CHECK: Has this code been successfully used by anyone yet?
    const hasBeenUsed = promo.currentUses > 0;

    if (hasBeenUsed) {
        // Block changing critical core identities or financial structures once live cash flows
        if (code && code.toUpperCase().trim() !== promo.code) {
            return next(new AppError('Cannot alter the string "code" once conversions have occurred. Create a new campaign instead.', '', 400));
        }
        if (influencerId && Number(influencerId) !== promo.influencerId) {
            return next(new AppError('Cannot reassign this campaign to a different influencer because existing conversions are bound to this account identity.', '', 400));
        }
        if (commissionAmount !== undefined && Number(commissionAmount) !== promo.commissionAmount) {
            return next(new AppError('Cannot update commission values while a campaign has active usages. This would corrupt background reversal logic.', '', 400));
        }
        if (bonusAmount !== undefined && Number(bonusAmount) !== promo.bonusAmount) {
            return next(new AppError('Cannot update user bonus hook structures mid-campaign once active usages exist.', '', 400));
        }
    } else {
        // 🚨 CLEAN CAMPAIGN PATH: Zero uses recorded yet. Feel free to modify anything!

        // Validate new influencer existence if changing it
        if (influencerId && Number(influencerId) !== promo.influencerId) {
            const newInfluencerExists = await User.findByPk(influencerId);
            if (!newInfluencerExists) {
                return next(new AppError('The specified new influencerId does not exist in the database.', '', 404));
            }
            promo.influencerId = influencerId;
        }

        // Apply mutations safely (Sequelize model setters handle uppercase and trimming automatically)
        if (code) promo.code = code;
        if (commissionAmount !== undefined) promo.commissionAmount = commissionAmount;
        if (bonusAmount !== undefined) promo.bonusAmount = bonusAmount;
    }

    // 3. AGNOSTIC FIELDS: These can ALWAYS be updated safely at any stage of the campaign life cycle
    if (maxUses !== undefined) {
        if (maxUses < promo.currentUses) {
            return next(new AppError(`Maximum uses cannot be set lower than the current active conversion count (${promo.currentUses}).`, '', 400));
        }
        promo.maxUses = maxUses;
    }
    if (expiryDate) promo.expiryDate = expiryDate;
    if (status) promo.status = status;

    // 4. Save and return updated instance
    await promo.save();

    res.status(200).json({
        status: 'success',
        data: { promo }
    });
});

/**
 * Delete a code configuration
 */
exports.deletePromoCode = catchAsync(async (req, res, next) => {
    const promo = await PromoCode.findByPk(req.params.id);

    if (!promo) {
        return next(new AppError('No promo code found with that ID', '', 404));
    }

    // Soft/Hard delete safety guard rails
    if (promo.currentUses > 0) {
        // If it has history, don't destroy the record—just deactivate/expire it to preserve lookup relationships
        promo.status = 'expired';
        await promo.save();

        return res.status(200).json({
            status: 'success',
            message: 'Promo code could not be hard deleted due to existing conversion usage history. It has been marked as expired instead.'
        });
    }

    await promo.destroy();

    res.status(204).json({
        status: 'success',
        data: null
    });
});


/**
 * Exposes influencer metrics along with an obscured list of signups for follow-up engagement.
 * Path: GET /api/v1/users/my-promo-stats
 */
exports.getInfluencerStats = catchAsync(async (req, res, next) => {
    const influencerId = req.user.id;
    // 1. Fetch the promo code and ALL usages (both dead signups and active conversions)
    const promo = await PromoCode.findOne({
        where: { influencerId },
        include: [{
            model: PromoUsage,
            as: 'usages',
            required: false, // Returns code even if they don't have a usage
            include: [{
                model: User,
                as: 'referredUser',
                attributes: ['firstName', 'phone', 'email', 'createdAt'], // Pull basic details
                required: false // Returns code even if they don't have a referalls
            }],

        }]

    });

    if (!promo) {
        return res.status(200).json({
            status: 'success',
            message: 'No active promotional campaign assigned to this account.',
            data: { hasCampaign: false }
        });
    }

    // 2. Fetch the influencer's wallet for current cleared referral balance balances
    const wallet = await Wallet.findOne({ where: { userId: influencerId } });

    // Helper function to hide PII while remaining recognizable
    const maskPhone = (phone) => {
        if (!phone) return 'N/A';
        return phone.length > 7 ? `${phone.slice(0, 4)}***${phone.slice(-3)}` : '***';
    };

    // 3. Separate usages into "Activated" vs "Pending Signup" arrays
    const activatedConversions = [];
    const pendingSignups = [];

    let pendingCommission = 0;
    let matureCommissionTotal = 0;
    let reversedCommissionTotal = 0;

    if (promo.usages && promo.usages.length > 0) {
        promo.usages.forEach(usage => {
            const userDetails = usage.referredUser;
            if (!userDetails) return; // Guard against orphan records

            const formattedUser = {
                firstName: userDetails.firstName,
                maskedPhone: maskPhone(userDetails.phone),
                signupDate: userDetails.createdAt
            };

            // If the user completed their first purchase
            if (usage.isFirstFundingTriggered && usage.commissionStatus !== 'reversed') {
                activatedConversions.push({
                    ...formattedUser,
                    status: 'completed',
                    earned: promo.commissionAmount
                });

                // Tally financials
                if (usage.commissionStatus === 'pending') pendingCommission += promo.commissionAmount;
                if (usage.commissionStatus === 'mature') matureCommissionTotal += promo.commissionAmount;
            }
            // If the user signed up but hasn't completed a transaction yet
            else if (!usage.isFirstFundingTriggered && usage.commissionStatus === 'none') {
                pendingSignups.push({
                    ...formattedUser,
                    status: 'pending_purchase'
                });
            }
            // Track cancellations/reversals separately if needed
            else if (usage.commissionStatus === 'reversed') {
                reversedCommissionTotal += promo.commissionAmount;
            }
        });
    }

    // 4. Calculate totals and rate after arrays are fully populated!
    const totalSignupsCount = activatedConversions.length + pendingSignups.length;

    // Using Math.round to deliver a beautiful clean decimal value to UI (e.g., 45.5)
    const conversionRate = totalSignupsCount === 0
        ? 0
        : Math.round((activatedConversions.length / totalSignupsCount) * 100 * 10) / 10;

    // 5. Send clean payload back down to frontend
    res.status(200).json({
        status: 'success',
        data: {
            hasCampaign: true,
            campaignDetails: {
                code: promo.code,
                status: promo.status,
                expiryDate: promo.expiryDate,
                maxUses: promo.maxUses,
                currentUses: promo.currentUses, // Paid conversions count
                remainingUses: Math.max(promo.maxUses - promo.currentUses, 0),
                userRewardHook: promo.bonusAmount
            },
            financials: {
                commissionPerConversion: promo.commissionAmount,
                pendingEscrowBalance: pendingCommission,
                clearedReferralBalance: wallet?.referralBalance || 0,
                lifetimeEarned: matureCommissionTotal,
                totalLossFromReversals: reversedCommissionTotal
            },
            leadsBreakdown: {
                totalSignupsCount,
                activatedCount: activatedConversions.length,
                pendingCount: pendingSignups.length,
                activatedConversions, // People who successfully converted
                pendingSignups,        // The follow-up hit-list for the influencer!
                conversionRate

            }
        }
    });
});