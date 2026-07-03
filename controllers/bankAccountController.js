const catchAsync = require('../utils/catchAsync')
const { BankAccount } = require('../models');
const AppError = require('../utils/appError');
const monnifyService = require('../services/monnifyService'); // Adjust path based on your folders


exports.getSupportedBanks = catchAsync(async (req, res, next) => {
    // You can call monnifyService.getBanks() here, or return a verified local list
    const banks = await monnifyService.getAllSupportedBanks();

    res.status(200).json({
        status: 'success',
        data: { banks }
    });
});

// 2. Resolve an account number to an account name before saving
exports.verifyAccountDetails = catchAsync(async (req, res, next) => {
    const { accountNumber, bankCode } = req.body;

    if (!accountNumber || !bankCode) {
        return next(new AppError('Account number and bank code are required for verification.', '', 400));
    }

    // Hit Monnify's Name Enquiry API
    const resolution = await monnifyService.nameEnquiry({ accountNumber, bankCode });

    if (!resolution.requestSuccessful || !resolution.responseBody) {
        return next(new AppError('Could not verify this account. Please confirm details.', '', 422));
    }

    res.status(200).json({
        status: 'success',
        data: {
            accountNumber,
            bankCode,
            accountName: resolution.responseBody.accountName
        }
    });
});

exports.createAccountAdmin = catchAsync(async (req, res, next) => {
    let account;

    //Find existing account
    const existingAccount = await BankAccount.findOne({ where: { context: 'admin' } })
    if (existingAccount) {
        account = await existingAccount.update(req.body)
    } else {
        req.body.context = 'admin';
        req.body.userId = req.user.id;
        account = await BankAccount.create(req.body)
    }

    res.status(201).json({
        status: "success",
        data: {
            account
        }
    })
});


exports.createAccount = catchAsync(async (req, res, next) => {
    const { bank, bankCode, number, name } = req.body;

    if (req.body) {
        req.body.userId = req.user.id;
    }

    // Optional Protection: Make sure they aren't saving junk names by re-verifying or ensuring name is passed from your verification flow
    if (!bankCode) {
        return next(new AppError('A valid bank routing code must be associated with this account.', '', 400));
    }

    // Create the clean account
    const account = await BankAccount.create({
        userId: req.user.id,
        bank,
        bankCode,
        number,
        name
    });

    res.status(201).json({
        status: "success",
        data: { account }
    });
});

exports.getBankAccounts = catchAsync(async (req, res, next) => {
    const accounts = await BankAccount.findAll({ where: { userId: req.user.id }, order: [['createdAt', 'DESC']] });
    res.status(200).json({
        status: "success",
        results: accounts.length,
        data: {
            accounts
        }
    })
});
exports.getCompanyAccount = catchAsync(async (req, res, next) => {
    const account = await BankAccount.findOne({ where: { context: 'admin' } });
    res.status(200).json({
        status: "success",
        data: {
            account
        }
    })
});

exports.deleteAccount = catchAsync(async (req, res, next) => {
    const account = await BankAccount.findByPk(req.params.id);
    if (!account) {
        return next(new AppError('No account was found with that ID', '', 404))
    }

    await account.destroy();
    res.status(204).json({
        data: null
    })
})