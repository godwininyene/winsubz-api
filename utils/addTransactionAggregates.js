const { sequelize } = require('./../models')
const addTransactionAggregates = (queryOptions) => {
    queryOptions.attributes = {
        include: [
            [
                sequelize.literal(`(
                    SELECT COUNT(*) 
                    FROM transactions 
                    WHERE transactions.userId = User.id
                )`),
                'transactionCount'
            ],
            [
                sequelize.literal(`(
                    SELECT COALESCE(SUM(amount), 0) 
                    FROM transactions 
                    WHERE transactions.userId = User.id
                    AND transactions.status = 'completed'
                )`),
                'transactionVolume'
            ]
        ]
    };
    //using includes instead of subqueries
    // Include transaction aggregates using include
    // queryOptions.include = [{
    //     model: Transaction,
    //     as: 'transactions',
    //     attributes: [], // We don't need the actual transaction data
    //     required: false // Use left join to include users with no transactions
    // }];

    // queryOptions.attributes = {
    //     include: [
    //         [sequelize.fn('COUNT', sequelize.col('transactions.id')), 'transactionCount'],
    //         [sequelize.fn('COALESCE', sequelize.fn('SUM', sequelize.col('transactions.amount')), 0), 'transactionVolume']
    //     ],
    //     group: ['User.id'] // Group by user id to avoid duplicates
    // };

    return queryOptions;
};

module.exports = addTransactionAggregates;