'use strict';
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('coins', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER
      },
      coinName: {
        type: Sequelize.STRING,
        allowNull:false,
        unique:true
      },
      coinAddress: {
        type: Sequelize.STRING,
        allowNull:false
      },
      coinRate: {
        type: Sequelize.DOUBLE,
        allowNull:false
      },
      coinImage: {
        type: Sequelize.STRING,
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
    await queryInterface.dropTable('coins');
  }
};