const {
  Transaction,
  GiftcardTransaction,
  CoinTransaction,
  Giftcard,
  Coin,
  User,
  Wallet,
} = require("../models");
const { sequelize } = require("../models");
const catchAsync = require("../utils/catchAsync");
const AppError = require("../utils/appError");
const Email = require("../utils/email");
const generatePaginationMeta = require("./../utils/pagination");
const APIFeatures = require("../utils/apiFeatures");
const { handleCoinTransaction, handleGiftcardTransaction } = require("./../helpers/transactionHandlers");
const { Settings } = require('../models');

exports.createTransaction = catchAsync(async (req, res, next) => {
  const dbTransaction = await sequelize.transaction();
  try {
    const {
      assetType = "",
      assetId = "",
      transactionType = "",
      usdAmount = "",
      receivingAccount = null,
      cardNum = "",
      receivingWalletAddress = "",
    } = req.body || {};

    const userId = req.user.id;

    // Validate required fields
    const requiredFields = ["assetType", "assetId", "transactionType"];
    const missingFields = requiredFields.filter(
      (field) => !req.body || !req.body[field]
    );
    if (missingFields.length > 0) {
      await dbTransaction.rollback();
      return next(
        new AppError(
          `Missing required fields: ${missingFields.join(", ")}`,
          "",
          400
        )
      );
    }

    let assetData;
    if (assetType === "coin") {
      assetData = await handleCoinTransaction(assetId, usdAmount, transactionType, dbTransaction);
    } else if (assetType === "giftcard") {
      assetData = await handleGiftcardTransaction(assetId, usdAmount, transactionType, dbTransaction);
    } else {
      await dbTransaction.rollback();
      return next(
        new AppError("Asset type can either be giftcard or coin", "", 400)
      );
    }

    let paymentProof = null;
    let cardImage = null;

    // Handle file uploads
    if (req.files && (req.files?.paymentProof || req.files?.cardImage)) {
      if (
        transactionType === "buy" ||
        (assetType === "coin" && transactionType === "sell")
      ) {
        paymentProof = `${process.env.APP_URL}/img/paymentProofs/${req.files?.paymentProof?.[0].filename}`;
      }
      if (assetType === "giftcard" && transactionType === "sell") {
        cardImage = `${process.env.APP_URL}/img/cardImages/${req.files?.cardImage?.[0].filename}`;
      }
    }

    // 1. Create base transaction
    const baseTransaction = await Transaction.create(
      {
        userId,
        assetType,
        transactionType,
        usdAmount,
        amount: assetData.amount,
        assetRate: assetData.assetRate,
        description: assetData.description,
        paymentProof,
        receivingAccount,
        assetName: assetData.assetName,
        status: "pending",
      },
      { transaction: dbTransaction }
    );

    // 2. Create type-specific transaction
    if (assetType === "giftcard") {
      await GiftcardTransaction.create(
        {
          transactionId: baseTransaction.id,
          transactionType,
          cardNum,
          cardImage,
        },
        { transaction: dbTransaction }
      );
    } else if (assetType === "coin") {
      await CoinTransaction.create(
        {
          transactionId: baseTransaction.id,
          transactionType,
          coinAmount: assetData.coinAmount,
          receivingWalletAddress,
        },
        { transaction: dbTransaction }
      );
    }

    await dbTransaction.commit();

    const completeTransaction = await Transaction.findByPk(baseTransaction.id, {
      include: [
        {
          model: assetType === "giftcard" ? GiftcardTransaction : CoinTransaction,
          as: assetType === "giftcard" ? "giftcardDetails" : "coinDetails",
        },
      ],
    });

    const transactionData = completeTransaction.get({ plain: true });
    transactionData.assetName = assetData.assetName;

    await new Email(req.user, null, transactionType).sendTransaction(transactionData);
    const admin = await Settings.findByPk(1)
    const adminInfo = {
      firstName: admin.platformName,
      email:admin.adminEmail,
    };
    const url = `${process.env.FRONTEND_URL}/admin/dashboard`;
    const adminData = {
      ...transactionData,
      user: req.user,
    };

    await new Email(adminInfo, url, transactionType).sendTransactionAdmin(adminData);

    res.status(201).json({
      status: "success",
      data: { transaction: completeTransaction },
    });
  } catch (error) {
    if (dbTransaction && !dbTransaction.finished) {
      await dbTransaction.rollback();
    }
    console.error("Error creating transaction:", error);
    return next(error);
  }
});

