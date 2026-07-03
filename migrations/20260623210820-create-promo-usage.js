'use strict';
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('promoUsages', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER
      },
      promoCodeId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'promoCodes',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE' 
      },
      userId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        unique: true,            // enforces one-code-per-user rule
        references: {
          model: 'Users',  
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      isFirstFundingTriggered: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false
      },
      commissionStatus: {
        type: Sequelize.ENUM('none', 'pending', 'mature', 'reversed'),
        allowNull: false,
        defaultValue: 'none'
      },
      matureAt: {
        type: Sequelize.DATE,
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
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('promoUsages');
  }
};