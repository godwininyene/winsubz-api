'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class VTUTransaction extends Model {
    static associate(models) {
      VTUTransaction.belongsTo(models.User, {
        foreignKey: 'userId', as: 'user',
        onDelete: 'CASCADE'
      });
    }
  }

  VTUTransaction.init({

    userId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      validate: {
        notNull: { msg: 'VTU transaction must belong to a user' },
        notEmpty: { msg: 'User id cannot be empty' }
      }
    },

    type: {
      type: DataTypes.ENUM('data', 'airtime', 'cable', 'electricity', 'education'),
      allowNull: false,
      validate: {
        notNull: { msg: 'Please provide VTU transaction type' },
        notEmpty: { msg: 'VTU transaction type cannot be empty' },
        isIn: {
          args: [['data', 'airtime', 'cable', 'electricity', 'education']],
          msg: 'VTU transaction type must be one of data, airtime, cable, electricity, education'
        }
      }
    },

    provider: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: {
        notNull: { msg: 'Please provide VTU provider name' },
        notEmpty: { msg: 'VTU provider cannot be empty' }
      }
    },

    serviceId: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: {
        notNull: { msg: 'Service ID is required' },
        notEmpty: { msg: 'Service ID cannot be empty' }
      }
    },

    serviceName: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: {
        notNull: { msg: 'Service name is required' },
        notEmpty: { msg: 'Service name cannot be empty' }
      }
    },

    beneficiary: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: {
        notNull: { msg: 'Beneficiary is required' },
        notEmpty: { msg: 'Beneficiary cannot be empty' }
      }
    },

    planCode: {
      type: DataTypes.STRING,
      allowNull: true
    },

    planLabel: {
      type: DataTypes.STRING,
      allowNull: true
    },

    costPrice: {
      type: DataTypes.INTEGER,
      allowNull: false,
      validate: {
        notNull: { msg: 'Cost price is required' },
        isInt: { msg: 'Cost price must be an integer' },
        min: {
          args: [0],
          msg: 'Cost price cannot be negative'
        }
      }
    },

    sellingPrice: {
      type: DataTypes.INTEGER,
      allowNull: false,
      validate: {
        notNull: { msg: 'Selling price is required' },
        isInt: { msg: 'Selling price must be an integer' },
        min: {
          args: [0],
          msg: 'Selling price cannot be negative'
        }
      }
    },

    /** REAL provider wholesale charge */
    amountPaid: {
      type: DataTypes.DECIMAL(12, 6),
      allowNull: true,
      validate: {
        min: 0
      }
    },

    profit: {
      type: DataTypes.INTEGER,
      allowNull: false,
      validate: {
        notNull: { msg: 'Profit is required' },
        isInt: { msg: 'Profit must be an integer' },
        profitMatchesPrices(value) {
          if (this.sellingPrice != null && this.costPrice != null) {
            const expected = Math.round(this.sellingPrice - this.costPrice);
            if (value !== expected && this.status === 'success') {
              throw new Error('Profit must equal sellingPrice - costPrice');
            }
          }
        }
      }
    },

    /** 🔍 Advanced analytics */
    providerDiscount: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      validate: {
        isInt: { msg: 'Provider discount must be an integer' },
        min: {
          args: [0],
          msg: 'Provider discount cannot be negative'
        }
      }
    },

    faceValue: {
      type: DataTypes.INTEGER,
      allowNull: false,
      validate: {
        notNull: { msg: 'Face value is required' },
        isInt: { msg: 'Face value must be an integer' },
        min: {
          args: [0],
          msg: 'Face value cannot be negative'
        }
      }
    },

    providerRef: {
      type: DataTypes.STRING,
      allowNull: true
    },

    requestId: {
      type: DataTypes.STRING,
      unique: true,
      allowNull: false,
      validate: {
        notNull: { msg: 'Request id is required' },
        notEmpty: { msg: 'Request id cannot be empty' }
      }
    },

    providerRequestId: {
      type: DataTypes.STRING,
      unique: true,
      allowNull: false,
      validate: {
        notNull: { msg: 'Provider request id is required' },
        notEmpty: { msg: 'Provider request id cannot be empty' }
      }
    },

    status: {
      type: DataTypes.ENUM('success', 'failed', 'pending', 'failed_manual_review'),
      allowNull: false,
      defaultValue: 'pending',
      validate: {
        isIn: {
          args: [['success', 'failed', 'pending', 'failed_manual_review']],
          msg: 'Status must be success, failed, or pending'
        }
      }
    },

    providerStatus: {
      type: DataTypes.STRING,
      allowNull: true
    },

    initialBalance: {
      type: DataTypes.INTEGER,
      allowNull: true,
      validate: {
        min: 0
      }
    },

    finalBalance: {
      type: DataTypes.INTEGER,
      allowNull: true,
      validate: {
        min: 0
      }
    },

    token: {
      type: DataTypes.STRING,
      allowNull: true
    },

    verificationAttempts: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    },
    lastVerifiedAt: {
      type: DataTypes.DATE,
      allowNull: true
    }

  }, {
    sequelize,
    modelName: 'VTUTransaction',
    tableName: 'vtuTransactions'
  });

  return VTUTransaction;
};
