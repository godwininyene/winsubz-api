const { Wallet, User, Transaction, Funding, sequelize, VTUTransaction, SmmTransaction, Settings } = require("../models");
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
    "providerRef,serviceName,faceValue,sellingPrice,type,status,beneficiary,planLabel,createdAt";
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
 * Get recent SMM transactions (last 7 days)
 * Used on Admin dashboard
 * =========================================================
 */
const getRecentSmmTransactions = async (req) => {
  req.query.limit = 5;
  req.query.sort = "-createdAt";
  req.query.fields =
    "id,platform,serviceName,link,quantity,costPrice,sellingPrice,status,startCount,remains,requestId,createdAt";

  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const formattedDate = sevenDaysAgo.toISOString();
  req.query.createdAt = { gte: formattedDate };

  const features = new APIFeatures(req.query, "SmmTransaction")
    .filter()
    .sort()
    .limitFields()
    .paginate();

  // Restrict transactions for regular users to only their own
  if (req.user?.role === "user") {
    features.queryOptions.where = {
      ...features.queryOptions.where,
      userId: req.user.id,
    };
  }

  // Include user info block if administrative access flag is contextually present
  if (req.user?.role === "admin") {
    features.queryOptions.include.push({
      model: User,
      as: "user",
      attributes: ["firstName", "lastName", "photo", "email"],
    });
  }

  const transactions = await SmmTransaction.findAll(features.getFeaures());
  return transactions;
};

