const { User, Wallet, PromoCode, PromoUsage } = require("../models");
const AppError = require("../utils/appError");
const catchAsync = require("../utils/catchAsync");
const jwt = require("jsonwebtoken");
const { promisify } = require("util");
const Email = require("../utils/email");
const crypto = require('crypto')
const { Op } = require('sequelize');

const generateAccountId = async () => {
  let code;
  let exists = true;

  while (exists) {
    const num = Math.floor(100 + Math.random() * 900);
    code = `WS${num}`;   // WZ234
    exists = await User.findOne({ where: { accountId: code } });
  }

  return code;
};

const signToken = (user) => {
  return jwt.sign({ id: user.id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRESIN,
  });
};

const createSendToken = (user, statusCode, req, res) => {
  const token = signToken(user);
  const cookieOption = {
    expires: new Date(
      Date.now() + process.env.JWT_COOKIE_EXPIRESIN * 24 * 60 * 60 * 1000
    ),
    httpOnly: true,
    sameSite: "None",
  };

  // Set 'secure' flag in production or if the request is secure
  if (process.env.NODE_ENV === "production" || req.secure) {
    cookieOption.secure = true;
  }
  // Send the cookie
  res.cookie("jwt", token, cookieOption);
  // Remove password from the output
  user.password = undefined;
  user.passwordConfirm = undefined;
  // Send the response
  res.status(statusCode).json({
    status: "success",
    token,
    data: {
      user,
    },
  });
};

exports.signup = catchAsync(async (req, res, next) => {
  // 1. Create user
  const user = await User.create({
    firstName: req.body?.firstName,
    lastName: req.body?.lastName,
    email: req.body?.email,
    phone: req.body?.phone,
    password: req.body?.password,
    passwordConfirm: req.body?.passwordConfirm,
    referralId: req.body?.referralId,
    accountId: await generateAccountId(),
  });

  // 2. Create wallet
  await Wallet.create({ userId: user.id });

  // 3. Track promo code usage if one was supplied at signup.
  //    We only create the ledger entry here — no counter increment, no commission.
  //    The counter (currentUses) increments only when the user makes their first
  //    purchase, so maxUses represents paid conversions, not dead signups.
  if (req.body?.promoCode) {
    try {
      const promo = await PromoCode.findOne({
        where: {
          code: req.body.promoCode.toUpperCase().trim(),
          status: 'active',
        },
      });

      const isValid =
        promo &&
        promo.currentUses < promo.maxUses &&
        new Date() < new Date(promo.expiryDate);

      if (isValid) {
        await PromoUsage.create({
          promoCodeId: promo.id,
          userId: user.id,
          commissionStatus: 'none',
        });
      }
      // Invalid/expired code — silently ignore. Signup succeeds regardless.
    } catch (promoErr) {
      // Never block signup over a promo code issue
      console.error("Promo code tracking failed during signup:", promoErr.message);
    }
  }

  // 4. Send welcome email (non-blocking)
  try {
    await new Email(
      user,
      `${process.env.FRONTEND_URL}/user/dashboard`,
      ''
    ).sendOnBoard();
  } catch (error) {
    console.log("Welcome email failed:", error);
  }

  // 5. Send JWT token
  createSendToken(user, 201, req, res);
});


exports.login = catchAsync(async (req, res, next) => {
  //1. Get user based on POSTed email
  const { email, password } = req.body;

  //2. Check if email and password is there
  if (!email || !password) {
    return next(new AppError("Please provide email and password", "", 401));
  }

  //3. Check if user exist,  password is correct, and active check
  const user = await User.scope(["withPassword", "defaultScope"]).findOne({
    where: { email },
    include: [{ model: Wallet, as: "wallet" }],
  });

  if (!user || !(await user.correctPassword(password, user.password))) {
    return next(new AppError("Password or email is incorrect", "", 400));
  }

  //4. Check if account is active
  if (user.status !== "active" && user.status !== "pending") {
    return next(
      new AppError(
        `Your account has been ${user.status}. If you believe this is a mistake, please contact our support team.`,
        "",
        400
      )
    );
  }

  //5. Everything is okay, send token to client
  createSendToken(user, 200, req, res);
});

