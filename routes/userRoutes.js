const express = require("express");
const authController = require("./../controllers/authController");
const userController = require("./../controllers/userController");
const walletController = require('./../controllers/walletController');
const router = express.Router();
const { uploadProfilePhoto } = require("./../utils/multerConfig");

//Non Authenticated Routes
router.post("/signup", authController.signup);
router.post("/login", authController.login);
router.get("/logout", authController.logout);
router.post('/forgotPassword', authController.forgotPassword);
router.patch('/resetPassword/:token', authController.resetPassword);

//Authenticated Routes
router.use(authController.protect)
router.patch("/updateMe", uploadProfilePhoto, userController.updateMe);
router.patch('/updateMyPassword', authController.updatePassword);
router.get('/me', userController.getMe, userController.getUser)
router.get('/my-referrals', userController.getMyReferrals)
router.post('/withdraw-referral', userController.withdrawReferralBalance)

//Restrict all routes below to admin only
router.use(authController.restrictTo("admin"));
router.get("/", userController.getAllUsers);
router.route("/:id").delete(userController.deleteUser);
router.patch("/:id/status", userController.updateStatus);

router.patch('/:id/wallets', walletController.fundWallet)
module.exports = router;
