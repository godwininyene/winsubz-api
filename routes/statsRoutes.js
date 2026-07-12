const authController = require("../controllers/authController");
const statsController = require("../controllers/statsController");
const express = require("express");
const router = express.Router();

//Protect all the routes below
router.use(authController.protect);

router.route('/leaderboard').get(statsController.getUserLeaderboard)
router
  .route("/users")
  .get(authController.restrictTo("user"), statsController.getStatsForUser);

// Admin routes
router.use(authController.restrictTo('admin'));
router
  .route("/admin")
  .get(statsController.getStatsForAdmin);
router
  .get("/admin/leaderboard", statsController.getLeaderboard);
router
  .route("/admin/charts")
  .get(statsController.getAdminChartData);

module.exports = router;
