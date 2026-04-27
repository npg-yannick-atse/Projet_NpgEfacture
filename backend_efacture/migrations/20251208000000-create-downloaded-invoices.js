'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('downloaded_invoices', {
      id: {
        type: Sequelize.STRING,
        primaryKey: true,
        allowNull: false
      },
      username: {
        type: Sequelize.STRING,
        allowNull: false
      },
      numero: {
        type: Sequelize.STRING,
        allowNull: false
      },
      date: {
        type: Sequelize.DATE,
        allowNull: false
      },
      client: {
        type: Sequelize.STRING,
        allowNull: false
      },
      data: {
        type: Sequelize.TEXT('long'),
        allowNull: false
      },
      download_date: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW
      }
    });

    await queryInterface.addIndex('downloaded_invoices', ['username']);
    await queryInterface.addIndex('downloaded_invoices', ['numero']);
    await queryInterface.addIndex('downloaded_invoices', ['download_date']);
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('downloaded_invoices');
  }
};
