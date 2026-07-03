const { Withdrawal, Wallet, sequelize } = require('../models');
const monnifyService = require('../services/monnifyService');
const crypto = require('crypto');
const AppError = require('../utils/appError');
const catchAsync = require('../utils/catchAsync');

/**
 * 💸 Request Withdrawal
 * Handles internal balance transfers and external outbound bank cashouts for users.
 */
exports.requestWithdrawal = catchAsync(async (req, res, next) => {
    const userId = req.user.id;
    const { amount, destination, bankCode, accountNumber, accountName } = req.body;

    const requestedAmount = parseFloat(amount);
    if (isNaN(requestedAmount) || requestedAmount <= 0) {
        return next(new AppError('Please enter a valid amount to withdraw.', '', 400));
    }

    // Generate a clean unique tracking reference for this transaction session
    const uniqueReference = `WSR-${crypto.randomBytes(6).toString('hex').toUpperCase()}-${Date.now()}`;

    // =========================================================================
    // DATABASE TRANSACTION BLOCK: Protects balance states safely
    // =========================================================================
    const result = await sequelize.transaction(async (t) => {
        
        // 1. Fetch user wallet and apply a row lock to avoid double-spend issues
        const wallet = await Wallet.findOne({
            where: { userId },
            transaction: t,
            lock: t.LOCK.UPDATE
        });

        if (!wallet) {
            throw new AppError('We could not locate a wallet linked to your profile.', '', 404);
        }

        // 2. Make sure the user actually has enough money for this request
        if (parseFloat(wallet.referralBalance) < requestedAmount) {
            throw new AppError('Your referral balance is not enough to complete this withdrawal.', '', 400);
        }

        // 3. Deduct the funds from the referral pool immediately
        wallet.referralBalance = parseFloat(wallet.referralBalance) - requestedAmount;

        // Route Alternative A: Internal transfer directly into their main VTU funding wallet
        if (destination === 'vtu_balance') {
            wallet.vtuBalance = parseFloat(wallet.vtuBalance) + requestedAmount;
            await wallet.save({ transaction: t });

            // Create a completed transaction history log right away
            const withdrawal = await Withdrawal.create({
                userId,
                amount: requestedAmount,
                destination,
                status: 'success',
                reference: uniqueReference,
                narration: 'Internal transfer to VTU main wallet.'
            }, { transaction: t });

            return { withdrawal, wallet, instantSuccess: true };
        }

        // Route Alternative B: External cashout directly to a local commercial bank account
        if (destination === 'bank_account') {
            if (!bankCode || !accountNumber) {
                throw new AppError('Please choose a bank and provide your account number.', '', 400);
            }

            // Save the wallet balance deduction state safely first
            await wallet.save({ transaction: t });

            // Create a pending history log record while we talk to the payout gateway
            const withdrawal = await Withdrawal.create({
                userId,
                amount: requestedAmount,
                destination,
                status: 'processing',
                bankCode,
                accountNumber,
                accountName: accountName || 'E-Wallet Transfer Target',
                reference: uniqueReference,
                narration: `Bank withdrawal to account: ${accountNumber}`
            }, { transaction: t });

            return { withdrawal, wallet, instantSuccess: false };
        }

        throw new AppError('Please select a valid withdrawal option.', '', 400);
    });
    // 🔓 END OF DATABASE TRANSACTION BLOCK

    // If it was an internal transfer, we are finished here! Exit cleanly.
    if (result.instantSuccess) {
        return res.status(200).json({
            status: 'success',
            message: 'Funds have been added to your VTU balance successfully.',
            data: { withdrawal: result.withdrawal }
        });
    }

    // =========================================================================
    // OUTBOUND NETWORKING LAYER: Initiate Monnify Bank Transfer Call
    // =========================================================================
    let withdrawalRecord = result.withdrawal;

    const payoutResponse = await monnifyService.initiateTransfer({
        amount: withdrawalRecord.amount,
        reference: withdrawalRecord.reference,
        bankCode: withdrawalRecord.bankCode,
        accountNumber: withdrawalRecord.accountNumber,
        accountName: withdrawalRecord.accountName,
        narration: withdrawalRecord.narration
    });

    console.log('PAYOUT RESPONSE', payoutResponse);
    

    // Option 1: Payout was approved instantly by the provider engine
    if (payoutResponse.requestSuccessful && payoutResponse.responseBody?.status === 'SUCCESS') {
        await withdrawalRecord.update({
            status: 'success',
            monnifyReference: payoutResponse.responseBody.transactionReference
        });
    } 
    // Option 2: The transfer is currently queued up or processing at the banking switch
    else if (payoutResponse.requestSuccessful && payoutResponse.responseBody?.status === 'PENDING') {
        await withdrawalRecord.update({
            monnifyReference: payoutResponse.responseBody.transactionReference
        });
    } 
    // Option 3: Something went wrong at the bank gateway level. Reverse funds instantly.
    else {
        await sequelize.transaction(async (rollbackTx) => {
            const failedWallet = await Wallet.findOne({
                where: { userId },
                transaction: rollbackTx,
                lock: rollbackTx.LOCK.UPDATE
            });

            // Return the deducted amount back into the user's balance safely
            failedWallet.referralBalance = parseFloat(failedWallet.referralBalance) + requestedAmount;
            await failedWallet.save({ transaction: rollbackTx });

            // Update history log to note down why it failed
            await withdrawalRecord.update({
                status: 'failed',
                errorMessage: payoutResponse.responseMessage || 'The payment processor declined this request.',
                monnifyReference: payoutResponse.responseBody?.transactionReference || null
            }, { transaction: rollbackTx });
        });

        const safeUserMessage = payoutResponse.responseMessage || 'Please verify your bank details and try again shortly.';
        return next(new AppError(`Withdrawal could not be completed: ${safeUserMessage}`, '', 502));
    }

    // Return the appropriate success message to the customer interface
    res.status(200).json({
        status: 'success',
        message: withdrawalRecord.status === 'success' 
            ? 'Your withdrawal has been processed and sent to your bank account.' 
            : 'Your transfer has been sent and is currently processing. Check back soon.',
        data: { withdrawal: withdrawalRecord }
    });
});

/**
 * 📜 Get User Withdrawal Logs
 * Fetches the history of logged withdrawals for the authenticated user session.
 */
exports.getMyWithdrawals = catchAsync(async (req, res, next) => {
    const userId = req.user.id;

    const withdrawals = await Withdrawal.findAll({
        where: { userId },
        order: [['createdAt', 'DESC']]
    });

    res.status(200).json({
        status: 'success',
        results: withdrawals.length,
        data: {
            withdrawals
        }
    });
});

/**
 * 👑 Get All Global System Payout Logs (Admin Only)
 * Fetches all platform withdrawals along with structural owner profiles.
 */
exports.getAllWithdrawals = catchAsync(async (req, res, next) => {
    const withdrawals = await Withdrawal.findAll({
        include: [
            {
                association: 'user', 
                attributes: ['id', 'firstName',  'email']
            }
        ],
        order: [['createdAt', 'DESC']]
    });

    res.status(200).json({
        status: 'success',
        results: withdrawals.length,
        data: {
            withdrawals
        }
    });
});