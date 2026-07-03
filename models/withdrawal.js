'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class Withdrawal extends Model {
    static associate(models) {
      Withdrawal.belongsTo(models.User, { foreignKey: 'userId', as: 'user' });
      
    }
  }

  Withdrawal.init({
    // id: {
    //   type: DataTypes.UUID,
    //   defaultValue: DataTypes.UUIDV4,
    //   primaryKey: true
    // },
    userId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      validate: {
        notNull: { msg: 'User ID is required' },
        isInt: { msg: 'User ID must be an integer' }
      }
    },
    amount: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
      validate: {
        notNull: { msg: 'Amount is required' },
        min: { args: [0.01], msg: 'Amount must be greater than 0' },
        isDecimal: { msg: 'Amount must be a valid number' }
      }
    },
    destination: {
      type: DataTypes.ENUM('vtu_balance', 'bank_account'),
      allowNull: false,
      validate: {
        isIn: {
          args: [['vtu_balance', 'bank_account']],
          msg: 'Destination must be either "vtu_balance" or "bank_account"'
        }
      }
    },
    status: {
      type: DataTypes.ENUM('pending', 'processing', 'success', 'failed'),
      allowNull: false,
      defaultValue: 'pending',
      validate: {
        isIn: {
          args: [['pending', 'processing', 'success', 'failed']],
          msg: 'Status must be one of: pending, processing, success, failed'
        }
      }
    },
    bankCode: {
      type: DataTypes.STRING,
      allowNull: true
    },
    accountNumber: {
      type: DataTypes.STRING,
      allowNull: true
    },
    accountName: {
      type: DataTypes.STRING,
      allowNull: true
    },
    reference: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
      validate: {
        notNull: { msg: 'Reference is required' },
        notEmpty: { msg: 'Reference cannot be empty' }
      }
    },
    monnifyReference: {
      type: DataTypes.STRING,
      allowNull: true
    },
    narration: {
      type: DataTypes.STRING,
      allowNull: true
    },
    errorMessage: {
      type: DataTypes.TEXT,
      allowNull: true
    }
  }, {
    sequelize,
    modelName: 'Withdrawal',
    tableName: 'withdrawals',
    timestamps: true,
    indexes: [
      { fields: ['userId'] },
      { fields: ['status'] },
      { fields: ['reference'] }
    ]
  });

  return Withdrawal;
};