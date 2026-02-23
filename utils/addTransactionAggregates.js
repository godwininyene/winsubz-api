const { sequelize } = require('./../models');

const addTransactionAggregates = (queryOptions) => {
  queryOptions.attributes = {
    include: [
      // ===============================
      // TOTAL TRANSACTION COUNT (CRYPTO + GIFTCARD)
      // ===============================
      [
        sequelize.literal(`(
          SELECT COUNT(*) 
          FROM transactions 
          WHERE transactions.userId = User.id
        )`),
        'transactionCount'
      ],

      // ===============================
      // TOTAL TRANSACTION VOLUME (CRYPTO + GIFTCARD)
      // ===============================
      [
        sequelize.literal(`(
          SELECT COALESCE(SUM(amount), 0) 
          FROM transactions 
          WHERE transactions.userId = User.id
          AND transactions.status = 'completed'
        )`),
        'transactionVolume'
      ],

      // ===============================
      // USER VTU WALLET BALANCE
      // ===============================
      [
        sequelize.literal(`(
          SELECT COALESCE(vtuBalance, 0)
          FROM wallets
          WHERE wallets.userId = User.id
          LIMIT 1
        )`),
        'vtuBalance'
      ],

      // ===============================
      // TOTAL VTU VOLUME (COMPLETED)
      // ===============================
      [
        sequelize.literal(`(
          SELECT COALESCE(SUM(sellingPrice), 0)
          FROM vtuTransactions
          WHERE vtuTransactions.userId = User.id
          AND vtuTransactions.status = 'success'
        )`),
        'vtuVolume'
      ],

      // ===============================
      // TOTAL VTU PROFIT (OPTIONAL BUT VERY USEFUL)
      // ===============================
      [
        sequelize.literal(`(
          SELECT COALESCE(SUM(profit), 0)
          FROM vtuTransactions
          WHERE vtuTransactions.userId = User.id
          AND vtuTransactions.status = 'success'
        )`),
        'vtuProfit'
      ]
    ]
  };

  return queryOptions;
};

module.exports = addTransactionAggregates;