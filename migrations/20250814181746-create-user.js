'use strict';
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('users', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER
      },
      firstName: {
        type: Sequelize.STRING,
        allowNull:false
      },
      lastName: {
        type: Sequelize.STRING,
        allowNull:false
      },
      email: {
        type: Sequelize.STRING,
        allowNull:false,
        unique:true
      },
      phone: {
        type: Sequelize.STRING,
        allowNull:false,
        unique:true
      },
      password: {
        type: Sequelize.STRING,
        allowNull:false
      },
      passwordResetToken: {
        type: Sequelize.STRING
      },
      passwordChangedAt: {
        type: Sequelize.DATE
      },
      accountId: {
        type: Sequelize.STRING
      },
      referralId: {
        type: Sequelize.STRING
      },
      role: {
        type: Sequelize.ENUM('user', 'admin')
      },
      status: {
        type: Sequelize.ENUM('active', 'inactive', 'pending', 'deactivated')
      },
      active:{
        type:Sequelize.BOOLEAN,
        defaultValue:true
      },
      photo: {
        type: Sequelize.STRING
      },
      passwordResetExpires: {
        type: Sequelize.DATE
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
    await queryInterface.dropTable('users');
  }
};