/**
 * =========================================================
 * Get Stats For Admin Dashboard
 * Includes:
 * - Users
 * - Crypto volume
 * - Giftcard volume
 * - VTU volume
 * - VTU profit
 * - Outstanding VTU Balance (NEW)
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
   * Helper: fetch stats within a date range.
   * Pass { startDate: null, endDate: null } to get ALL-TIME totals
   * (no date restriction at all).
   */
  const getStats = async (startDate, endDate) => {
    const dateFilter = startDate && endDate ? { [Op.between]: [startDate, endDate] } : undefined;

    // Count active users (excluding admins)
    const userWhere = {
      role: { [Op.ne]: "admin" },
      active: true,
    };
    if (dateFilter) userWhere.createdAt = dateFilter;

    const userCount = await User.count({ where: userWhere });

    // Aggregate crypto & giftcard transactions
    const transactionInclude = {
      model: Transaction,
      as: "transactions",
      attributes: [],
      where: { status: "completed" },
      required: false,
    };
    if (dateFilter) transactionInclude.where.createdAt = dateFilter;

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
      include: [transactionInclude],
      where: { role: { [Op.ne]: "admin" }, active: true },
      raw: true,
    }).then((res) => res[0]);

    // Aggregate VTU stats
    const vtuWhere = { status: "success" };
    if (dateFilter) vtuWhere.createdAt = dateFilter;

    const vtuStats = await VTUTransaction.findOne({
      attributes: [
        [fn("COALESCE", fn("SUM", col("sellingPrice")), 0), "vtuVolume"],
        [fn("COUNT", col("id")), "vtuCount"],
        [
          fn("COALESCE", fn("SUM", literal("`sellingPrice` - `amountPaid`")), 0),
          "vtuProfit",
        ],
      ],
      where: vtuWhere,
      raw: true,
    });

    // ==========================================
    // DYNAMIC DEPOSITS COMPILATION
    // ==========================================
    const fundingWhere = { status: "success" };
    if (dateFilter) fundingWhere.createdAt = dateFilter;

    const fundingStats = await Funding.findOne({
      attributes: [
        [fn("COALESCE", fn("SUM", col("amount")), 0), "totalDeposits"],
      ],
      where: fundingWhere,
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
      totalDeposits: Number(fundingStats?.totalDeposits || 0),
    };
  };

  // Fetch standard stats
  const currentStats = await getStats(startOfThisMonth, endOfToday);
  const prevStats = await getStats(startOfLastMonth, endOfLastMonth);
  const allTimeStats = await getStats(null, null);

  /**
    *Fetch Outstanding VTU Balance from Wallets
    * Queries User model first to easily filter active non-admins,
    * then joins their Wallet to sum the balances.
    */
  const vtuBalanceStats = await User.findOne({
    attributes: [
      [fn("COALESCE", fn("SUM", col("wallet.vtuBalance")), 0), "totalVtuBalance"],
    ],
    include: [{
      model: Wallet,
      as: "wallet", // Joins the associated Wallet model using its alias
      attributes: [],
    }],
    where: {
      role: { [Op.ne]: "admin" },
      active: true,
    },
    raw: true,
  });

  const totalVtuBalance = Number(vtuBalanceStats?.totalVtuBalance || 0);

  // ==========================================
  //Fetch Total Deposits from Funding Table
  // ==========================================
  const totalFundingStats = await Funding.findOne({
    attributes: [
      [fn("COALESCE", fn("SUM", col("amount")), 0), "totalDeposits"],
    ],
    where: { status: "success" },
    raw: true,
  });

  const totalDeposits = Number(totalFundingStats?.totalDeposits || 0);

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
      total: allTimeStats.totalUsers.toLocaleString(),
      currentValue: currentStats.totalUsers,
      preValue: prevStats.totalUsers,
      change: calcChange(currentStats.totalUsers, prevStats.totalUsers),
    },
    // {
    //   title: "Total Transactions",
    //   total: `₦${allTimeStats.totalTransactionVolume.toLocaleString()}`,
    //   currentValue: `₦${currentStats.totalTransactionVolume.toLocaleString()}`,
    //   preValue: `₦${prevStats.totalTransactionVolume.toLocaleString()}`,
    //   change: calcChange(currentStats.totalTransactionVolume, prevStats.totalTransactionVolume),
    // },
    {
      title: "Total Deposits",
      total: `₦${allTimeStats.totalDeposits.toLocaleString()}`,
      currentValue: `₦${currentStats.totalDeposits.toLocaleString()}`,
      preValue: `₦${prevStats.totalDeposits.toLocaleString()}`,
      change: calcChange(currentStats.totalDeposits, prevStats.totalDeposits),
    },
    {
      title: "VTU Volume",
      total: `₦${allTimeStats.vtuVolume.toLocaleString()}`,
      currentValue: `₦${currentStats.vtuVolume.toLocaleString()}`,
      preValue: `₦${prevStats.vtuVolume.toLocaleString()}`,
      change: calcChange(currentStats.vtuVolume, prevStats.vtuVolume),
    },
    {
      title: "VTU Profit",
      total: `₦${allTimeStats.vtuProfit.toLocaleString()}`,
      currentValue: `₦${currentStats.vtuProfit.toLocaleString()}`,
      preValue: `₦${prevStats.vtuProfit.toLocaleString()}`,
      change: calcChange(currentStats.vtuProfit, prevStats.vtuProfit),
    },
    // User VTU Balance snapshot (doesn't need MoM change metrics)
    {
      title: "Users VTU Balance",
      total: `₦${totalVtuBalance.toLocaleString()}`,
      currentValue: `₦${totalVtuBalance.toLocaleString()}`,
      preValue: "N/A",
      change: "0%",
    },
    {
      title: "Gift Card Volume",
      total: `₦${allTimeStats.giftcardVolume.toLocaleString()}`,
      currentValue: `₦${currentStats.giftcardVolume.toLocaleString()}`,
      preValue: `₦${prevStats.giftcardVolume.toLocaleString()}`,
      change: calcChange(currentStats.giftcardVolume, prevStats.giftcardVolume),
    },
    {
      title: "Crypto Volume",
      total: `₦${allTimeStats.coinVolume.toLocaleString()}`,
      currentValue: `₦${currentStats.coinVolume.toLocaleString()}`,
      preValue: `₦${prevStats.coinVolume.toLocaleString()}`,
      change: calcChange(currentStats.coinVolume, prevStats.coinVolume),
    },
  ];


  // Fetch recent records for both models in parallel
  const [recentVtuTransactions, recentSmmTransactions] = await Promise.all([
    getRecentVtuTransactions(req),
    getRecentSmmTransactions(req)
  ]);

  res.status(200).json({
    status: "success",
    data: {
      stats: response,
      recentVtuTransactions,
      recentSmmTransactions
    },
  });
});

