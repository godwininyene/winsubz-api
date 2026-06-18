const catchAsync = require('./../utils/catchAsync');
const AppError = require('./../utils/appError');
const { User, Wallet, VirtualAccount, sequelize } = require('./../models');
const APIFeatures = require('../utils/apiFeatures');
const generatePaginationMeta = require('../utils/pagination');
const addTransactionAggregates = require('../utils/addTransactionAggregates');
const Email = require('../utils/email');
const filterBody = (obj, ...allowedFields) => {
  const newObj = {};
  if (obj) {
    Object.keys(obj).forEach(el => {
      if (allowedFields.includes(el)) newObj[el] = obj[el];
    });
  }

  return newObj;
}

exports.updateMe = catchAsync(async (req, res, next) => {
  // 1. Raise error if user try to POST password
  if (req.body?.password || req.body?.passwordConfirm) {
    return next(new AppError('This route is not for password updates. Please use /updateMyPassword route!', '', 400));
  }

  // 2. Filter out unwanted fields and only allow specific updates
  const allowedFields = ['firstName', 'lastName', 'email', 'phone', 'photo'];
  const filteredBody = filterBody(req.body, ...allowedFields);

  // 3. Handle file upload if present
  if (req.file) {
    filteredBody.photo = `${process.env.APP_URL}/img/users/${req.file.filename}`;
  }

  // 4. Update user document
  const user = await User.findByPk(req.user.id);
  if (!user) {
    return next(new AppError("User not found", "", 404))
  }
  await user.update(filteredBody, { validate: true })

  res.status(200).json({
    status: "success",
    data: {
      user
    }
  })
})

exports.deleteUser = catchAsync(async (req, res, next) => {
  const deletedCount = await User.destroy({
    where: { id: req.params.id }
  });

  if (deletedCount === 0) {
    return next(new AppError("No user found with that ID", '', 404))
  }

  res.status(204).json({
    status: "success",
    data: null,
  });
})

exports.getAllUsers = catchAsync(async (req, res, next) => {
  // 1. Capture and isolate your custom relationship filters from the raw query
  const targetStatus = req.query.status;

  // If it's one of our relational filters, remove it so APIFeatures doesn't parse it as a user table column string
  if (targetStatus === "no_reserved_account" || targetStatus === "has_reserved_account") {
    delete req.query.status;
  }

  // 2. Initialize your regular API features pipeline
  const features = new APIFeatures(req.query, 'User').filter().sort().limitFields().paginate();

  features.queryOptions.where = {
    ...features.queryOptions.where,
    role: 'user'  // Ensure only regular users are shown to admin
  };

  // 3. Apply the Relationship Join Logic dynamically based on what was selected
  if (targetStatus === "no_reserved_account") {
    features.queryOptions.include = [
      ...(features.queryOptions.include || []),
      {
        model: VirtualAccount,
        as: 'virtualAccount',
        attributes: ['id'], // Keep payload lightweight
        required: false     // Enforces a LEFT OUTER JOIN
      }
    ];
    // Filter out users where the relation ID doesn't exist
    features.queryOptions.where['$virtualAccount.id$'] = null;

  } else if (targetStatus === "has_reserved_account") {
    features.queryOptions.include = [
      ...(features.queryOptions.include || []),
      {
        model: VirtualAccount,
        as: 'virtualAccount',
        attributes: ['id'],
        required: true      // Enforces an INNER JOIN (Must have account)
      }
    ];
  }

  // Add transaction aggregates
  addTransactionAggregates(features.queryOptions);

  const { count, rows: users } = await User.findAndCountAll(features.getFeaures());
  const { page, limit } = features.getPaginationInfo();
  const pagination = generatePaginationMeta(req, page, limit, count);

  res.status(200).json({
    status: "success",
    pagination,
    result: users.length,
    data: {
      users
    }
  });
});




// exports.getAllUsers = catchAsync(async(req, res, next)=>{
//     const features = new APIFeatures(req.query, 'User').filter().sort().limitFields().paginate()

//     features.queryOptions.where = {
//         ...features.queryOptions.where,
//         role: 'user'  // Ensure only regular users are shown to admin
//     };

//     // Add transaction aggregates
//     addTransactionAggregates(features.queryOptions)

