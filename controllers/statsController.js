const { Wallet, User, Transaction, sequelize } = require("../models");
const catchAsync = require("../utils/catchAsync");
const { Op, fn, col, literal } = require("sequelize");

//Get StatsForAdmin
exports.getStatsForAdmin = catchAsync(async (req, res, next) => {
  const now = new Date();

  // Define two time ranges
  const startOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const endOfToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    23,
    59,
    59,
    999
  );
  const startOfLastMonth = new Date(
    now.getFullYear(), // 1) the current year, e.g. 2025
    now.getMonth() - 1, // 2) one month before the current month (0-based!)
    1 // 3) the first day of that month
  );

  const endOfLastMonth = new Date(
    now.getFullYear(),
    now.getMonth(),
    0,
    23,
    59,
    59,
    999
  );

  // Helper function to get stats for a given range
  const getStats = async (startDate, endDate) => {
    // Get user count separately based on creation date
    const userCount = await User.count({
      where: {
        role: { [Op.ne]: "admin" },
        active: true,
        createdAt: {
          [Op.between]: [startDate, endDate],
        },
      },
    });

    // Get transaction stats for the date range
    const transactionStats = await User.findAll({
      attributes: [
        [
          fn("COALESCE", fn("SUM", col("transactions.amount")), 0),
          "totalTransactionVolume",
        ],
        [
          fn(
            "COALESCE",
            fn(
              "SUM",
              literal(
                "CASE WHEN `transactions`.`assetType` = 'giftcard' THEN `transactions`.`amount` ELSE 0 END"
              )
            ),
            0
          ),
          "giftcardVolume",
        ],
        [
          fn(
            "COALESCE",
            fn(
              "SUM",
              literal(
                "CASE WHEN `transactions`.`assetType` = 'coin' THEN `transactions`.`amount` ELSE 0 END"
              )
            ),
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
            createdAt: {
              [Op.between]: [startDate, endDate],
            },
            status:'completed'
          },
          required: false,
        },
      ],
      where: { role: { [Op.ne]: "admin" }, active: true },
      raw: true,
    }).then((res) => res[0]);

    return {
      totalUsers: userCount,
      totalTransactionVolume: transactionStats.totalTransactionVolume,
      giftcardVolume: transactionStats.giftcardVolume,
      coinVolume: transactionStats.coinVolume,
    };
  };

  const currentStats = await getStats(startOfThisMonth, endOfToday);
  const prevStats = await getStats(startOfLastMonth, endOfLastMonth);

  // Utility to calc % change
  const calcChange = (curr, prev) => {
    if (!prev || prev == 0) return curr > 0 ? "100%" : "0%";
    return (((curr - prev) / prev) * 100).toFixed(1) + "%";
  };

  // Convert null values to 0
  const safeCurrentStats = {
    totalUsers: parseInt(currentStats.totalUsers) || 0,
    totalTransactionVolume: parseInt(currentStats.totalTransactionVolume) || 0,
    giftcardVolume: parseInt(currentStats.giftcardVolume) || 0,
    coinVolume: parseInt(currentStats.coinVolume) || 0,
  };

  const safePrevStats = {
    totalUsers: parseInt(prevStats.totalUsers) || 0,
    totalTransactionVolume: parseInt(prevStats.totalTransactionVolume) || 0,
    giftcardVolume: parseInt(prevStats.giftcardVolume) || 0,
    coinVolume: parseInt(prevStats.coinVolume) || 0,
  };

  const response = [
    {
      title: "Total Users",
      total: (
        safeCurrentStats.totalUsers + safePrevStats.totalUsers
      ).toLocaleString(),
      currentValue: safeCurrentStats.totalUsers,
      preValue: safePrevStats.totalUsers,
      change: calcChange(safeCurrentStats.totalUsers, safePrevStats.totalUsers),
    },
    {
      title: "Total Transactions",
      total: `₦${(
        safeCurrentStats.totalTransactionVolume +
        safePrevStats.totalTransactionVolume
      ).toLocaleString()}`,
      currentValue: `₦${safeCurrentStats.totalTransactionVolume.toLocaleString()}`,
      preValue: `₦${safePrevStats.totalTransactionVolume.toLocaleString()}`,
      change: calcChange(
        safeCurrentStats.totalTransactionVolume,
        safePrevStats.totalTransactionVolume
      ),
    },
    {
      title: "Gift Card Volume",
      total: `₦${(
        safeCurrentStats.giftcardVolume + safePrevStats.giftcardVolume
      ).toLocaleString()}`,
      currentValue: `₦${safeCurrentStats.giftcardVolume.toLocaleString()}`,
      preValue: `₦${safePrevStats.giftcardVolume.toLocaleString()}`,
      change: calcChange(
        safeCurrentStats.giftcardVolume,
        safePrevStats.giftcardVolume
      ),
    },
    {
      title: "Crypto Volume",
      total: `₦${(
        safeCurrentStats.coinVolume + safePrevStats.coinVolume
      ).toLocaleString()}`,
      currentValue: `₦${safeCurrentStats.coinVolume.toLocaleString()}`,
      preValue: `₦${safePrevStats.coinVolume.toLocaleString()}`,
      change: calcChange(safeCurrentStats.coinVolume, safePrevStats.coinVolume),
    },
  ];

  res.status(200).json({
    status: "success",
    data: { stats: response },
  });
});

