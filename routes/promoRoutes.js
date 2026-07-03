// routes/promoRoutes.js
const express = require('express');
const router = express.Router();
const promoController = require('../controllers/promoController');
const authController = require('../controllers/authController');

// 🔒 Protect all routes down here
router.use(authController.protect);

// 📈 Influencer & Admin Shared Endpoint
router.get(
  '/my-promo-stats', 
  authController.restrictTo('user', 'admin'), 
  promoController.getInfluencerStats
);

// 🛠️ Admin-Only Operations
router.use(authController.restrictTo('admin')); 

router.route('/')
  .post(promoController.createPromoCode)
  .get(promoController.getAllPromoCodes);

router.route('/:id')
  .get(promoController.getPromoCode)
  .patch(promoController.updatePromoCode)
  .delete(promoController.deletePromoCode);

module.exports = router;