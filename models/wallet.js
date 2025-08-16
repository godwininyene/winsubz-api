'use strict';
const {
  Model
} = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class Wallet extends Model {
   
    static associate(models) {
      Wallet.belongsTo(models.User, {foreignKey:'userId', as:'wallet'})
    }
  }
  Wallet.init({
    totalBalance:{
      type:DataTypes.DOUBLE,
      defaultValue:0
    },
    cryptoBalance:{
      type:DataTypes.DOUBLE,
      defaultValue:0
    },
    giftcardBalance:{
      type: DataTypes.DOUBLE
    },
    referralBalance:{
      type:DataTypes.DOUBLE,
      defaultValue:0
    },
    userId:{
      type:DataTypes.INTEGER,
      onDelete:'CASCADE'
    }
  }, {
    sequelize,
    modelName: 'Wallet',
    tableName:'wallets'
  });
  return Wallet;
};