//Get chart Data from Admin
exports.getAdminChartData = catchAsync(async (req, res, next) => {
  const { period } = req.query; // 'monthly', 'weekly', 'daily'
  const now = new Date();

  let startDate, endDate;

  // Calculate date range based on period
  if (period === "yearly") {
    startDate = new Date(now.getFullYear(), 0, 1);
    endDate = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999);
  } else if (period === "monthly") {
    startDate = new Date(now.getFullYear(), now.getMonth(), 1);
    endDate = new Date(
      now.getFullYear(),
      now.getMonth() + 1,
      0,
      23,
      59,
      59,
      999
    );
  } else {
    // weekly
    const dayOfWeek = now.getDay();
    startDate = new Date(now);
    startDate.setDate(now.getDate() - dayOfWeek);
    endDate = new Date(now);
    endDate.setDate(now.getDate() + (6 - dayOfWeek));
    endDate.setHours(23, 59, 59, 999);
  }

  // Get transaction volume by month/week/day
  const transactionVolume = await Transaction.findAll({
    attributes: [
      [fn("DATE", col("createdAt")), "date"],
      [fn("SUM", col("amount")), "totalAmount"],
      [fn("COUNT", col("id")), "transactionCount"],
    ],
    where: {
      createdAt: {
        [Op.between]: [startDate, endDate],
      },
    },
    group: [fn("DATE", col("createdAt"))],
    order: [[fn("DATE", col("createdAt")), "ASC"]],
    raw: true,
  });

  // Get user growth data
  const userGrowth = await User.findAll({
    attributes: [
      [fn("DATE", col("createdAt")), "date"],
      [fn("COUNT", col("id")), "newUsers"],
    ],
    where: {
      createdAt: {
        [Op.between]: [startDate, endDate],
      },
      role: { [Op.ne]: "admin" },
    },
    group: [fn("DATE", col("createdAt"))],
    order: [[fn("DATE", col("createdAt")), "ASC"]],
    raw: true,
  });

  // Get transaction type distribution
  const transactionTypes = await Transaction.findAll({
    attributes: [
      "assetType",
      "transactionType",
      [fn("COUNT", col("id")), "count"],
      [fn("SUM", col("amount")), "totalAmount"],
    ],
    where: {
      createdAt: {
        [Op.between]: [startDate, endDate],
      },
    },
    group: ["assetType", "transactionType"],
    raw: true,
  });

  res.status(200).json({
    status: "success",
    data: {
      transactionVolume,
      userGrowth,
      transactionTypes,
    },
  });
});

// Get Stats For User
exports.getStatsForUser = catchAsync(async (req, res, next) => {
  const userId = req.user.id;
  const now = new Date();

  // Define date ranges for current and previous month
  const startOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const endOfToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    23,
    59,
    59,
    999
  );

  const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const endOfLastMonth = new Date(
    now.getFullYear(),
    now.getMonth(),
    0,
    23,
    59,
    59,
    999
  );

  // Get current wallet balances and convert to plain object
  const wallet = await Wallet.findOne({
    where: { userId },
    attributes: ["totalBalance", "cryptoBalance", "giftCardBalance"],
  });

  // Convert Sequelize instance to plain JavaScript object
  const walletData = wallet
    ? wallet.get({ plain: true })
    : {
        totalBalance: 0,
        cryptoBalance: 0,
        giftCardBalance: 0,
      };

  // Get transaction volume for growth calculation - ONLY COMPLETED TRANSACTIONS
  const currentMonthVolume =
    (await Transaction.sum("amount", {
      where: {
        userId,
        status: "completed", // Only include completed transactions
        createdAt: {
          [Op.between]: [startOfThisMonth, endOfToday],
        },
      },
    })) || 0;

  const lastMonthVolume =
    (await Transaction.sum("amount", {
      where: {
        userId,
        status: "completed", // Only include completed transactions
        createdAt: {
          [Op.between]: [startOfLastMonth, endOfLastMonth],
        },
      },
    })) || 0;

  // console.log("CURRENT MONTH VOLUME (completed):", currentMonthVolume);
  // console.log("LAST MONTH VOLUME (completed):", lastMonthVolume);

  const monthlyGrowth = currentMonthVolume - lastMonthVolume;

  // Utility to calc % change for monthly growth only
  const calcChange = (curr, prev) => {
    if (!prev || prev == 0) return curr > 0 ? "+100%" : "0%";
    const change = ((curr - prev) / prev) * 100;
    return `${change >= 0 ? "+" : ""}${change.toFixed(1)}%`;
  };

  const formatCurrency = (amount) => {
    return `$${amount.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  };

  const stats = [
    {
      title: "Total Assets",
      value: formatCurrency(walletData.totalBalance || 0),
    },
    {
      title: "Crypto Holdings",
      value: formatCurrency(walletData.cryptoBalance || 0),
    },
    {
      title: "Gift Card Balance",
      value: formatCurrency(walletData.giftCardBalance || 0),
    },
    {
      title: "Monthly Growth",
      value: `${monthlyGrowth >= 0 ? "+" : ""}${formatCurrency(monthlyGrowth)}`,
      change: calcChange(currentMonthVolume, lastMonthVolume),
    },
  ];

  // console.log("FINAL STATS:", stats);

  res.status(200).json({
    status: "success",
    data: { stats },
  });
});
