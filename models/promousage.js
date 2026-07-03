'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class PromoUsage extends Model {
    static associate(models) {
      PromoUsage.belongsTo(models.PromoCode, { foreignKey: 'promoCodeId', as: 'promoCode' });
      PromoUsage.belongsTo(models.User, { foreignKey: 'userId', as: 'referredUser' });
    }
  }

  PromoUsage.init({
    promoCodeId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      validate: {
        notNull: { msg: 'PromoCode ID is required' },
        isInt: { msg: 'PromoCode ID must be an integer' }
      }
    },
    userId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      unique: true,   // ⚡ DB-level uniqueness
      validate: {
        notNull: { msg: 'User ID is required' },
        isInt: { msg: 'User ID must be an integer' }
      }
    },
    isFirstFundingTriggered: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      comment:'Flips to true when the user makes their first transaction'
    },
    commissionStatus: {
      type: DataTypes.ENUM('none', 'pending', 'mature', 'reversed'),
      allowNull: false,
      defaultValue: 'none',
      validate: {
        isIn: {
          args: [['none', 'pending', 'mature', 'reversed']],
          msg: 'Commission status must be one of: none, pending, mature, reversed'
        }
      }
    },
    matureAt: {
      type: DataTypes.DATE,
      allowNull: true, 
      comment:'Date when the influencer is allowed to claim/withdraw this cash'
    }
  }, {
    sequelize,
    modelName: 'PromoUsage',
    tableName: 'promoUsages'
  });

  return PromoUsage;
};