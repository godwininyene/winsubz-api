'use strict';
const bcrypt = require('bcryptjs');
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    const hashedPassword = await bcrypt.hash('passd1234', 12);
    await queryInterface.bulkInsert('users', [
      {
        firstName: 'Super',
        lastName: 'Admin',
        email: 'admin@digitalassets.com',
        phone: '+12345678901',
        password: hashedPassword,
        role: 'admin',
        status: 'active',
        photo:`${process.env.APP_URL}/img/users/default.jpg`
      }
    ])
  },

  async down (queryInterface, Sequelize) {
    await queryInterface.bulkDelete('users', { email: 'admin@digitalassets.com' }, {});
  }
};
