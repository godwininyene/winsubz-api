'use strict';
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('withdrawals', {
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
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      amount: {
        type: Sequelize.DECIMAL(12, 2),
        allowNull: false
      },
      destination: {
        type: Sequelize.ENUM('vtu_balance', 'bank_account'),
        allowNull: false
      },
      status: {
        type: Sequelize.ENUM('pending', 'processing', 'success', 'failed'),
        allowNull: false,
        defaultValue: 'pending'
      },
      bankCode: {
        type: Sequelize.STRING,
        allowNull: true
      },
      accountNumber: {
        type: Sequelize.STRING,
        allowNull: true
      },
      accountName: {
        type: Sequelize.STRING,
        allowNull: true
      },
      reference: {
        type: Sequelize.STRING,
        allowNull: false,
        unique: true
      },
      monnifyReference: {
        type: Sequelize.STRING,
        allowNull: true
      },
      narration: {
        type: Sequelize.STRING,
        allowNull: true
      },
      errorMessage: {
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

    // Add indexes (already defined in model, but can also be added here)
    await queryInterface.addIndex('withdrawals', ['userId']);
    await queryInterface.addIndex('withdrawals', ['status']);
    await queryInterface.addIndex('withdrawals', ['reference'], { unique: true });

    // Optional: Add check constraint for amount > 0
    // await queryInterface.addConstraint('withdrawals', {
    //   fields: ['amount'],
    //   type: 'check',
    //   where: {
    //     amount: { [Sequelize.Op.gt]: 0 }
    //   },
    //   name: 'amount_positive'
    // });
  },

  async down(queryInterface, Sequelize) {
    // Drop the table (ENUMs will be cleaned automatically in PG/MySQL)
    await queryInterface.dropTable('withdrawals');
  }
};