exports.logout = (req, res) => {
  res.cookie("jwt", "loggedout", {
    expires: new Date(Date.now() + 10 * 1000),
    httpOnly: true,
    secure: true,
    sameSite: "None",
  });
  res.status(200).json({ status: "success" });
};


exports.updatePassword = catchAsync(async (req, res, next) => {
  // 1) Get user from collection
  const user = await User.scope('withPassword').findByPk(req.user.id);

  // 2) Check if POSTed current password is correct
  if (!(await user.correctPassword(req.body?.passwordCurrent, user?.password))) {
    return next(new AppError('', { passwordCurrent: 'Your current password is wrong.' }, 401));
  }

  // 3) If so, update password
  user.password = req.body.password;
  user.passwordConfirm = req.body.passwordConfirm;

  await user.save({ validate: true, fields: ['password', 'passwordConfirm'] });

  // 4) Log user in, send JWT
  createSendToken(user, 200, req, res)
})

exports.protect = catchAsync(async (req, res, next) => {
  //1. Getting the token and checking if it there
  let token;

  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith("Bearer")
  ) {
    token = req.headers.authorization.split(" ")[1];
  } else if (req.cookies?.jwt) {
    token = req.cookies.jwt;
  }

  if (!token) {
    return next(
      new AppError("You are not login. Please login to gain access.", "", 401)
    );
  }

  //2. Verify token
  const decoded = await promisify(jwt.verify)(token, process.env.JWT_SECRET);

  //3. Check if user still exist
  const currentUser = await User.findByPk(decoded.id);
  if (!currentUser) {
    return next(new AppError('The user belonging to this token does no longer exist.', '', 401))
  }

  //4. Check if user changed password after token was issued
  if (currentUser.changedPasswordAfter(decoded.iat)) {
    return next(
      new AppError(
        "User recently changed password! Please log in again.",
        "",
        401
      )
    );
  }

  //GRANT ACCESS
  req.user = currentUser;
  next();
});

exports.restrictTo = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return next(
        new AppError(
          "You do not have the permission to perform this operation",
          " ",
          403
        )
      );
    }
    next();
  };
};


exports.forgotPassword = catchAsync(async (req, res, next) => {
  const { email } = req.body;

  //1) Check if there is email and password
  if (!email) {
    return next(new AppError("Missing required field",
      { email: "Please provide your email address" }, 401))
  }


  // 2) Get user based on POSTed email
  const user = await User.findOne({ where: { email } })
  if (!user) {
    return next(new AppError("No user was found with that email!", '', 404))
  }

  //3) Generate random reset token
  const resetToken = user.createPasswordResetToken();
  await user.save({ validateBeforeSave: false });
  const resetURL = `${process.env.FRONTEND_URL}/password-reset?token=${resetToken}`

  //4) Send token to client's email
  try {
    await new Email(user, resetURL, '').sendPasswordReset()
    res.status(200).json({
      status: "success",
      message: "Token has been sent to email!"
    });
  } catch (err) {
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;
    await user.save({ validate: false });
    return next(new AppError("There was a problem sending email. Please try again later!", '', 500))
  }
});


exports.resetPassword = catchAsync(async (req, res, next) => {
  // 1) Get user base on token
  const hashedToken = crypto.createHash('sha256').update(req.params.token).digest('hex');
  const user = await User.findOne({
    where: {
      passwordResetToken: hashedToken,
      passwordResetExpires: {
        [Op.gt]: new Date()
      }
    }
  });


  // 2) If token has not expire, and there is a user, set password
  if (!user) {
    return next(new AppError("Invalid token or token has expired!", '', 404))
  }

  user.password = req.body.password;
  user.passwordConfirm = req.body.passwordConfirm;
  user.passwordResetToken = null;
  user.passwordResetExpires = null;
  await user.save();

  // 3) Update passwordChangedAt property for the user

  // 4) Log in the user, send JWT
  createSendToken(user, 200, req, res)
})
