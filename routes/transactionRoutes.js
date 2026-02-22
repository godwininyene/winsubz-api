const express = require("express");
const router = express.Router();
const authController = require("./../controllers/authController");
const transactionController = require("../controllers/transactionController");
const { uploadTransactionFiles } = require("./../utils/multerConfig");

// Apply protect middleware to all routes
router.use(authController.protect);

// Admin routes - define first
router.get("/pending", 
  authController.restrictTo("admin"),
  transactionController.getPendingTransactions
);

router.patch("/:id/action/:action",
  authController.restrictTo("admin"),
  transactionController.updateTransactionStatus
);

// Public routes (for all authenticated users)
router.get("/recent", transactionController.getRecentTransactions);
router.get('/', transactionController.getAllTradingTransactions)
router.get('/vtu', transactionController.getAllVtuTransactions)

// User-specific routes
router.use(authController.restrictTo("user"));
router.post("/", uploadTransactionFiles, transactionController.createTransaction)
 

module.exports = router;