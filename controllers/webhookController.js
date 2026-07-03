const { Withdrawal, Wallet, Funding, sequelize } = require('../models');
const catchAsync = require("../utils/catchAsync");
const fs = require('fs')
const crypto = require('crypto');

/**
 * 📥 Webhook 1: Handles Incoming Customer Deposits & Checkout Funding
 * This updates the user's VTU main balance when they pay via virtual account or checkout card/USSD.
 */
exports.monnifyDepositWebhook = catchAsync(async (req, res, next) => {
    // Fixed VTU wallet funding charge
    const VTU_CHARGE = 50;

    // Get signature from Monnify headers
    const signature = req.headers["monnify-signature"];

    // Convert raw buffer body to string
    const rawBody = req.body.toString();

    // Compute HMAC SHA512 hash to verify webhook authenticity
    const hash = crypto
        .createHmac("sha512", process.env.MONNIFY_SECRET_KEY)
        .update(rawBody)
        .digest("hex");

    // If signature mismatch, reject webhook
    if (signature !== hash) {
        return res.status(401).json({
            status: "fail",
            message: "Invalid webhook signature",
            signature,
            hash
        });
    }

    // Parse webhook event from raw body
    const event = JSON.parse(rawBody);
    const eventData = event.eventData;

    // Only process successful transactions
    if (event.eventType !== "SUCCESSFUL_TRANSACTION") {
        return res.status(200).json({ status: "ignored" });
    }

    // Optional: log the webhook for debugging
    // fs.writeFileSync('./monnify-response.json', JSON.stringify(event));

    // 2. Extract Data Safely
    const reference = eventData.transactionReference; // Monnify Master Ref
    const paymentReference = eventData.paymentReference; // Unique session ref
    const amountPaid = Number(eventData.amountPaid);

    let userId;
    let isCheckout = false;

    // =========================================================================
    // GLOBAL TRY-CATCH ZONE: Captures all DB and parsing anomalies cleanly
    // =========================================================================
    try {
        // 3. Determine Route Source (Checkout vs Reserved Account Transfer)
        if (paymentReference && paymentReference.startsWith("WSR-")) {
            // Source: Checkout (Card/USSD/Inline Transfer)
            const refParts = paymentReference.split("-");
            userId = refParts[refParts.length - 1]; // Safely extracts the last segment (e.g., "16")
            isCheckout = true;
        } else {
            // Source: Dedicated Virtual Bank Account Transfer
            const accountReference = eventData.product?.reference || eventData.productReference;
            if (!accountReference) {
                return res.status(400).json({ status: "fail", message: "No identifiable transaction reference mappings" });
            }
            userId = accountReference.split("-")[1];
        }

        // Safety guard: If we can't find a user ID, stop immediately
        if (!userId) {
            return res.status(400).json({ status: "fail", message: "Failed to extract target user mapping identifier" });
        }

        // 4. Clean Idempotency Check (Prevent Double Crediting)
        // Check if this explicit Monnify reference has already been marked successful
        const existingTransaction = await Funding.findOne({
            where: { reference, status: "success" }
        });

        if (existingTransaction) {
            return res.status(200).json({ status: "success", message: "Transaction already finalized" });
        }

        // 5. Atomic Safe Balance Progression
        const t = await sequelize.transaction();

        try {
            // Fetch the user's wallet and lock the row so no other request can change it at the same time
            const wallet = await Wallet.findOne({
                where: { userId },
                transaction: t,
                lock: t.LOCK.UPDATE
            });

            if (!wallet) {
                await t.rollback();
                return res.status(404).json({ status: "fail", message: "Target wallet entity missing" });
            }

            // Subtract our processing fee from the deposit amount
            const creditedAmount = amountPaid - VTU_CHARGE;

            // Add the clean funds directly to the user's VTU balance
            wallet.vtuBalance += creditedAmount;
            await wallet.save({ transaction: t });

            //Record the transaction history logs
            if (isCheckout) {
                // See if we have an existing pending checkout log row already waiting for this session
                const checkoutPayment = await Funding.findOne({
                    where: { paymentReference },
                    transaction: t,
                    lock: t.LOCK.UPDATE
                });

                if (checkoutPayment) {
                    // If it was already marked successful by a user click check, back out safely
                    if (checkoutPayment.status === "success") {
                        await t.rollback();
                        return res.status(200).json({ status: "success", message: "Checkout already processed successfully" });
                    }

                    // Turn the pending record into a completed success log
                    checkoutPayment.reference = reference;
                    checkoutPayment.status = "success";
                    checkoutPayment.amount = amountPaid;
                    checkoutPayment.charge = VTU_CHARGE;
                    checkoutPayment.creditedAmount = creditedAmount;

                    await checkoutPayment.save({ transaction: t });
                } else {
                    // Fallback: If no pre-initialized log row exists, create a fresh success record
                    await Funding.create({
                        reference,
                        paymentReference,
                        amount: amountPaid,
                        status: "success",
                        type: "deposit",
                        userId,
                        charge: VTU_CHARGE,
                        creditedAmount
                    }, { transaction: t });
                }
            } else {
                // Create a brand new history record for an incoming virtual bank account transfer
                await Funding.create({
                    reference,
                    paymentReference: paymentReference || `WSR-${Date.now()}`,
                    amount: amountPaid,
                    status: "success",
                    type: "deposit",
                    userId,
                    charge: VTU_CHARGE,
                    creditedAmount
                }, { transaction: t });
            }

            // Everything looks fantastic! Save all database changes permanently
            await t.commit();
            return res.status(200).json({ status: "success" });

        } catch (dbError) {
            // If anything crashed while updating the database, undo all changes to protect balances
            await t.rollback();
            throw dbError; // Pass down to primary catch block for uniform output logging
        }

    } catch (error) {
        // Log the exact error to your console so you can see crashes in your panel
        console.error("CRITICAL WEBHOOK PROCESSING FAILURE:", error);

        // Return a clean JSON string back to Monnify instead of throwing an HTML error page
        return res.status(500).json({
            status: "error",
            message: "Internal ledger processing crash",
            error: error.message
        });
    }
});