exports.updateTransactionStatus = catchAsync(async (req, res, next) => {
  const { action } = req.params; // 'approve' or 'decline'
  const transactionId = req.params.id;

  // Retrieve the transaction
  const transaction = await Transaction.findByPk(transactionId, {
    include: [
      {
        model: GiftcardTransaction,
        as: "giftcardDetails",
      },
      {
        model: CoinTransaction,
        as: "coinDetails",
      },
      {
        model: User,
        as: "user",
        attributes: ["firstName", "lastName", "email"],
      },
    ],
  });

  if (!transaction) {
    return next(new AppError("No transaction was found with that ID", "", 404));
  }

  // Get the user and wallet
  const user = await User.findByPk(transaction.userId);
  const wallet = await Wallet.findOne({
    where: { userId: transaction.userId },
  });

  if (!user || !wallet) {
    return next(new AppError("User or wallet not found", "", 404));
  }

  // Check already processed
  if (action === "approve" && transaction.status === "completed") {
    return next(new AppError("Transaction already approved!", "", 400));
  }
  if (action === "decline" && transaction.status === "failed") {
    return next(new AppError("Transaction already declined!", "", 400));
  }

  // Update balances and transaction status
  if (action === "approve") {
    if (transaction.assetType === "coin") {
      wallet.cryptoBalance += transaction.usdAmount;
      wallet.totalBalance += transaction.usdAmount
    } else if (transaction.assetType == "giftcard") {
      wallet.giftcardBalance += transaction.usdAmount;
      wallet.totalBalance += transaction.usdAmount
    }
    transaction.status = "completed";
  } else if (action === "decline") {
    // If already approved before and now declining, reverse the previous action
    if (transaction.status === "completed") {
      if (transaction.assetType === "coin") {
        wallet.cryptoBalance -= transaction.usdAmount;
        wallet.totalBalance -= transaction.usdAmount
      } else if (transaction.assetType === "giftcard") {
        wallet.giftcardBalance -= transaction.usdAmount;
        wallet.totalBalance -= transaction.usdAmount
      }
    }
    transaction.status = "failed";
  }

  // Save updates
  await wallet.save();
  await transaction.save();
  const url = `${process.env.FRONTEND_URL}/user/dashboard`;

  try {
    // Convert Sequelize instance to plain object
    const transactionData = transaction.get({ plain: true });
    await new Email(transactionData.user, url, null).sendTransaction(
      transactionData
    );
    res.status(200).json({
      status: "success",
      message: `Transaction ${action}d successfully!`,
      data: {
        transaction,
      },
    });
  } catch (error) {
    console.log("ERROR!!", error);

    return next(
      new AppError(
        "There was a problem sending the email. Please try again later!",
        "",
        500
      )
    );
  }
});

exports.getRecentTransactions = catchAsync(async (req, res, next) => {
  req.query.limit = 5;
  req.query.sort = "-createdAt";
  req.query.fields =
    "usdAmount,amount,description,flowType,assetType,transactionType,createdAt";
  // Calculate date 7 days ago
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  // Format date in ISO format (YYYY-MM-DD) for the filter
  const formattedDate = sevenDaysAgo.toISOString();
  // Add createdAt filter for the last 7 days using gte operator
  req.query.createdAt = { gte: formattedDate };
  const features = new APIFeatures(req.query, "Transaction")
    .filter()
    .sort()
    .limitFields()
    .paginate();
  features.queryOptions.include = [
    {
      model: User,
      as: "user",
      attributes: ["firstName", "lastName", "photo", "email"],
    },
  ];
  //Execute query
  const transactions = await Transaction.findAll(features.getFeaures());
  //Send Response
  res.status(200).json({
    status: "success",
    result: transactions.length,
    data: {
      transactions,
    },
  });
});

exports.getPendingTransactions = catchAsync(async (req, res, next) => {
  req.query.limit = 5;
  req.query.sort = "-createdAt";
  req.query.fields =
    "usdAmount,amount,description,flowType,assetType,transactionType,createdAt";
  req.query.status = "pending";
  const features = new APIFeatures(req.query, "Transaction")
    .filter()
    .sort()
    .limitFields()
    .paginate();
  features.queryOptions.include = [
    {
      model: User,
      as: "user",
      attributes: ["firstName", "lastName", "photo", "email"],
    },
  ];
  //Execute query
  const transactions = await Transaction.findAll(features.getFeaures());
  //Send Response
  res.status(200).json({
    status: "success",
    result: transactions.length,
    data: {
      transactions,
    },
  });
});

exports.getAllTransactions = catchAsync(async (req, res, next) => {
  const features = new APIFeatures(req.query, "Transaction")
    .filter()
    .sort()
    .limitFields()
    .paginate();
  //Include transaction related records
  features.queryOptions.include = [
    {
      model: GiftcardTransaction,
      as: "giftcardDetails",
    },
    {
      model: CoinTransaction,
      as: "coinDetails",
    },
  ];
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
  const { count, rows: completeTransactions } =
    await Transaction.findAndCountAll(features.getFeaures());
  const { page, limit } = features.getPaginationInfo();
  const pagination = generatePaginationMeta(req, page, limit, count);

  //Send Response
  res.status(200).json({
    status: "success",
    pagination,
    result: completeTransactions.length,
    data: {
      transactions: completeTransactions,
    },
  });
});


