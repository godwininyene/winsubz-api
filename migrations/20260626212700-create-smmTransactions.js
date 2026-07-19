'use strict';

module.exports = {
    async up(queryInterface, Sequelize) {
        await queryInterface.createTable('smmTransactions', {
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
                    model: 'Users', // Adjust to match your exact DB table name if it's lowercase 'users'
                    key: 'id'
                },
                onUpdate: 'CASCADE',
                onDelete: 'CASCADE'
            },
            platform: {
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
            link: {
                type: Sequelize.STRING,
                allowNull: false
            },
            quantity: {
                type: Sequelize.INTEGER,
                allowNull: false
            },
            costPrice: {
                type: Sequelize.DECIMAL(12, 4),
                allowNull: true
            },
            sellingPrice: {
                type: Sequelize.DECIMAL(12, 4),
                allowNull: false
            },
            profit: {
                type: Sequelize.DECIMAL(12, 4),
                allowNull: false,
                defaultValue: 0
            },
            providerOrderId: {
                type: Sequelize.STRING,
                allowNull: true
            },
            requestId: {
                type: Sequelize.STRING,
                allowNull: false,
                unique: true
            },
            status: {
                type: Sequelize.ENUM('pending', 'processing', 'success', 'partial', 'failed', 'canceled'),
                allowNull: false,
                defaultValue: 'pending'
            },
            initialBalance: {
                type: Sequelize.DECIMAL(12, 4), 
                allowNull: true
            },
            finalBalance: {
                type: Sequelize.DECIMAL(12, 4), 
                allowNull: true
            },
            provider: {
                type: Sequelize.STRING,
                allowNull: false
            },
            deliveryMessage: {
                type: Sequelize.TEXT,
                allowNull: true
            },
            providerStatus: {
                type: Sequelize.STRING,
                allowNull: true
            },
            startCount: {
                type: Sequelize.INTEGER,
                allowNull: true
            },
            remains: {
                type: Sequelize.INTEGER,
                allowNull: true
            },
            isRefunded: {
                type: Sequelize.BOOLEAN,
                defaultValue: false
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
    },

    async down(queryInterface, Sequelize) {
        await queryInterface.dropTable('smmTransactions');
    }
};