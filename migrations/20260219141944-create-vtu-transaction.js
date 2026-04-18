'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('vtuTransactions', {
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

      type: {
        type: Sequelize.ENUM('data', 'airtime', 'cable', 'electricity', 'education'),
        allowNull: false,
      },

      provider: {
        type: Sequelize.STRING,
        allowNull: false
      },

      serviceId: {
        type: Sequelize.STRING,
        allowNull: false
      },

      serviceName: {
        type: Sequelize.STRING,
        allowNull: false
      },

      beneficiary: {
        type: Sequelize.STRING,
        allowNull: false
      },

      planCode: {
        type: Sequelize.STRING,
        allowNull: true
      },

      planLabel: {
        type: Sequelize.STRING,
        allowNull: true
      },

      costPrice: {
        type: Sequelize.INTEGER,
        allowNull: false
      },

      sellingPrice: {
        type: Sequelize.INTEGER,
        allowNull: false
      },

      amountPaid: {
        type: Sequelize.DECIMAL(12, 6),
        allowNull: true
      },

      profit: {
        type: Sequelize.INTEGER,
        allowNull: false
      },

      providerDiscount: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0
      },

      faceValue: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0
      },

      providerRef: {
        type: Sequelize.STRING,
        allowNull: true,
        unique: true
      },

      requestId: {
        type: Sequelize.STRING,
        unique: true,
        allowNull: false
      },

      providerRequestId: {
        type: Sequelize.STRING,
        unique: true,
        allowNull: false
      },

      status: {
        type: Sequelize.ENUM('success', 'failed', 'pending', 'failed_manual_review'),
        allowNull: false,
        defaultValue: 'pending',
      },

      providerStatus: {
        type: Sequelize.STRING,
        allowNull: true
      },

      initialBalance: {
        type: Sequelize.INTEGER,
        allowNull: true
      },

      finalBalance: {
        type: Sequelize.INTEGER,
        allowNull: true
      },

      token: {
        type: Sequelize.STRING,
        allowNull: true
      },

      verificationAttempts: {
        type: Sequelize.INTEGER,
        defaultValue: 0
      },
      lastVerifiedAt: {
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

    await queryInterface.addIndex('vtuTransactions', ['userId']);
    await queryInterface.addIndex('vtuTransactions', ['type']);
    await queryInterface.addIndex('vtuTransactions', ['status']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('vtuTransactions');
  }
};
