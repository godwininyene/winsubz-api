const { Wallet, User, Transaction, sequelize, VTUTransaction } = require("../models");
const APIFeatures = require("../utils/apiFeatures");
const catchAsync = require("../utils/catchAsync");
const { Op, fn, col, literal } = require("sequelize");

/**
 * =========================================================
 * Get recent VTU transactions (last 7 days)
 * Used on both Admin & User dashboards
 * =========================================================
 */
const getRecentVtuTransactions = async (req) => {
  req.query.limit = 5;
  req.query.sort = "-createdAt";
  req.query.fields =
    "providerRef,serviceName,faceValue,status,beneficiary,planLabel,createdAt";
  // Calculate date 7 days ago
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  // Format date in ISO format (YYYY-MM-DD) for the filter
  const formattedDate = sevenDaysAgo.toISOString();
  // Add createdAt filter for the last 7 days using gte operator
  req.query.createdAt = { gte: formattedDate };

  const features = new APIFeatures(req.query, "VTUTransaction")
    .filter()
    .sort()
    .limitFields()
    .paginate();

  // Restrict transactions for users to only their own
  if (req.user?.role === "user") {
    features.queryOptions.where = {
      ...features.queryOptions.where,
      userId: req.user.id, // Ensure only user's transactions are returned
    };
  }
  // If admin, include user details
  if (req.user.role === "admin") {
    features.queryOptions.include.push({
      model: User,
      as: "user",
      attributes: ["firstName", "lastName", "photo", "email"],
    });
  }
  //Execute query
  const transactions = await VTUTransaction.findAll(features.getFeaures());
  //Send Response
  return transactions
};

/**
 * =========================================================
 * Get Stats For Admin Dashboard
 * Includes:
 * - Users
 * - Crypto volume
 * - Giftcard volume
 * - VTU volume
 * - VTU profit (NEW)
 * =========================================================
 */
