'use strict';
const {
  Model
} = require('sequelize');
const { v4: uuidv4 } = require('uuid');

module.exports = (sequelize, DataTypes) => {
  class Transaction extends Model {
    static associate(models) {
      Transaction.belongsTo(models.User, 
        {
          foreignKey:'userId', as: 'user',
          onDelete: 'CASCADE', // If user is deleted, delete its transactions
        }
      )
      Transaction.hasOne(models.GiftcardTransaction, {foreignKey: 'transactionId',as: 'giftcardDetails'});
      Transaction.hasOne(models.CoinTransaction, {foreignKey: 'transactionId', as: 'coinDetails'
  });
    }
  }
  
  Transaction.init({
    //General fields
    userId:{
      type:DataTypes.INTEGER,
      allowNull:false,
      validate:{
        notNull:{msg: 'Transaction must belong to a user'}
      },
      references:{
        model:'Users',
        key:'id'
      }
    },
    assetType:{
      type:DataTypes.ENUM('coin', 'giftcard'),
      allowNull:false,
      validate:{
        notNull:{msg: 'Please provide asset type'},
        notEmpty:{msg: 'Asset type cannot be empty'},
        isIn:{
          args:[['coin', 'giftcard']],
          msg: 'Asset type can either be coin or giftcard'
        }
      }
    },
    transactionType: {
      type:DataTypes.ENUM('buy', 'sell'),
      allowNull:false,
      validate:{
        notNull:{msg: 'Please provide transaction type'},
        notEmpty:{msg: 'Transaction type cannot be empty'},
        isIn:{
          args:[['buy', 'sell']],
          msg: 'Transaction type can either be buy or sell'
        }
      }
    },
    assetName:{
      type:DataTypes.STRING
    },
    flowType: {
      type: DataTypes.VIRTUAL,
      get() {
        return this.transactionType === 'buy' ? 'withdrawal' : 'deposit';
      }
    },
    usdAmount: {
      type:DataTypes.DOUBLE,
      allowNull:false,
      validate:{
        notNull:{msg: 'Please provide amount in USD'},
        notEmpty:{msg: 'Amount in USD cannot be empty'},
        min: {
          args: [0.01],
          msg: 'Amount must be greater than 0'
        }
      }
    },
    amount: {
      type: DataTypes.DOUBLE,
      allowNull:false,
      validate: {
        notNull:{msg: 'Provide provide amount'},
        notEmpty:{msg: 'Amount cannot be empty'},
        min: {
          args: [0.01],
          msg: 'Amount must be greater than 0'
        }
      }
    },
    assetRate:{
      type:DataTypes.DOUBLE
    },
    description: DataTypes.STRING,
    paymentProof: {
      type: DataTypes.STRING,
      allowNull: true,
      validate: {
        paymentProofRequired(value) {
          if (!value) {
            // Buy transactions (both giftcard and coin)
            if (this.transactionType === 'buy') {
              if (this.assetType === 'giftcard') {
                throw new Error('Payment proof is required when purchasing gift cards');
              } else if (this.assetType === 'coin') {
                throw new Error('Payment proof is required when purchasing cryptocurrency');
              }
            }
            // Sell transactions (only coin requires payment proof)
            if (this.transactionType === 'sell' && this.assetType === 'coin') {
              throw new Error('Proof of coins transfer is required when selling cryptocurrency');
            }
            
            // For giftcard sales, payment proof might not be required
            // since the user is providing the giftcard itself
            if (this.transactionType === 'sell' && this.assetType === 'giftcard') {
              // Giftcard sales typically don't require payment proof
              // as the user is selling, not buying
              return; // No error for giftcard sales
            }
          }
        },
      }
    },
    status:{
      type:DataTypes.ENUM('pending', 'completed', 'failed'),
      defaultValue:'pending',
      validate:{
        isIn:{
          args:[['pending', 'completed', 'failed']],
          msg: 'Status can either be pending, completed or failed'
        }
      }
    },
    ref:{
      type:DataTypes.STRING,
      defaultValue: () => `TRX-${Date.now().toString().slice(-6)}-${Math.random().toString(36).substr(2, 4).toUpperCase()}`
    },
    
    //This field is needed when the transactionType is sell
    receivingAccount: {
      type: DataTypes.TEXT,
      allowNull: true,
      get() {
        const rawValue = this.getDataValue('receivingAccount');
        if (!rawValue) return null;
        
        try {
          return JSON.parse(rawValue);
        } catch (e) {
          console.error('Failed to parse receivingAccount JSON:', e);
          return null;
        }
      },
      set(value) {
        if (value && typeof value === 'object') {
          this.setDataValue('receivingAccount', JSON.stringify(value));
        } else if (value) {
          this.setDataValue('receivingAccount', value);
        } else {
          this.setDataValue('receivingAccount', null);
        }
      },
      validate: {
        isValidAccount(value) {
          // For validation, handle both object and string cases
          let accountData = value;
          // If it's a string, try to parse it
          if (typeof value === 'string') {
            try {
              accountData = JSON.parse(value);
            } catch (e) {
              throw new Error('Receiving account must be a valid JSON object');
            }
          }
          
          if (this.transactionType === 'sell') {
            if (!accountData) {
              throw new Error("Receiving account details are required for sell transactions");
            }
            
            const requiredFields = ['bank', 'number', 'name'];
            const missingFields = requiredFields.filter(field => !accountData[field]);
            
            if (missingFields.length > 0) {
              throw new Error(`Receiving account missing required fields: ${missingFields.join(', ')}`);
            }
          }
        }
      }
    },
  }, {
    sequelize,
    modelName: 'Transaction',
    tableName:'transactions',
  });

  Transaction.prototype.toJSON = function() {
    const values = Object.assign({}, this.get());
    values.flowType = this.flowType;
    return values;
  };

  return Transaction;
};