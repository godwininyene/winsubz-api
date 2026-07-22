const express = require('express');
const router = express.Router();
const authController = require('./../controllers/authController');
const smmController = require('./../controllers/smmController');

// All SMM routes require user authentication
router.use(authController.protect);

// User Routes
router.get('/services', smmController.getSmmServices);
router.post('/order', smmController.placeSmmOrder);
router.get('/status/:orderId', smmController.checkSmmOrderStatus);
router.get('/history', smmController.getAllSmmTransactions);

// Admin Manual Override Routes (Restricted to Admins)
router.use(authController.restrictTo('admin'));
router.post(
  '/admin/refund/:orderId',
  smmController.adminRefundOrder
);

router.post(
  '/admin/complete/:orderId',
  smmController.adminCompleteOrder
);

module.exports = router;