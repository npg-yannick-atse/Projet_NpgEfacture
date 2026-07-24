'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('logs_actions', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false
      },
      username: {
        type: Sequelize.STRING(100),
        allowNull: false
      },
      numero_facture: {
        type: Sequelize.STRING(50),
        allowNull: false
      },
      download_date: {
        type: Sequelize.DATE,
        allowNull: true
      },
      delete_on: {
        type: Sequelize.DATE,
        allowNull: true
      },
      delete_by: {
        type: Sequelize.STRING(100),
        allowNull: true
      },
      created_on: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      },
      created_by: {
        type: Sequelize.STRING(100),
        allowNull: false
      },
      updated_on: {
        type: Sequelize.DATE,
        allowNull: true
      }
    });

    // Index pour optimiser les performances
    await queryInterface.addIndex('logs_actions', ['numero_facture']);
    await queryInterface.addIndex('logs_actions', ['username']);
    await queryInterface.addIndex('logs_actions', ['download_date']);
    await queryInterface.addIndex('logs_actions', ['delete_on']);
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('logs_actions');
  }
};
