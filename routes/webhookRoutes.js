const express = require("express");
const walletController = require("../controllers/walletController");

const router = express.Router();

router.post("/monnify", walletController.monnifyWebhook);

module.exports = router;