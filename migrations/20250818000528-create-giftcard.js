'use strict';
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('giftcards', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER
      },
      cardName: {
        type: Sequelize.STRING,
        allowNull:false,
        unique:true
      },
      cardLogo: {
        type: Sequelize.STRING,
        allowNull:false
      },
      cardType: {
        type: Sequelize.STRING,
        allowNull:false
      },
      cardRate: {
        type: Sequelize.DOUBLE,
        allowNull:false
      },
      status: {
        type: Sequelize.ENUM('active', 'inactive'),
        defaultValue:'active'
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
    await queryInterface.dropTable('giftcards');
  }
};