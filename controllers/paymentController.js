const { Funding, Wallet, sequelize } = require('../models');
const monnifyService = require("../services/monnifyService");
const AppError = require("../utils/appError");
const catchAsync = require("../utils/catchAsync");

/**
 *1. Initiate Checkout Payment (Card, USSD, Transfer Button)
 * Generates a clean payment session link for the user interface.
 */
exports.initiatePayment = catchAsync(async (req, res, next) => {
    const user = req.user;
    const { amount } = req.body;

    // Enforce business rules: don't let anyone initialize an empty or micro-payment session
    if (!amount || amount < 100) {
        return next(new AppError("Minimum funding amount is ₦100", "", 400));
    }

    // Generate our unique internal tracking reference string mapped directly to the user ID
    const paymentReference = `WSR-${Date.now()}-${user.id}`;

    try {
        // Fire up the checkout session through our centralized service class wrapper
        const checkoutData = await monnifyService.initiateCheckout({
            amount,
            customerName: `${user.firstName} ${user.lastName}`,
            customerEmail: user.email,
            paymentReference
        });

        // Pull out the unique interactive checkout payment page URL provided by Monnify
        const checkoutUrl = checkoutData.checkoutUrl;

        // Log this session inside our local system database with an initial 'pending' status
        await Funding.create({
            paymentReference,
            amount: Number(amount),
            status: "pending",
            type: "deposit",
            userId: user.id,
            charge: 50, // Our standard fixed system transaction processing fee
            creditedAmount: Number(amount) - 50
        });

        // Pass the redirect information back to your React client front-end container application
        res.status(200).json({
            status: "success",
            data: {
                checkoutUrl,
                paymentReference,
            },
        });
    } catch (err) {
        console.error('CHECKOUT INITIATION FAILURE:', err);
        return next(new AppError("Failed to initiate payment transaction with the gateway", "", 500));
    }
});

/**
 * 2. Manual Payment Status Verification Polling / Synchronous Recheck
 * Triggered when a user returns to the portal and manually clicks "Yes, I have paid".
 */
exports.verifyPayment = catchAsync(async (req, res, next) => {
    const { paymentReference } = req.params;
    const VTU_CHARGE = 50;

    // Step 1: Look for our initial transaction entry log inside the database
    const payment = await Funding.findOne({ where: { paymentReference } });

    if (!payment) {
        return res.json({ status: "failed", message: "Payment transaction record not found." });
    }

    // Step 2: Short-circuit if the webhook thread already arrived and finalized it successfully
    if (payment.status === "success") {
        return res.json({ status: "success", data: payment });
    }

    // Step 3: Automatically fail sessions that are older than our 30-minute security window
    const THIRTY_MINUTES = 30 * 60 * 1000;
    if (payment.status === "pending" && (Date.now() - new Date(payment.createdAt).getTime() > THIRTY_MINUTES)) {
        payment.status = "failed";
        await payment.save();
        return res.json({ status: "failed", message: "This payment session has expired." });
    }

    try {
        // Step 4: Query the status of this payment from Monnify via our central service module
        const transaction = await monnifyService.verifyTransaction(paymentReference);

        // CASE A: Transaction was successfully paid! Let's update records and balances safely
        if (transaction.paymentStatus === "PAID") {
            const t = await sequelize.transaction();
            try {
                // Lock this row immediately to prevent simultaneous race conditions with an arriving webhook
                const refreshedPayment = await Funding.findOne({
                    where: { paymentReference },
                    transaction: t,
                    lock: t.LOCK.UPDATE
                });

                // If the webhook thread beat us inside this atomic lock period, exit cleanly
                if (refreshedPayment.status === "success") {
                    await t.rollback();
                    return res.status(200).json({ status: "success", message: "Payment confirmed" });
                }

                // Fetch the user's wallet record and apply the database row lock safety key
                const wallet = await Wallet.findOne({
                    where: { userId: payment.userId },
                    transaction: t,
                    lock: t.LOCK.UPDATE
                });

                const amountPaid = Number(transaction.amountPaid);
                const creditedAmount = amountPaid - VTU_CHARGE;

                // Credit the clean amount directly into their core VTU balance container
                wallet.vtuBalance += creditedAmount;
                await wallet.save({ transaction: t });

                // Update and close out our internal log ledger properties completely
                refreshedPayment.reference = transaction.transactionReference;
                refreshedPayment.status = "success";
                refreshedPayment.amount = amountPaid;
                refreshedPayment.charge = VTU_CHARGE;
                refreshedPayment.creditedAmount = creditedAmount;
                await refreshedPayment.save({ transaction: t });

                // Commit the database changes permanently to disk storage
                await t.commit();
                return res.status(200).json({ status: "success", message: "Payment confirmed" });
            } catch (err) {
                await t.rollback();
                throw err; // Pass error up to primary catch block
            }
        }

        // CASE B: Monnify reports the checkout session explicitly failed or was cancelled
        if (["FAILED", "EXPIRED", "CANCELLED", "REVERSED", "OVERDUE", "REJECTED"].includes(transaction.paymentStatus)) {
            payment.status = "failed";
            await payment.save();
            return res.json({ status: "failed", message: "This payment session was marked failed or cancelled by the provider." });
        }

        // CASE C: Monnify says the session is still active and waiting for cash signals
        return res.json({
            status: "failed",
            message: "We haven't received a confirmation signal from your bank yet. If you have been debited, please wait 2 minutes and click Re-check Status."
        });

    } catch (err) {
        console.error("VERIFY CONTROLLER ERROR LOGS:", err);

        // If it's a code formatting issue, log it to standard error streams without blaming the remote API network
        if (err instanceof ReferenceError || err instanceof TypeError) {
            return res.status(500).json({
                status: "error",
                message: `Internal server configuration error: ${err.message}`
            });
        }

        // Default soft fallback warning for any remote network timeout handshakes
        return res.json({
            status: "failed",
            message: "Unable to reach the payment gateway processor right now. Please try checking again shortly."
        });
    }
});