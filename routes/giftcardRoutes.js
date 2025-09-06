const express = require('express');
const router = express.Router();
const authController = require('./../controllers/authController');
const giftcardController = require('./../controllers/giftcardController');
const{uploadGiftcard} = require('./../utils/multerConfig');

// Apply protect middleware to all routes
router.use(authController.protect);

// Public routes (authenticated users)
router.get('/', giftcardController.getAllGiftCards);
router.get('/:id', giftcardController.getGiftcard);

// Admin routes
router.use(authController.restrictTo('admin'));

router.post('/', uploadGiftcard,   giftcardController.createGiftcard);
router.patch('/:id', uploadGiftcard, giftcardController.editGiftcard);
router.delete('/:id',  giftcardController.deleteGiftcard);

module.exports = router;