/**
 * =========================================================
 * Get chart data for Admin dashboard
 * (Crypto + Giftcards + Successful Deposits Trend)
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

  // =========================================================
  //Successful deposits trend over time
  // =========================================================
  const depositTrend = await Funding.findAll({
    attributes: [
      [fn("DATE", col("createdAt")), "date"],
      [fn("COALESCE", fn("SUM", col("amount")), 0), "totalAmount"],
      [fn("COUNT", col("id")), "depositCount"],
    ],
    where: {
      status: "success",
      createdAt: { [Op.between]: [startDate, endDate] },
    },
    group: [fn("DATE", col("createdAt"))],
    order: [[fn("DATE", col("createdAt")), "ASC"]],
    raw: true,
  });

  res.status(200).json({
    status: "success",
    data: {
      transactionVolume,
      userGrowth,
      transactionTypes,
      depositTrend
    },
  });
});


/**
 * Helper function to calculate date ranges for current and previous periods
 */
const getDateRanges = (period) => {
  const now = new Date();
  let currentStart, currentEnd, prevStart, prevEnd;

  switch (period.toLowerCase()) {
    case "today": {
      currentStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
      currentEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

      // Previous period = Yesterday
      prevStart = new Date(currentStart);
      prevStart.setDate(prevStart.getDate() - 1);
      prevEnd = new Date(currentStart);
      prevEnd.setMilliseconds(-1);
      break;
    }
    case "7days": {
      currentEnd = new Date(now);
      currentStart = new Date(now);
      currentStart.setDate(now.getDate() - 7);
      currentStart.setHours(0, 0, 0, 0);

      // Previous period = 7 to 14 days ago
      prevEnd = new Date(currentStart);
      prevEnd.setMilliseconds(-1);
      prevStart = new Date(currentStart);
      prevStart.setDate(prevStart.getDate() - 7);
      break;
    }
    case "30days": {
      currentEnd = new Date(now);
      currentStart = new Date(now);
      currentStart.setDate(now.getDate() - 30);
      currentStart.setHours(0, 0, 0, 0);

      // Previous period = 30 to 60 days ago
      prevEnd = new Date(currentStart);
      prevEnd.setMilliseconds(-1);
      prevStart = new Date(currentStart);
      prevStart.setDate(prevStart.getDate() - 30);
      break;
    }
    case "alltime":
    default:
      currentStart = null;
      currentEnd = null;
      prevStart = null;
      prevEnd = null;
      break;
  }

  return { currentStart, currentEnd, prevStart, prevEnd };
};

/**
 * Helper function to fetch stats for a given date range
 */
