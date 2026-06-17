'use strict';
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('fundings', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER
      },
      reference: {
        type: Sequelize.STRING,
        allowNull: true,       // Changed from false to true
        defaultValue: null,    // Explicitly fallback to null instead of string defaults
        unique: true           // MySQL allows multiple NULLs in unique columns!
      },
      paymentReference: {
        type: Sequelize.STRING,
        allowNull: true,
        unique: true
      },

      amount: {
        type: Sequelize.INTEGER
      },
      charge: {
        type: Sequelize.INTEGER
      },
      creditedAmount: {
        type: Sequelize.INTEGER
      },
      status: {
        type: Sequelize.STRING
      },
      type: {
        type: Sequelize.STRING
      },
      userId: {
        type: Sequelize.INTEGER
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
    await queryInterface.dropTable('fundings');
  }
};