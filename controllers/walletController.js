const AppError = require("../utils/appError");
const catchAsync = require("../utils/catchAsync");
const { User, Wallet, Funding, sequelize } = require('./../models');
const fs = require('fs')
const crypto = require("crypto");

exports.fundWallet = catchAsync(async (req, res, next) => {
    const wallet = await Wallet.findOne({ where: { userId: req.params.id } });

    const { action, amount } = req.body;
    if (action === 'increment') {
        wallet.vtuBalance += parseInt(amount)
    } else if (action === 'decrement') {
        wallet.vtuBalance -= parseInt(amount)
    } else {
        return next(new AppError('Invalid action. Action is either increment or decrement', '', 400))
    }

    if (!amount || Number(amount) < 100) {
        return next(new AppError('"Minimum amount is ₦100"', '', 400))
    }

    await wallet.save();
    const user = await User.findByPk(req.params.id)
    res.status(200).json({
        status: 'success',
        data: {
            user
        }
    })
});


exports.monnifyWebhook = catchAsync(async (req, res, next) => {
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
    fs.writeFileSync('./monnify-response.json', JSON.stringify(event));

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

        // Emergency validation safeguard
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
            // Lock wallet row to prevent race conditions
            const wallet = await Wallet.findOne({
                where: { userId },
                transaction: t,
                lock: t.LOCK.UPDATE
            });

            if (!wallet) {
                await t.rollback();
                return res.status(404).json({ status: "fail", message: "Target wallet entity missing" });
            }

            const creditedAmount = amountPaid - VTU_CHARGE;

            // Credit Balance
            wallet.vtuBalance += creditedAmount;
            await wallet.save({ transaction: t });

            if (isCheckout) {
                // Find the existing initialized checkout log record
                const checkoutPayment = await Funding.findOne({
                    where: { paymentReference },
                    transaction: t,
                    lock: t.LOCK.UPDATE
                });

                if (checkoutPayment) {
                    // Double check status to prevent overwriting if verification endpoint beat the webhook
                    if (checkoutPayment.status === "success") {
                        await t.rollback();
                        return res.status(200).json({ status: "success", message: "Checkout already processed successfully" });
                    }

                    // Update existing row metrics
                    checkoutPayment.reference = reference;
                    checkoutPayment.status = "success";
                    checkoutPayment.amount = amountPaid;
                    checkoutPayment.charge = VTU_CHARGE;
                    checkoutPayment.creditedAmount = creditedAmount;
                    
                    await checkoutPayment.save({ transaction: t });
                } else {
                    // Fallback creation if initial checkout log row was missing
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
                // Write a brand new row for incoming direct virtual account transfers
                await Funding.create({
                    reference,
                    paymentReference: paymentReference || `REV-${Date.now()}`,
                    amount: amountPaid,
                    status: "success",
                    type: "deposit",
                    userId,
                    charge: VTU_CHARGE,
                    creditedAmount
                }, { transaction: t });
            }

            // Commit DB transaction changes permanently
            await t.commit();
            return res.status(200).json({ status: "success" });

        } catch (dbError) {
            // Roll back changes if database calls fail internally
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