const fetchStatsForRange = async (startDate, endDate, Op, fn, col, literal, VTUTransaction) => {
  const dateFilter = startDate && endDate ? { [Op.between]: [startDate, endDate] } : undefined;

  // 1. Calculate Successful Volume & Profit
  const successWhere = { status: "success" };
  if (dateFilter) successWhere.createdAt = dateFilter;

  const successStats = await VTUTransaction.findOne({
    attributes: [
      [fn("COALESCE", fn("SUM", col("sellingPrice")), 0), "volume"],
      [fn("COALESCE", fn("SUM", literal("`sellingPrice` - `amountPaid`")), 0), "profit"],
    ],
    where: successWhere,
    raw: true,
  });

  // 2. Count statuses (total, successful, failed, reversed)
  const statusWhere = {};
  if (dateFilter) statusWhere.createdAt = dateFilter;

  const statusCounts = await VTUTransaction.findAll({
    attributes: ["status", [fn("COUNT", col("id")), "count"]],
    where: statusWhere,
    group: ["status"],
    raw: true,
  });

  let total = 0;
  let successful = 0;
  let failed = 0;
  let reversed = 0;

  statusCounts.forEach((item) => {
    const count = Number(item.count || 0);
    total += count;

    const status = item.status ? item.status.toLowerCase() : "";
    if (status === "success" || status === "successful") successful += count;
    else if (status === "failed") failed += count;
    else if (status === "reversed" || status === "refunded") reversed += count;
  });

  const volume = Number(successStats?.volume || 0);
  const profit = Number(successStats?.profit || 0);

  // Derived KPIs
  const successRate = total > 0 ? Number(((successful / total) * 100).toFixed(1)) : 0;
  const avgTransactionValue = successful > 0 ? Number((volume / successful).toFixed(2)) : 0;
  const avgProfitPerTransaction = successful > 0 ? Number((profit / successful).toFixed(2)) : 0;

  return {
    volume,
    profit,
    total,
    successful,
    failed,
    reversed,
    successRate,
    avgTransactionValue,
    avgProfitPerTransaction,
  };
};

/**
 * Calculate percentage change: ((current - previous) / previous) * 100
 */
/**
 * Calculate percentage change formatted as a string (+18.5% or -5.2%)
 */
const calcPercentageChange = (current, previous) => {
  if (previous === undefined || previous === null) return null;
  if (previous === 0) {
    if (current > 0) return "+100%";
    return "0%";
  }

  const change = ((current - previous) / previous) * 100;
  const formatted = change.toFixed(1);

  return change > 0 ? `+${formatted}%` : `${formatted}%`;
};

/**
 * For percentage point differences (like Success Rate change)
 */
const calcPointDifference = (current, previous) => {
  if (previous === undefined || previous === null) return null;
  const diff = Number((current - previous).toFixed(1));
  return diff > 0 ? `+${diff}%` : `${diff}%`;
};
exports.getAdminVtuStats = catchAsync(async (req, res, next) => {
  const { period = "today" } = req.query;

  const { currentStart, currentEnd, prevStart, prevEnd } = getDateRanges(period);

  // Fetch current period stats
  const currentStats = await fetchStatsForRange(
    currentStart,
    currentEnd,
    Op,
    fn,
    col,
    literal,
    VTUTransaction
  );

  // If period is not "alltime", calculate comparison with previous period
  let comparison = null;

  if (period.toLowerCase() !== "alltime" && prevStart && prevEnd) {
    const prevStats = await fetchStatsForRange(
      prevStart,
      prevEnd,
      Op,
      fn,
      col,
      literal,
      VTUTransaction
    );

    comparison = {
      volumeChange: calcPercentageChange(currentStats.volume, prevStats.volume),
      profitChange: calcPercentageChange(currentStats.profit, prevStats.profit),
      totalTransactionsChange: calcPercentageChange(currentStats.total, prevStats.total),
      successfulChange: calcPercentageChange(currentStats.successful, prevStats.successful),
      successRateChange: calcPointDifference(currentStats.successRate, prevStats.successRate),
    };
  }

  res.status(200).json({
    status: "success",
    data: {
      metrics: currentStats,
      comparison, // Null for 'alltime', object containing percentage changes otherwise
    },
  });
});

/**
 * =========================================================
 * Get Leaderboard (Top Customers)
 * Supports filter: week | month | year (default: month)
 * Ranked by transaction volume (sellingPrice), with
 * profit and transaction count also returned.
 *
 * minTransactions, winnersCount, and limit default to
 * whatever is configured in Settings, so the admin can
 * change reward rules without a redeploy. Query params
 * still override, if explicitly passed.
 * =========================================================
 */
