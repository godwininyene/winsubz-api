const express = require('express');
const authController = require('./../controllers/authController');
const userController = require('./../controllers/userController');
const router = express.Router();
const{uploadProfilePhoto} = require('./../utils/multerConfig')

//Non Authenticated Routes
router.post('/signup', authController.signup);
router.post('/login', authController.login)
router.get('/logout', authController.logout)

//Authenticated Routes
router.patch('/updateMe', uploadProfilePhoto, userController.updateMe)

module.exports = router;