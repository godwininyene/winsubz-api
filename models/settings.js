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
    platformName: {
      type: DataTypes.STRING,
      defaultValue: 'Vico'
    },
    adminEmail: {
      type: DataTypes.STRING,
      defaultValue: 'noblegodwin02@gmail.com',
      validate: {
        isEmail: { msg: 'Please provide a valid admin email address' }
      }
    },
    supportEmail: {
      type: DataTypes.STRING,
      defaultValue: 'noblegodwin02@gmail.com',
      validate: {
        isEmail: { msg: 'Please provide a valid support email address' }
      }
    },
    supportPhone: {
      type: DataTypes.STRING,
      defaultValue: '08144098649',
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
    }
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