'use strict';
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('wallets', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER
      },
      totalBalance: {
        type: Sequelize.DOUBLE,
        defaultValue: 0
      },
      cryptoBalance: {
        type: Sequelize.DOUBLE,
        defaultValue: 0
      },
      giftcardBalance: {
        type: Sequelize.DOUBLE,
        defaultValue: 0
      },
      vtuBalance: {
        type: Sequelize.DOUBLE,
        defaultValue: 0
      },
      referralBalance: {
        type: Sequelize.DOUBLE,
        defaultValue: 0
      },
      userId: {
        type: Sequelize.INTEGER,
        references: {
          model: 'users',
          key: 'id'
        },
        onDelete: 'CASCADE'
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
  },
  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('wallets');
  }
};