const axios = require("axios");
const catchAsync = require("../utils/catchAsync");
const AppError = require("../utils/appError");
const getMonnifyToken = require("../utils/monnifyAuth");
const { Funding, Wallet, sequelize } = require('./../models');

exports.initiatePayment = catchAsync(async (req, res, next) => {
    const user = req.user;
    const { amount } = req.body;

    if (!amount || amount < 100) {
        return next(new AppError("Minimum funding amount is ₦100", "", 400));
    }

    const token = await getMonnifyToken();
    const paymentReference = `WSR-${Date.now()}-${user.id}`;

    const payload = {
        amount: Number(amount),
        customerName: `${user.firstName} ${user.lastName}`,
        customerEmail: user.email,
        paymentReference,
        paymentDescription: "Wallet Funding via Checkout",
        currencyCode: "NGN",
        contractCode: process.env.MONNIFY_CONTRACT_CODE,
        redirectUrl: `${process.env.FRONTEND_URL}/user/payment-status`,
        paymentMethods: ["CARD", "ACCOUNT_TRANSFER", "USSD"]
    };

    try {
        const response = await axios.post(
            `${process.env.MONNIFY_BASE_URL}/api/v1/merchant/transactions/init-transaction`,
            payload,
            { headers: { Authorization: `Bearer ${token}` } }
        );

        const checkoutUrl = response.data.responseBody.checkoutUrl;

        // CREATE PENDING FUNDING RECORD HERE
        await Funding.create({
            paymentReference,
            amount: Number(amount),
            status: "pending",
            type: "deposit",
            userId: user.id,
            charge: 50, // The uniform N50 charge
            creditedAmount: Number(amount) - 50
        });

        res.status(200).json({
            status: "success",
            data: {
                checkoutUrl,
                paymentReference,
            },
        });
    } catch (err) {
        console.log('WETIN HAPPENED', err);

        return next(new AppError("Failed to initiate payment", "", 500));
    }
});

// GET /api/v1/payments/verify/:paymentReference
exports.verifyPayment = catchAsync(async (req, res, next) => {
    const { paymentReference } = req.params;
    const VTU_CHARGE = 50;

    // 1. Fetch the initial internal entry
    const payment = await Funding.findOne({ where: { paymentReference } });

    if (!payment) {
        return res.json({ status: "failed", message: "Payment transaction record not found." });
    }

    // 2. Short-circuit if the webhook or a previous click already finalized it
    if (payment.status === "success") {
        return res.json({ status: "success", data: payment });
    }

    // 3. Fail fast if session has completely expired (30 mins limit)
    const THIRTY_MINUTES = 30 * 60 * 1000;
    if (payment.status === "pending" && (Date.now() - new Date(payment.createdAt).getTime() > THIRTY_MINUTES)) {
        payment.status = "failed";
        await payment.save();
        return res.json({ status: "failed", message: "This payment session has expired." });
    }

    // 4. Query Monnify directly since the user clicked "Yes, I have paid"
    const token = await getMonnifyToken();

    try {
        const response = await axios.get(
            `${process.env.MONNIFY_BASE_URL}/api/v2/merchant/transactions/query`,
            {
                params: { paymentReference },
                headers: { Authorization: `Bearer ${token}` }
            }
        );

        const transaction = response.data.responseBody;
        // console.log('MONNIFY VERIFY RESPONSE:', transaction);

        // CASE 1: SUCCESSFUL LEDGER SETTLEMENT
        if (transaction.paymentStatus === "PAID") {
            const t = await sequelize.transaction();
            try {
                // Lock row to prevent simultaneous webhook/polling race conditions
                const refreshedPayment = await Funding.findOne({
                    where: { paymentReference },
                    transaction: t,
                    lock: t.LOCK.UPDATE
                });

                if (refreshedPayment.status === "success") {
                    await t.rollback();
                    return res.status(200).json({ status: "success", message: "Payment confirmed" });
                }

                const wallet = await Wallet.findOne({
                    where: { userId: payment.userId },
                    transaction: t,
                    lock: t.LOCK.UPDATE
                });

                const amountPaid = Number(transaction.amountPaid);
                const creditedAmount = amountPaid - VTU_CHARGE;

                // Credit Wallet Balance
                wallet.vtuBalance += creditedAmount;
                await wallet.save({ transaction: t });

                // Finalize payment log status properties
                refreshedPayment.reference = transaction.transactionReference;
                refreshedPayment.status = "success";
                refreshedPayment.amount = amountPaid;
                refreshedPayment.charge = VTU_CHARGE;
                refreshedPayment.creditedAmount = creditedAmount;
                await refreshedPayment.save({ transaction: t });

                await t.commit();
                return res.status(200).json({ status: "success", message: "Payment confirmed" });
            } catch (err) {
                await t.rollback();
                throw err;
            }
        }

        // CASE 2: EXPLICIT FAILURE DEFINITIONS
        if (["FAILED", "EXPIRED", "CANCELLED", "REVERSED", "OVERDUE", "REJECTED"].includes(transaction.paymentStatus)) {
            payment.status = "failed";
            await payment.save();
            return res.json({ status: "failed", message: "This payment session was marked failed or cancelled by the provider." });
        }

        // CASE 3: MONNIFY SAYS STILL "PENDING"
        // Since the user said they paid, but Monnify hasn't seen it, tell them to wait or try again.
        return res.json({
            status: "failed",
            message: "We haven't received a confirmation signal from your bank yet. If you have been debited, please wait 2 minutes and click Re-check Status."
        });

    } catch (err) {
        // Log the actual error to  cPanel stderror logs so we can read the stack trace
        console.error("VERIFY CONTROLLER ERROR:", err);

        // If it's a code reference error (like a missing import), don't blame the gateway
        if (err instanceof ReferenceError || err instanceof TypeError) {
            return res.status(500).json({
                status: "error",
                message: `Internal server configuration error: ${err.message}`
            });
        }

        // Default fallback for actual network/gateway communication issues
        return res.json({
            status: "failed",
            message: "Unable to reach the payment gateway processor right now. Please try checking again shortly."
        });
    }
});