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
      platformName: {
        type: Sequelize.STRING,
        defaultValue: 'Vico'
      },
      adminEmail: {
        type: Sequelize.STRING,
        defaultValue: 'admin@vico.com'
      },
      supportEmail: {
        type: Sequelize.STRING,
        defaultValue: 'support@vico.com'
      },
      supportPhone:{
        type: Sequelize.STRING,
        defaultValue: '08144098649'
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
      createdAt: {
        allowNull: false,
        type: Sequelize.DATE
      },
      updatedAt: {
        allowNull: false,
        type: Sequelize.DATE
      }
    });

    // Insert default settings
    await queryInterface.bulkInsert('settings', [{
      platformName: 'Vico',
      adminEmail: 'noblegodwin02@gmail.com',
      supportEmail: 'support@vico.com',
      supportPhone:"08144098649",
      defaultCurrency: 'NGN',
      maintenanceMode: false,
      createdAt: new Date(),
      updatedAt: new Date()
    }]);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('settings');
  }
};