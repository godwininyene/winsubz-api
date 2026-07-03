'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class PromoCode extends Model {
    static associate(models) {
      // Tie the promo code to the influencer who owns it
      PromoCode.belongsTo(models.User, { foreignKey: 'influencerId', as: 'influencer' });
      PromoCode.hasMany(models.PromoUsage, { foreignKey: 'promoCodeId', as: 'usages' });
    }
  }

  PromoCode.init({
    code: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
      validate: {
        notNull: { msg: 'Please provide promo code' },
        notEmpty: { msg: 'promo code cannot be empty' }
      },
      set(val) {
        this.setDataValue('code', val.toUpperCase().trim()); // Clean inputs (e.g. "CAMPUS500")
      }
    },
    influencerId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      validate: {
        notNull: { msg: 'Promo code must belong to an influencer' },
        notEmpty: { msg: 'InfluencerId cannot be empty' }
      },
      references: {
        model: 'Users',
        key: 'id'
      }
    },
    // ── What the INFLUENCER earns per converted user
    commissionAmount: {
      type: DataTypes.DOUBLE,
      allowNull: false,
      validate: {
        notNull: { msg: 'Commission amount is required' },
        min: { args: [50], msg: 'Commission amount cannot be less than ₦50' }
      },
      comment: 'Flat amount credited to the influencer per qualifying first purchase'
    },

    // ── What the NEW USER receives on their first purchase
    // This is our influencer's marketing hook: "Use CAMPUS500 and get ₦100 bonus"
    bonusAmount: {
      type: DataTypes.DOUBLE,
      allowNull: false,
      defaultValue: 0,
      validate: {
        min: { args: [0], msg: 'Bonus amount cannot be negative' }
      },
      comment: 'Flat wallet credit given to the new user on their first qualifying purchase'
    },
    maxUses: {
      type: DataTypes.INTEGER,
      allowNull: false,
      validate: {
        notNull: { msg: 'Please provide maximum usage' },
        notEmpty: { msg: 'Maximum usage cannot be empty' }
      },
      defaultValue: 50 // Capping budget
    },
    currentUses: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0
    },
    expiryDate: {
      type: DataTypes.DATE,
      allowNull: false
    },
    status: {
      type: DataTypes.ENUM('active', 'expired'),
      allowNull: false,
      defaultValue: 'active',
      validate: {
        isIn: {
          args: [['active', 'expired']],
          msg: 'Status must be active, or expired'
        }
      }
    },
  }, {
    sequelize,
    modelName: 'PromoCode',
    tableName: 'promoCodes'
  });
  return PromoCode;
};