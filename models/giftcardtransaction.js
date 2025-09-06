'use strict';
const {
  Model
} = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class GiftcardTransaction extends Model {
    static associate(models) {
      GiftcardTransaction.belongsTo(models.Transaction, { 
        foreignKey: 'transactionId',
        onDelete: 'CASCADE' // If transaction is deleted, delete its giftcard transaction
      });
    }
  }
  GiftcardTransaction.init({
    transactionId:{
      type:DataTypes.INTEGER,
      allowNull:false,
      validate:{
        notNull:{msg: 'Giftcard transaction must belong to a parent transaction'},
        notEmpty:{msg: 'Giftcard parent transaction cannot be empty'}
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
    cardNum:{
      type:DataTypes.STRING,
      allowNull:true,
      validate:{
        cardNumRequired(value) {
          if (this.transactionType === 'sell' && !value) {
            throw new Error("Please provide giftcard number for giftcard sell transactions");
          }
        }
      }
    },
    cardImage:{
      type:DataTypes.STRING,
      allowNull:true,
      validate:{
        cardImageRequired(value) {
          if (this.transactionType === 'sell' && !value) {
            throw new Error("Please provide giftcard image for giftcard sell transactions");
          }
        }
      }
    },
  }, {
    sequelize,
    modelName: 'GiftcardTransaction',
    tableName:"giftcardTransactions",
  });
  return GiftcardTransaction;
};