/**
 * 📤 Webhook: Handles Outbound Bank Disbursements (Influencer Cashouts)
 * This updates our system when the payout gateway responds to our money transfer requests.
 * Fully optimized to prevent race conditions and double-refund leaks!
 */
exports.handleMonnifyDisbursementWebhook = catchAsync(async (req, res, next) => {
    // Grab the security signature sent by Monnify for this disbursement event
    const monnifySignature = req.headers['monnify-signature'];
    const secretKey = process.env.MONNIFY_SECRET_KEY;

    // Convert the incoming raw stream buffer into a string
    const rawBody = req.body.toString();

    // Recompute the HMAC SHA512 hash to verify authenticity
    const computedSignature = crypto
        .createHmac('sha512', secretKey)
        .update(rawBody)
        .digest('hex');

    // If signatures don't match, block the unauthorized request right away
    if (monnifySignature !== computedSignature) {
        return res.status(401).json({ message: 'Unauthorized webhook intercept signature request rejected' });
    }

    // Safe signature confirmed! Let's transform the incoming body text into an object
    const eventBody = JSON.parse(rawBody);

    // Monnify disbursement data objects live inside the 'eventData' key or directly in the body
    const data = eventBody.eventData || eventBody;
    const { reference, status, responseMessage, transactionReference } = data;

    // =========================================================================
    // DATABASE TRANSACTION BLOCK: Safely handles asynchronous states
    // =========================================================================
    await sequelize.transaction(async (tx) => {

        // 1. Fetch the withdrawal record and apply a row lock (FOR UPDATE).
        // This forces the webhook and the controller to wait for each other in line!
        const withdrawal = await Withdrawal.findOne({
            where: { reference },
            lock: tx.LOCK.UPDATE,
            transaction: tx
        });

        // If the record isn't even in our system, exit the transaction block immediately
        if (!withdrawal) {
            return;
        }

        // 2. INTERNAL SAFETY CHECK
        // If the controller already handled the error and marked it failed, or if it already succeeded,
        // stop immediately so we don't refund or update the user twice.
        if (['success', 'failed'].includes(withdrawal.status)) {
            return;
        }

        // Case A: The money safely arrived in the influencer's external bank account!
        if (status === 'SUCCESS' || eventBody.eventType === 'SUCCESSFUL_DISBURSEMENT') {
            await withdrawal.update({
                status: 'success',
                monnifyReference: transactionReference
            }, { transaction: tx });
        }

        // Case B: The payout failed at the gateway or was rejected by the bank network
        else if (status === 'FAILED' || eventBody.eventType === 'FAILED_DISBURSEMENT') {
            // Securely fetch and lock the user's wallet row before making adjustments
            const wallet = await Wallet.findOne({
                where: { userId: withdrawal.userId },
                transaction: tx,
                lock: tx.LOCK.UPDATE
            });

            if (wallet) {
                // Return the cash back into their referral balance container safely
                wallet.referralBalance = parseFloat(wallet.referralBalance) + parseFloat(withdrawal.amount);
                await wallet.save({ transaction: tx });
            }

            // Mark the record as failed and save the banking error reason
            await withdrawal.update({
                status: 'failed',
                errorMessage: responseMessage || 'Asynchronous payment batch run failed routing trace.',
                monnifyReference: transactionReference
            }, { transaction: tx });
        }
    });
    // 🔓 END OF DATABASE TRANSACTION BLOCK

    // 3. Final balance-sheet verification to send back the appropriate HTTP text code
    const finalCheck = await Withdrawal.findOne({ where: { reference } });

    if (!finalCheck) {
        return res.status(200).json({ status: 'ignored', message: 'Reference profile trace tracking missing.' });
    }

    if (finalCheck.status === 'failed') {
        return res.status(200).json({ status: 'processed', message: 'Transaction tracking state finalized as failed.' });
    }

    // Reply with a clean 200 OK status so Monnify knows we logged the update and stops retrying
    return res.status(200).json({ status: 'acknowledged' });
});