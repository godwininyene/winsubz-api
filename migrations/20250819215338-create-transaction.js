'use strict';
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('transactions', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER
      },
      userId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'Users',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      assetType: {
        type: Sequelize.ENUM('coin', 'giftcard'),
        allowNull: false
      },
      assetName:{
        type:Sequelize.STRING
      },
      transactionType: {
        type: Sequelize.ENUM('buy', 'sell'),
        allowNull: false
      },
      usdAmount: {
        type: Sequelize.DOUBLE,
        allowNull: false
      },
      amount: {
        type: Sequelize.DOUBLE,
        allowNull: false
      },
      assetRate:{
        type:Sequelize.DOUBLE
      },
      description: {
        type: Sequelize.STRING,
        allowNull: true
      },
      paymentProof: {
        type: Sequelize.STRING,
        allowNull: true
      },
      status: {
        type: Sequelize.ENUM('pending', 'completed', 'failed'),
        defaultValue: 'pending'
      },
      ref: {
        type: Sequelize.STRING,
        allowNull: false,
        unique: true
      },
      receivingAccount: {
        type: Sequelize.TEXT,
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

    // Add indexes for better performance
    await queryInterface.addIndex('transactions', ['userId']);
    await queryInterface.addIndex('transactions', ['status']);
    await queryInterface.addIndex('transactions', ['ref']);
    await queryInterface.addIndex('transactions', ['userId', 'status']);
    await queryInterface.addIndex('transactions', ['assetType', 'transactionType']);
  },

  async down(queryInterface, Sequelize) {
    // Remove indexes first
    await queryInterface.removeIndex('transactions', ['userId']);
    await queryInterface.removeIndex('transactions', ['status']);
    await queryInterface.removeIndex('transactions', ['ref']);
    await queryInterface.removeIndex('transactions', ['userId', 'status']);
    await queryInterface.removeIndex('transactions', ['assetType', 'transactionType']);
    
    // Then drop the table
    await queryInterface.dropTable('transactions');
  }
};