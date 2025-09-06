const express = require("express");
const authController = require("./../controllers/authController");
const userController = require("./../controllers/userController");
const router = express.Router();
const { uploadProfilePhoto } = require("./../utils/multerConfig");

//Non Authenticated Routes
router.post("/signup", authController.signup);
router.post("/login", authController.login);
router.get("/logout", authController.logout);

//Authenticated Routes
router.use(authController.protect)
router.patch("/updateMe", uploadProfilePhoto, userController.updateMe);
router.patch('/updateMyPassword', authController.updatePassword);
router.get('/me', userController.getMe, userController.getUser)

//Restrict all routes below to admin only
router.use(authController.restrictTo("admin"));
router.get("/", userController.getAllUsers);
router.route("/:id").delete(userController.deleteUser);
router.patch("/:id/status", userController.updateStatus);
module.exports = router;
