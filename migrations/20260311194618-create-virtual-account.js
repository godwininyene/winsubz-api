'use strict';
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('virtualAccounts', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER
      },

      userId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        unique: true,
        references: {
          model: 'users',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },

      accountReference: {
        type: Sequelize.STRING,
        allowNull: false,
        unique: true
      },

      accountName: {
        type: Sequelize.STRING,
        allowNull: false
      },

      accountNumber: {
        type: Sequelize.STRING,
        allowNull: false,
        unique: true
      },

      bankName: {
        type: Sequelize.STRING,
        allowNull: false
      },

      bankCode: {
        type: Sequelize.STRING,
        allowNull: true
      },

      currency: {
        type: Sequelize.STRING,
        allowNull: false,
        defaultValue: 'NGN'
      },

      status: {
        type: Sequelize.STRING,
        allowNull: false,
        defaultValue: 'active'
      },

      createdAt: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.fn('NOW')
      },

      updatedAt: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.fn('NOW')
      }
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('virtualAccounts');
  }
};