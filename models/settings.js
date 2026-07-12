// models/settings.js
'use strict';
const {
  Model
} = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class Settings extends Model {
    static associate(models) {
      // associations can be defined here
    }
  }

  Settings.init({
    //PLATFORM SETTINGS
    platformName: {
      type: DataTypes.STRING,
      defaultValue: 'Winsubz'
    },
    adminEmail: {
      type: DataTypes.STRING,
      defaultValue: 'godwinhigh2@gmail.com',
      validate: {
        isEmail: { msg: 'Please provide a valid admin email address' }
      }
    },
    supportEmail: {
      type: DataTypes.STRING,
      defaultValue: 'winsubz@winsubz.com',
      validate: {
        isEmail: { msg: 'Please provide a valid support email address' }
      }
    },
    supportPhone: {
      type: DataTypes.STRING,
      defaultValue: '09076813524',
    },
    defaultCurrency: {
      type: DataTypes.STRING(3),
      defaultValue: 'NGN',
      validate: {
        isIn: [['NGN', 'USD', 'EUR']]
      }
    },
    maintenanceMode: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    facebookUrl: {
      type: DataTypes.STRING,
      allowNull: true,
      validate: {
        isUrl: { msg: 'Please provide a valid facebook profile link' }
      }
    },
    twitterUrl: {
      type: DataTypes.STRING,
      allowNull: true,
      validate: {
        isUrl: { msg: 'Please provide a valid twitter profile link' }
      }
    },
    instagramUrl: {
      type: DataTypes.STRING,
      allowNull: true,
      validate: {
        isUrl: { msg: 'Please provide a valid instagram profile link' }
      }
    },
    linkedinUrl: {
      type: DataTypes.STRING,
      allowNull: true,
      validate: {
        isUrl: { msg: 'Please provide a valid linkedin profile link' }
      }
    },
    youtubeUrl: {
      type: DataTypes.STRING,
      allowNull: true,
      validate: {
        isUrl: { msg: 'Please provide a valid youtube profile link' }
      }
    },
    tiktokUrl: {
      type: DataTypes.STRING,
      allowNull: true,
      validate: {
        isUrl: { msg: 'Please provide a valid tiktok profile link' }
      }
    },

    //REWARD SETTINGS
    rewardModalTitle: {
      type: DataTypes.STRING,
      defaultValue: 'Winsubz Monthly Reward'
    },

    rewardModalMessage: {
      type: DataTypes.STRING,
      defaultValue: 'Top 3 users by transaction volume win airtime/cash — up to ₦1,500.'
    },

    rewardRuleText: {
      type: DataTypes.STRING,
      defaultValue: 'Transact at least 3 times before month-end to qualify. The more you use Winsubz, the higher your chances.'
    },

    rewardModalActive: {
      type: DataTypes.BOOLEAN,
      defaultValue: true
    },

    minTransactions: {
      type: DataTypes.INTEGER,
      defaultValue: 3,
      validate: {
        isInt: { msg: 'Minimum transactions must be an integer' },
        min: { args: [1], msg: 'Minimum transactions must be at least 1' }
      }
    },

    winnersCount: {
      type: DataTypes.INTEGER,
      defaultValue: 3,
      validate: {
        isInt: { msg: 'Winners count must be an integer' },
        min: { args: [1], msg: 'Winners count must be at least 1' }
      }
    },

    leaderboardLimit: {
      type: DataTypes.INTEGER,
      defaultValue: 10,
      validate: {
        isInt: { msg: 'Leaderboard limit must be an integer' },
        min: { args: [1], msg: 'Leaderboard limit must be at least 1' }
      }
    },
    excludedUserIds: {
      type: DataTypes.STRING,
      allowNull: true,
      defaultValue: '7', // comma-separated user IDs to exclude from leaderboard (e.g. test/personal accounts)
    },
  }, {
    sequelize,
    modelName: 'Settings',
    tableName: 'settings',
    // Since we'll only have one settings row, we can set a fixed ID
    hooks: {
      beforeCreate: (settings, options) => {
        settings.id = 1; // Force ID to always be 1
      },
      beforeBulkCreate: (settingsArray, options) => {
        // Prevent creating multiple settings rows
        if (settingsArray.length > 1) {
          throw new Error('Only one settings record is allowed');
        }
        settingsArray[0].id = 1;
      }
    }
  });

  return Settings;
};