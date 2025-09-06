const { Wallet, User, Transaction, sequelize } = require('../models');
const catchAsync = require("../utils/catchAsync");
const { Op, fn, col, literal  } = require("sequelize");

  
//Get StatsForAdmin 
exports.getStatsForAdmin = catchAsync(async (req, res, next) => {
  // 1. Count users excluding admin
  const totalUsers = await User.count({
    where: { role: { [Op.ne]: "admin" } }
  });

  // 2. Total transaction volume (sum of amounts)
  const totalTransactionVolume = await Transaction.sum("amount");

  // 3. Giftcard volume
  const giftcardVolume = await Transaction.sum("amount", {
    where: { assetType: "giftcard" }
  });

  // 4. Coin volume
  const coinVolume = await Transaction.sum("amount", {
    where: { assetType: "coin" }
  });

  const stats = {
    totalUsers,
    totalTransactionVolume: totalTransactionVolume || 0,
    giftcardVolume: giftcardVolume || 0,
    coinVolume: coinVolume || 0,
  };

  res.status(200).json({
    status: "success",
    data: { stats },
  });
});



// Get Stats For User
exports.getStatsForUser = catchAsync(async (req, res, next) => {
  const userId = req.user.id;

  // 1. Get wallet balance
  const wallet = await Wallet.findOne({ where: { userId } });

  // 2. Total transaction volume for this user
  const totalTransactionVolume = await Transaction.sum("amount", {
    where: { userId }
  });

  // 3. Giftcard volume for this user
  const giftcardVolume = await Transaction.sum("amount", {
    where: { userId, assetType: "giftcard" }
  });

  // 4. Coin volume for this user
  const coinVolume = await Transaction.sum("amount", {
    where: { userId, assetType: "coin" }
  });

  const stats = {
    walletBalance: wallet ? wallet.balance : 0,
    totalTransactionVolume: totalTransactionVolume || 0,
    giftcardVolume: giftcardVolume || 0,
    coinVolume: coinVolume || 0,
  };

  res.status(200).json({
    status: "success",
    data: { stats },
  });
});

