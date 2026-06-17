const express = require("express");
const router = express.Router();
const { protect } = require("../controllers/authController");
const { initiatePayment,verifyPayment } = require("../controllers/paymentController");


router.use(protect)
router.post("/initiate", initiatePayment);
router.get("/verify/:paymentReference",verifyPayment);


module.exports = router;