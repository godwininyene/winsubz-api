'use strict';
const {
  Model
} = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class CoinTransaction extends Model {
    static associate(models) {
      CoinTransaction.belongsTo(models.Transaction, { 
      foreignKey: 'transactionId',
      onDelete: 'CASCADE' // If transaction is deleted, delete its coin transaction
    });
    }
  }
  CoinTransaction.init({
    transactionId:{
      type:DataTypes.INTEGER,
      allowNull:false,
      validate:{
        notNull:{msg: 'Coin transaction must belong to a parent transaction'},
        notEmpty:{msg: 'Coin parent transaction cannot be empty'}
      },
       references:{
        model:'Transactions',
        key:'id'
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
    receivingWalletAddress: {
      type: DataTypes.STRING,
      allowNull:true,
      get() {
        const rawValue = this.getDataValue('receivingWalletAddress');
        if (!rawValue) return null;
        
        try {
          return JSON.parse(rawValue);
        } catch (e) {
          console.error('Failed to parse receivingWalletAddress JSON:', e);
          return null;
        }
      },
      set(value) {
        if (value && typeof value === 'object') {
          this.setDataValue('receivingWalletAddress', JSON.stringify(value));
        } else if (value) {
          this.setDataValue('receivingWalletAddress', value);
        } else {
          this.setDataValue('receivingWalletAddress', null);
        }
      },
      validate: {
        receivingWalletAddressRequired(value) {
          // For validation, handle both object and string cases
          let walletData = value;
          // If it's a string, try to parse it
          if (typeof value === 'string') {
            try {
              walletData = JSON.parse(value);
            } catch (e) {
              throw new Error('Receiving wallet must be a valid JSON object');
            }
          }

          if (this.transactionType === 'buy') {
            if(!walletData){
              throw new Error("Please provide receiving wallet address for coin purchases");
            }

            const requiredFields = ['network', 'address'];
            const missingFields = requiredFields.filter(field => !walletData[field]);
            
            if (missingFields.length > 0) {
              throw new Error(`Receiving wallet missing required fields: ${missingFields.join(', ')}`);
            }
          }
        }
      }
    },
    coinAmount:{
      type:DataTypes.DOUBLE,
      allowNull:true,
      validate:{
        requiredBTCAmount(value){
          if(this.transactionType === 'sell' && !value){
            throw new Error("Please provide coin amount ")
          }
        }
      }
    },
  }, {
    sequelize,
    modelName: 'CoinTransaction',
    tableName:'coinTransactions'
  });
  return CoinTransaction;
};