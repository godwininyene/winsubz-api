'use strict';
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('promoCodes', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER
      },
      code: {
        type: Sequelize.STRING,
        allowNull: false,
        unique: true
      },
      influencerId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'Users',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      commissionAmount: {
        type: Sequelize.DOUBLE,
        allowNull: false
      },
      bonusAmount: {                           // ✅ NEW COLUMN
        type: Sequelize.DOUBLE,
        allowNull: false,
        defaultValue: 0
      },
      maxUses: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 50
      },
      currentUses: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      expiryDate: {
        type: Sequelize.DATE,
        allowNull: false
      },
      status: {
        type: Sequelize.ENUM('active', 'expired'),
        allowNull: false,
        defaultValue: 'active'
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

    // Add check constraints to enforce minimum values at database level
    // await queryInterface.addConstraint('promoCodes', {
    //   fields: ['commissionAmount'],
    //   type: 'check',
    //   where: {
    //     commissionAmount: { [Sequelize.Op.gte]: 50 }
    //   },
    //   name: 'commissionAmount_min_50'
    // });

    // await queryInterface.addConstraint('promoCodes', {
    //   fields: ['bonusAmount'],
    //   type: 'check',
    //   where: {
    //     bonusAmount: { [Sequelize.Op.gte]: 0 }
    //   },
    //   name: 'bonusAmount_non_negative'
    // });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('promoCodes');
  }
};