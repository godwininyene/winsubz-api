const express = require("express");
const webhookController = require("../controllers/webhookController");


const router = express.Router();

//Deposits Webhook (Reserved accounts & Checkout)
router.post("/monnify", webhookController.monnifyDepositWebhook);

//Payouts Webhook (Influencer Bank Outbound Transfers)
router.post("/monnify-disbursements", webhookController.handleMonnifyDisbursementWebhook);

module.exports = router;