exports.getStatsForAdmin = catchAsync(async (req, res, next) => {
  const now = new Date();

  // Current month range
  const startOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

  // Previous month range
  const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);

  /**
   * Helper: fetch stats within a date range
   */
  const getStats = async (startDate, endDate) => {
    // Count active users (excluding admins)
    const userCount = await User.count({
      where: {
        role: { [Op.ne]: "admin" },
        active: true,
        createdAt: { [Op.between]: [startDate, endDate] },
      },
    });

    // Aggregate crypto & giftcard transactions
    const transactionStats = await User.findAll({
      attributes: [
        [fn("COALESCE", fn("SUM", col("transactions.amount")), 0), "totalTransactionVolume"],
        [
          fn(
            "COALESCE",
            fn("SUM", literal("CASE WHEN `transactions`.`assetType` = 'giftcard' THEN `transactions`.`amount` ELSE 0 END")),
            0
          ),
          "giftcardVolume",
        ],
        [
          fn(
            "COALESCE",
            fn("SUM", literal("CASE WHEN `transactions`.`assetType` = 'coin' THEN `transactions`.`amount` ELSE 0 END")),
            0
          ),
          "coinVolume",
        ],
      ],
      include: [
        {
          model: Transaction,
          as: "transactions",
          attributes: [],
          where: {
            status: "completed",
            createdAt: { [Op.between]: [startDate, endDate] },
          },
          required: false,
        },
      ],
      where: { role: { [Op.ne]: "admin" }, active: true },
      raw: true,
    }).then((res) => res[0]);

    // Aggregate VTU stats
    const vtuStats = await VTUTransaction.findOne({
      attributes: [
        [fn("COALESCE", fn("SUM", col("sellingPrice")), 0), "vtuVolume"],
        [fn("COUNT", col("id")), "vtuCount"],
        [
          fn(
            "COALESCE",
            fn("SUM", literal("`sellingPrice` - `amountPaid`")),
            0
          ),
          "vtuProfit",
        ],
      ],
      where: {
        status: "success",
        createdAt: { [Op.between]: [startDate, endDate] },
      },
      raw: true,
    });

    return {
      totalUsers: Number(userCount || 0),
      totalTransactionVolume: Number(transactionStats.totalTransactionVolume || 0),
      giftcardVolume: Number(transactionStats.giftcardVolume || 0),
      coinVolume: Number(transactionStats.coinVolume || 0),
      vtuVolume: Number(vtuStats.vtuVolume || 0),
      vtuCount: Number(vtuStats.vtuCount || 0),
      vtuProfit: Number(vtuStats.vtuProfit || 0),
    };
  };

  const currentStats = await getStats(startOfThisMonth, endOfToday);
  const prevStats = await getStats(startOfLastMonth, endOfLastMonth);

  /**
   * Utility: percentage change
   */
  const calcChange = (curr, prev) => {
    if (!prev || prev === 0) return curr > 0 ? "100%" : "0%";
    return (((curr - prev) / prev) * 100).toFixed(1) + "%";
  };

  const response = [
    {
      title: "Total Users",
      total: (currentStats.totalUsers + prevStats.totalUsers).toLocaleString(),
      currentValue: currentStats.totalUsers,
      preValue: prevStats.totalUsers,
      change: calcChange(currentStats.totalUsers, prevStats.totalUsers),
    },
    {
      title: "Total Transactions",
      total: `₦${(currentStats.totalTransactionVolume + prevStats.totalTransactionVolume).toLocaleString()}`,
      currentValue: `₦${currentStats.totalTransactionVolume.toLocaleString()}`,
      preValue: `₦${prevStats.totalTransactionVolume.toLocaleString()}`,
      change: calcChange(currentStats.totalTransactionVolume, prevStats.totalTransactionVolume),
    },
    {
      title: "Gift Card Volume",
      total: `₦${(currentStats.giftcardVolume + prevStats.giftcardVolume).toLocaleString()}`,
      currentValue: `₦${currentStats.giftcardVolume.toLocaleString()}`,
      preValue: `₦${prevStats.giftcardVolume.toLocaleString()}`,
      change: calcChange(currentStats.giftcardVolume, prevStats.giftcardVolume),
    },
    {
      title: "Crypto Volume",
      total: `₦${(currentStats.coinVolume + prevStats.coinVolume).toLocaleString()}`,
      currentValue: `₦${currentStats.coinVolume.toLocaleString()}`,
      preValue: `₦${prevStats.coinVolume.toLocaleString()}`,
      change: calcChange(currentStats.coinVolume, prevStats.coinVolume),
    },
    {
      title: "VTU Volume",
      total: `₦${(currentStats.vtuVolume + prevStats.vtuVolume).toLocaleString()}`,
      currentValue: `₦${currentStats.vtuVolume.toLocaleString()}`,
      preValue: `₦${prevStats.vtuVolume.toLocaleString()}`,
      change: calcChange(currentStats.vtuVolume, prevStats.vtuVolume),
    },
    {
      title: "VTU Profit",
      total: `₦${(currentStats.vtuProfit + prevStats.vtuProfit).toLocaleString()}`,
      currentValue: `₦${currentStats.vtuProfit.toLocaleString()}`,
      preValue: `₦${prevStats.vtuProfit.toLocaleString()}`,
      change: calcChange(currentStats.vtuProfit, prevStats.vtuProfit),
    },
  ];

  const recentVtuTransactions = await getRecentVtuTransactions(req);

  res.status(200).json({
    status: "success",
    data: { stats: response, recentVtuTransactions },
  });
});

/**
 * =========================================================
 * Get chart data for Admin dashboard
 * (Crypto + Giftcards)
 * =========================================================
 */
