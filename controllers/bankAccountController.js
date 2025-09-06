const catchAsync = require('../utils/catchAsync')
const { BankAccount } = require('../models');
const AppError = require('../utils/appError');

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
    if (req.body) {
        req.body.userId = req.user.id;
    }

    const account = await BankAccount.create(req.body)
    res.status(201).json({
        status: "success",
        data: {
            account
        }
    })
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