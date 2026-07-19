'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class SmmTransaction extends Model {
    static associate(models) {
      SmmTransaction.belongsTo(models.User, {
        foreignKey: 'userId', as: 'user',
        onDelete: 'CASCADE'
      });
    }
  }

  SmmTransaction.init({
    userId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      validate: {
        notNull: { msg: 'SMM transaction must belong to a user' }
      }
    },

    platform: {
      // Instagram, TikTok, Facebook, YouTube, etc. — for display/filtering
      type: DataTypes.STRING,
      allowNull: false
    },

    serviceId: {
      // The-Owlet's numeric service ID (from action=services)
      type: DataTypes.STRING,
      allowNull: false
    },

    serviceName: {
      type: DataTypes.STRING,
      allowNull: false
    },

    link: {
      // The post/profile URL the engagement is delivered to
      type: DataTypes.STRING,
      allowNull: false,
      validate: {
        notNull: { msg: 'Please provide link' },
        notEmpty: { msg: 'Link is required' }
      }
    },

    quantity: {
      type: DataTypes.INTEGER,
      allowNull: false,
      validate: {
        notNull: { msg: 'Please provide quantity' },
        isInt: true,
        min: { args: [1], msg: 'Quantity must be at least 1' }
      }
    },

    costPrice: {
      // What Owlet actually charges us: (rate / 1000) * quantity
      type: DataTypes.DECIMAL(12, 4),
      allowNull: true
    },

    sellingPrice: {
      // What we charge our user (costPrice + our markup)
      type: DataTypes.DECIMAL(12, 4),
      allowNull: false,
      validate: {
        notNull: { msg: 'Selling price is required' },
        min: { args: [0], msg: 'Selling price cannot be negative' }
      }
    },

    profit: {
      type: DataTypes.DECIMAL(12, 4),
      allowNull: false,
      defaultValue: 0
    },

    providerOrderId: {
      // The order ID Owlet returns from action=add — needed for status checks
      type: DataTypes.STRING,
      allowNull: true
    },

    requestId: {
      type: DataTypes.STRING,
      unique: true,
      allowNull: false,
      validate: {
        notNull: { msg: 'Request id is required' }
      }
    },

    status: {
      // Owlet's own statuses: Pending, In progress, Completed, Partial, Processing, Canceled
      // Mapped down to our internal set for consistency with VTUTransaction
      type: DataTypes.ENUM('pending', 'processing', 'success', 'partial', 'failed', 'canceled'),
      allowNull: false,
      defaultValue: 'pending'
    },

    initialBalance: {
      type: DataTypes.DECIMAL(12, 4), 
      allowNull: true
    },
    finalBalance: {
      type: DataTypes.DECIMAL(12, 4),
      allowNull: true
    },
    provider: {
      type: DataTypes.STRING,
      allowNull: false
    },
    deliveryMessage: {
      type: DataTypes.TEXT,
      allowNull: true
    },

    providerStatus: {
      // Raw status string as Owlet returns it, for debugging/audit
      type: DataTypes.STRING,
      allowNull: true
    },

    startCount: {
      type: DataTypes.INTEGER,
      allowNull: true
    },

    remains: {
      type: DataTypes.INTEGER,
      allowNull: true
    },

    isRefunded: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
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
    modelName: 'SmmTransaction',
    tableName: 'smmTransactions'
  });

  return SmmTransaction;
};