//     const {count, rows:users} = await User.findAndCountAll(features.getFeaures());
//     const{page, limit} = features.getPaginationInfo()
//     const pagination = generatePaginationMeta(req, page, limit, count);

//     res.status(200).json({
//         status:"success",
//         pagination,
//         result:users.length,
//         data:{
//             users
//         }
//     })
// });


exports.getMe = (req, res, next) => {
  req.params.id = req.user.id;
  next();
}
exports.getUser = catchAsync(async (req, res, next) => {
  const user = await User.findByPk(req.params.id);
  if (!user) {
    return next(new AppError('No user was found with that ID', '', 404))
  }

  res.status(200).json({
    status: "success",
    data: {
      user
    }
  })
})

const updateApprovalStatus = async (user, newStatus) => {
  if (newStatus === 'approve' && user.status === 'active') {
    throw new AppError("User account already approved!", '', 400);
  }
  if (newStatus === 'deny' && user.status === 'denied') {
    throw new AppError("User account approval already denied!", '', 400);
  }
  if (newStatus === 'deactivate' && user.status === 'deactivated') {
    throw new AppError("User account already deactivated!", '', 400);
  }

  if (newStatus === 'deny') {
    user.status = 'denied'
  }
  if (newStatus === 'approve') {
    user.status = 'active'
  }

  if (newStatus === 'deactivate') {
    user.status = 'deactivated'
  }

  await user.save({ validate: false });
  return user;
}
exports.updateStatus = catchAsync(async (req, res, next) => {
  const { status } = req.body;
  let type;

  const user = await User.findByPk(req.params.id);

  if (!user) {
    return next(new AppError('No user found with that ID', '', 404));
  }

  const url = `${req.get('referer')}manage/investor/dashboard`;

  if (status === 'approve') type = 'account_approved';
  if (status === 'deny') type = 'account_denied';
  if (status === 'deactivate') type = 'account_deactivated';

  try {
    const updatedUser = await updateApprovalStatus(user, status);
    await new Email(user, url, type).sendOnBoard();
    res.status(200).json({
      status: 'success',
      data: {
        user: updatedUser,
      },
    });
    console.log('Email sent');

  } catch (error) {
    return next(
      new AppError('There was a problem sending the email. Please try again later!', '', 500)
    );
  }
});

exports.getMyReferrals = catchAsync(async (req, res, next) => {
  const userId = req.user.id;

  const [referrals, wallet] = await Promise.all([
    User.findAll({
      where: { referralId: req.user.accountId },
      attributes: ["firstName", "lastName", "photo", "createdAt"],
      order: [["createdAt", "DESC"]],
    }),

    Wallet.findOne({
      where: { userId },
      attributes: ["referralBalance"],
    }),
  ]);

  res.status(200).json({
    status: "success",
    data: {
      total: referrals.length,
      referralBalance: wallet?.referralBalance || 0,
      referrals,
    },
  });
});



exports.withdrawReferralBalance = catchAsync(async (req, res, next) => {
  const { amount } = req.body;
  const userId = req.user.id;

  // 🔒 1. Validate amount
  const withdrawalAmount = Number(amount);

  if (!withdrawalAmount || withdrawalAmount <= 0) {
    return next(new AppError("Please provide a valid withdrawal amount", '', 400));
  }

  // Optional: enforce minimum withdrawal
  // if (withdrawalAmount < 100) {
  //   return next(new AppError("Minimum withdrawal is ₦100", 400));
  // }

  // 🔥 Use transaction for safety
  const result = await sequelize.transaction(async (t) => {
    // 🔍 2. Get wallet
    const wallet = await Wallet.findOne({
      where: { userId },
      transaction: t,
      lock: t.LOCK.UPDATE, // 🔒 prevents race condition
    });

    if (!wallet) {
      throw new AppError("Wallet not found", 404);
    }

    // ❌ 3. Check balance
    if (wallet.referralBalance < withdrawalAmount) {
      throw new AppError("Insufficient referral balance", '', 400);
    }

    // 🔄 4. Move funds
    wallet.referralBalance -= withdrawalAmount;
    wallet.vtuBalance += withdrawalAmount;

    await wallet.save({ transaction: t });

    return wallet;
  });

  res.status(200).json({
    status: "success",
    message: "Referral earnings successfully moved to VTU balance",
    data: {
      referralBalance: result.referralBalance,
      vtuBalance: result.vtuBalance,
    },
  });
});