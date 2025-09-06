'use strict';
const {
  Model
} = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class BankAccount extends Model {
    static associate(models) {
      BankAccount.belongsTo(models.User, {
        foreignKey: 'userId',
        onDelete: 'CASCADE' // If user is deleted, delete his accounts
      });
    }
  }
  BankAccount.init({
    userId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      validate: {
        notNull: { msg: 'Account should belong to a user' },
        notEmpty: { msg: 'User cannot be empty' }
      },
      references: {
        Model: 'Users',
        key: 'userId'
      },
      onDelete: "CASCADE"
    },
    context: {
      type: DataTypes.STRING,
      defaultValue: 'user'
    },
    bank: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: {
        notNull: { msg: 'Please provide bank name' },
        notEmpty: { msg: 'Bank name cannot be empty' }
      }
    },
    number: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: {
        notNull: { msg: 'Please provide account number' },
        notEmpty: { msg: 'Account number cannot be empty' }
      }
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: {
        notNull: { msg: 'Please provide account holder name' },
        notEmpty: { msg: 'Account holder name cannot be empty' }
      }
    }
  }, {
    sequelize,
    modelName: 'BankAccount',
    tableName: 'bankAccounts'
  });
  return BankAccount;
};