'use strict';
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('coinTransactions', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER
      },
      transactionId: {
        type: Sequelize.INTEGER,
        allowNull:false,
         references: {
          model: 'Transactions',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      transactionType: {
        type: Sequelize.ENUM('buy', 'sell'),
        allowNull: false
      },
      receivingWalletAddress: {
        type: Sequelize.STRING,
        allowNull:true
      },
      coinAmount: {
        type: Sequelize.DOUBLE,
        allowNull:true
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
    await queryInterface.dropTable('coinTransactions');
  }
};