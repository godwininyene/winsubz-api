const express = require('express');
const router = express.Router();
const authController = require('./../controllers/authController');
const smmController = require('./../controllers/smmController');

router.use(authController.protect);

router.get('/services', smmController.getSmmServices);
router.post('/order', smmController.placeSmmOrder);
router.get('/status/:orderId', smmController.checkSmmOrderStatus);
router.get('/history', smmController.getAllSmmTransactions);

module.exports = router;