exports.getAdminChartData = catchAsync(async (req, res, next) => {
  const { period } = req.query;
  const now = new Date();

  let startDate, endDate;

  // Calculate date range based on period
  if (period === "yearly") {
    startDate = new Date(now.getFullYear(), 0, 1);
    endDate = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999);
  } else if (period === "monthly") {
    startDate = new Date(now.getFullYear(), now.getMonth(), 1);
    endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
  } else {
    // Weekly
    const dayOfWeek = now.getDay();
    startDate = new Date(now);
    startDate.setDate(now.getDate() - dayOfWeek);
    endDate = new Date(now);
    endDate.setDate(now.getDate() + (6 - dayOfWeek));
    endDate.setHours(23, 59, 59, 999);
  }

  // Transaction volume over time
  const transactionVolume = await Transaction.findAll({
    attributes: [
      [fn("DATE", col("createdAt")), "date"],
      [fn("SUM", col("amount")), "totalAmount"],
      [fn("COUNT", col("id")), "transactionCount"],
    ],
    where: { createdAt: { [Op.between]: [startDate, endDate] } },
    group: [fn("DATE", col("createdAt"))],
    order: [[fn("DATE", col("createdAt")), "ASC"]],
    raw: true,
  });

  // User growth over time
  const userGrowth = await User.findAll({
    attributes: [
      [fn("DATE", col("createdAt")), "date"],
      [fn("COUNT", col("id")), "newUsers"],
    ],
    where: {
      createdAt: { [Op.between]: [startDate, endDate] },
      role: { [Op.ne]: "admin" },
    },
    group: [fn("DATE", col("createdAt"))],
    order: [[fn("DATE", col("createdAt")), "ASC"]],
    raw: true,
  });

  // Distribution of transaction types
  const transactionTypes = await Transaction.findAll({
    attributes: ["assetType", "transactionType", [fn("COUNT", col("id")), "count"], [fn("SUM", col("amount")), "totalAmount"]],
    where: { createdAt: { [Op.between]: [startDate, endDate] } },
    group: ["assetType", "transactionType"],
    raw: true,
  });

  

  res.status(200).json({
    status: "success",
    data: { transactionVolume, userGrowth, transactionTypes },
  });
});

/**
 * =========================================================
 * Get Stats For User Dashboard
 * =========================================================
 */
exports.getStatsForUser = catchAsync(async (req, res, next) => {
  const userId = req.user.id;
  const now = new Date();

  const startOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

  const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);

  const wallet = await Wallet.findOne({
    where: { userId },
    attributes: ["totalBalance", "cryptoBalance", "giftCardBalance", "vtuBalance"],
  });

  const walletData = wallet
    ? wallet.get({ plain: true })
    : { totalBalance: 0, cryptoBalance: 0, giftCardBalance: 0, vtuBalance: 0 };

  const currentMonthVolume =
    (await Transaction.sum("amount", {
      where: {
        userId,
        status: "completed",
        createdAt: { [Op.between]: [startOfThisMonth, endOfToday] },
      },
    })) || 0;

  const lastMonthVolume =
    (await Transaction.sum("amount", {
      where: {
        userId,
        status: "completed",
        createdAt: { [Op.between]: [startOfLastMonth, endOfLastMonth] },
      },
    })) || 0;

  const monthlyGrowth = currentMonthVolume - lastMonthVolume;

  const calcChange = (curr, prev) => {
    if (!prev || prev === 0) return curr > 0 ? "+100%" : "0%";
    const change = ((curr - prev) / prev) * 100;
    return `${change >= 0 ? "+" : ""}${change.toFixed(1)}%`;
  };

  const formatCurrency = (amount, type = "NG") =>
    `${type === "NG" ? "₦" : "$"}${Number(amount).toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;

  const stats = [
    { title: "Total Assets", value: formatCurrency(walletData.totalBalance) },
    { title: "Crypto Holdings", value: formatCurrency(walletData.cryptoBalance) },
    { title: "Gift Card Balance", value: formatCurrency(walletData.giftCardBalance) },
    { title: "VTU Wallet Balance", value: formatCurrency(walletData.vtuBalance) },
    {
      title: "Monthly Growth",
      value: `${monthlyGrowth >= 0 ? "+" : ""}${formatCurrency(monthlyGrowth)}`,
      change: calcChange(currentMonthVolume, lastMonthVolume),
    },
  ];

  const recentVtuTransactions = await getRecentVtuTransactions(req);

  res.status(200).json({
    status: "success",
    data: { stats, recentVtuTransactions },
  });
});