exports.getLeaderboard = catchAsync(async (req, res, next) => {
  const { period = "month" } = req.query;
  const now = new Date();

  const settings = (await Settings.findByPk(1)) || {};

  const limit = req.query.limit ? Number(req.query.limit) : (settings.leaderboardLimit ?? 10);
  const minTransactions = req.query.minTransactions
    ? Number(req.query.minTransactions)
    : (settings.minTransactions ?? 3);
  const winnersCount = req.query.winnersCount
    ? Number(req.query.winnersCount)
    : (settings.winnersCount ?? 3);

  // Parse "7,12,15" -> [7, 12, 15], ignoring blanks/whitespace
  const excludedUserIds = (settings.excludedUserIds || "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean)
    .map(Number);

  let startDate, endDate;

  if (period === "week") {
    const dayOfWeek = now.getDay();
    startDate = new Date(now);
    startDate.setDate(now.getDate() - dayOfWeek);
    startDate.setHours(0, 0, 0, 0);

    endDate = new Date(now);
    endDate.setDate(now.getDate() + (6 - dayOfWeek));
    endDate.setHours(23, 59, 59, 999);
  } else if (period === "year") {
    startDate = new Date(now.getFullYear(), 0, 1);
    endDate = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999);
  } else {
    startDate = new Date(now.getFullYear(), now.getMonth(), 1);
    endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
  }

  const whereClause = {
    status: "success",
    createdAt: { [Op.between]: [startDate, endDate] },
  };

  if (excludedUserIds.length) {
    whereClause.userId = { [Op.notIn]: excludedUserIds };
  }

  const leaderboard = await VTUTransaction.findAll({
    attributes: [
      "userId",
      [fn("COALESCE", fn("SUM", col("sellingPrice")), 0), "volume"],
      [fn("COALESCE", fn("SUM", col("profit")), 0), "profitGenerated"],
      [fn("COUNT", col("VTUTransaction.id")), "transactionsCount"],
    ],
    include: [
      {
        model: User,
        as: "user",
        attributes: ["firstName", "lastName", "email"],
      },
    ],
    where: whereClause,
    group: ["userId", "user.id"],
    having: literal(`COUNT(\`VTUTransaction\`.\`id\`) >= ${minTransactions}`),
    order: [[literal("volume"), "DESC"]],
    limit,
    subQuery: false,
  });

  const formatted = leaderboard.map((row, index) => {
    const plain = row.get({ plain: true });
    return {
      rank: index + 1,
      isWinner: index < winnersCount,
      userId: plain.userId,
      name: `${plain.user?.firstName || ""} ${plain.user?.lastName || ""}`.trim(),
      email: plain.user?.email || null,
      volume: Number(plain.volume || 0),
      profitGenerated: Number(plain.profitGenerated || 0),
      transactionsCount: Number(plain.transactionsCount || 0),
    };
  });

  res.status(200).json({
    status: "success",
    period,
    minTransactions,
    winnersCount,
    results: formatted.length,
    data: { leaderboard: formatted },
  });
});


/**
 * =========================================================
 * Get Leaderboard (User-Facing)
 * Privacy-safe version for the logged-in user's dashboard:
 *  - Top winners shown with masked names (first name + last
 *    initial), NO email, NO exact profit figures.
 *  - The logged-in user's own rank/volume/count is returned
 *    separately and privately — visible only to them,
 *    regardless of whether they're in the top winners or not.
 *
 * Supports filter: week | month | year (default: month)
 * =========================================================
 */
