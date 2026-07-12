// migrations/XXXXXX-create-settings.js
'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('settings', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER
      },
      // PLATFORM SETTINGS
      platformName: {
        type: Sequelize.STRING,
        defaultValue: 'Winsubz'
      },
      adminEmail: {
        type: Sequelize.STRING,
        defaultValue: 'godwinhigh2@gmail.com'
      },
      supportEmail: {
        type: Sequelize.STRING,
        defaultValue: 'winsubz@winsubz.com'
      },
      supportPhone: {
        type: Sequelize.STRING,
        defaultValue: '09076813524'
      },
      defaultCurrency: {
        type: Sequelize.STRING(3),
        defaultValue: 'NGN'
      },
      maintenanceMode: {
        type: Sequelize.BOOLEAN,
        defaultValue: false
      },
      facebookUrl: {
        type: Sequelize.STRING,
        allowNull: true
      },
      twitterUrl: {
        type: Sequelize.STRING,
        allowNull: true
      },
      instagramUrl: {
        type: Sequelize.STRING,
        allowNull: true
      },
      linkedinUrl: {
        type: Sequelize.STRING,
        allowNull: true
      },
      youtubeUrl: {
        type: Sequelize.STRING,
        allowNull: true
      },
      tiktokUrl: {
        type: Sequelize.STRING,
        allowNull: true
      },

      // REWARD SETTINGS
      rewardModalTitle: {
        type: Sequelize.STRING,
        defaultValue: 'Winsubz Monthly Reward'
      },
      rewardModalMessage: {
        type: Sequelize.STRING,
        defaultValue: 'Top 3 users by transaction volume win airtime/cash — up to ₦1,500.'
      },
      rewardRuleText: {
        type: Sequelize.STRING,
        defaultValue: 'Transact at least 3 times before month-end to qualify. The more you use Winsubz, the higher your chances.'
      },
      rewardModalActive: {
        type: Sequelize.BOOLEAN,
        defaultValue: true
      },
      minTransactions: {
        type: Sequelize.INTEGER,
        defaultValue: 3
      },
      winnersCount: {
        type: Sequelize.INTEGER,
        defaultValue: 3
      },
      leaderboardLimit: {
        type: Sequelize.INTEGER,
        defaultValue: 10
      },
      excludedUserIds: {
        type: Sequelize.STRING,
        allowNull: true,
        defaultValue: '7', // comma-separated user IDs to exclude from leaderboard (e.g. test/personal accounts)
      },

      // TIMESTAMPS
      createdAt: {
        allowNull: false,
        type: Sequelize.DATE
      },
      updatedAt: {
        allowNull: false,
        type: Sequelize.DATE
      }
    });

    // Insert default settings row
    await queryInterface.bulkInsert('settings', [{
      id: 1, // Explicitly set to 1 to match your model's singleton hooks
      platformName: 'Winsubz',
      adminEmail: 'godwinhigh2@gmail.com', // Updated to match model
      supportEmail: 'winsubz@winsubz.com',
      supportPhone: '09076813524',
      defaultCurrency: 'NGN',
      maintenanceMode: false,
      rewardModalTitle: 'Winsubz Monthly Reward',
      rewardModalMessage: 'Top 3 users by transaction volume win airtime/cash — up to ₦1,500.',
      rewardRuleText: 'Transact at least 3 times before month-end to qualify. The more you use Winsubz, the higher your chances.',
      rewardModalActive: true,
      minTransactions: 3,
      winnersCount: 3,
      leaderboardLimit: 10,
      excludedUserIds: '7',
      createdAt: new Date(),
      updatedAt: new Date()
    }]);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('settings');
  }
};