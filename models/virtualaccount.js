'use strict';
const {
  Model
} = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class VirtualAccount extends Model {
    /**
     * Helper method for defining associations.
     * This method is not a part of Sequelize lifecycle.
     * The `models/index` file will call this method automatically.
     */
    static associate(models) {
      // define association here
      VirtualAccount.belongsTo(models.User, {
        foreignKey: "userId",
        as: "user"
      });
    }
  }
  VirtualAccount.init({
    userId: DataTypes.INTEGER,
    accountReference: DataTypes.STRING,
    accountName: DataTypes.STRING,
    accountNumber: DataTypes.STRING,
    bankName: DataTypes.STRING,
    bankCode: DataTypes.STRING,
    currency: DataTypes.STRING,
    status: DataTypes.STRING
  }, {
    sequelize,
    modelName: 'VirtualAccount',
    tableName: 'virtualAccounts'
  });
  return VirtualAccount;
};