exports.getUserLeaderboard = catchAsync(async (req, res, next) => {
  const { period = "month" } = req.query;
  const userId = req.user.id;
  const now = new Date();

  const settings = (await Settings.findByPk(1)) || {};
  const minTransactions = settings.minTransactions ?? 3;
  const winnersCount = settings.winnersCount ?? 3;
  const excludedUserIds = (settings.excludedUserIds || "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean)
    .map(Number);

  let startDate, endDate;

  if (period === "week") {
    const dayOfWeek = now.getDay();
    startDate = new Date(now);
    startDate.setDate(now.getDate() - dayOfWeek);
    startDate.setHours(0, 0, 0, 0);

    endDate = new Date(now);
    endDate.setDate(now.getDate() + (6 - dayOfWeek));
    endDate.setHours(23, 59, 59, 999);
  } else if (period === "year") {
    startDate = new Date(now.getFullYear(), 0, 1);
    endDate = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999);
  } else {
    startDate = new Date(now.getFullYear(), now.getMonth(), 1);
    endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
  }

  const whereClause = {
    status: "success",
    createdAt: { [Op.between]: [startDate, endDate] },
  };

  if (excludedUserIds.length) {
    whereClause.userId = { [Op.notIn]: excludedUserIds };
  }

  // Full ranking (no limit) — needed to find the current user's
  // true rank even if they're outside the top winners.
  const allRanked = await VTUTransaction.findAll({
    attributes: [
      "userId",
      [fn("COALESCE", fn("SUM", col("sellingPrice")), 0), "volume"],
      [fn("COUNT", col("VTUTransaction.id")), "transactionsCount"],
    ],
    include: [
      {
        model: User,
        as: "user",
        attributes: ["firstName", "lastName"],
      },
    ],
    where: whereClause,
    group: ["userId", "user.id"],
    order: [[literal("volume"), "DESC"]],
    subQuery: false,
  });

  const plainRanked = allRanked.map((row) => row.get({ plain: true }));

  // Masked public list — top winners only, no email, no profit, name truncated
  const topWinners = plainRanked.slice(0, winnersCount).map((row, index) => ({
    rank: index + 1,
    name: `${row.user?.firstName || "User"} ${(row.user?.lastName || "").charAt(0)}${row.user?.lastName ? "." : ""}`,
    volume: Number(row.volume || 0),
  }));

  // Find the logged-in user's own standing, wherever they rank
  const myIndex = plainRanked.findIndex((row) => row.userId === userId);
  const myRow = myIndex !== -1 ? plainRanked[myIndex] : null;

  const myTransactionsCount = Number(myRow?.transactionsCount || 0);
  const qualifies = myTransactionsCount >= minTransactions;

  const currentUser = {
    rank: myIndex !== -1 ? myIndex + 1 : null,
    volume: Number(myRow?.volume || 0),
    transactionsCount: myTransactionsCount,
    qualifies,
    transactionsNeeded: qualifies ? 0 : Math.max(minTransactions - myTransactionsCount, 0),
    isWinner: myIndex !== -1 && myIndex < winnersCount,
  };

  res.status(200).json({
    status: "success",
    period,
    minTransactions,
    winnersCount,
    data: {
      topWinners,
      currentUser,
    },
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
    attributes: ["totalBalance", "cryptoBalance", "giftCardBalance", "vtuBalance", "referralBalance"],
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

  const totalReferrals = await User.count({
    where: {
      referralId: req.user.accountId
    }
  });

  const stats = [
    { title: "Total Assets", value: formatCurrency(walletData.totalBalance) },
    { title: "Crypto Holdings", value: formatCurrency(walletData.cryptoBalance) },
    { title: "Gift Card Balance", value: formatCurrency(walletData.giftCardBalance) },
    { title: "VTU Wallet Balance", value: formatCurrency(walletData.vtuBalance) },
    {
      title: "Referral Earnings",
      value: formatCurrency(walletData.referralBalance || 0)
    },
    {
      title: "Total Referrals",
      value: totalReferrals.toLocaleString()
    },
    {
      title: "Monthly Growth",
      value: `${monthlyGrowth >= 0 ? "+" : ""}${formatCurrency(monthlyGrowth)}`,
      change: calcChange(currentMonthVolume, lastMonthVolume),
    },
  ];

  // Fetch recent records for both models in parallel
  const [recentVtuTransactions, recentSmmTransactions] = await Promise.all([
    getRecentVtuTransactions(req),
    getRecentSmmTransactions(req)
  ]);

  res.status(200).json({
    status: "success",
    data: {
      stats,
      recentVtuTransactions,
      recentSmmTransactions
    },
  });

});