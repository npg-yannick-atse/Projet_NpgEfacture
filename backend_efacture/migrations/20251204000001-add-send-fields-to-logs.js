'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Ajouter les colonnes SendBy et SendOn
    await queryInterface.addColumn('logs_actions', 'SendBy', {
      type: Sequelize.STRING(100),
      allowNull: true
    });

    await queryInterface.addColumn('logs_actions', 'SendOn', {
      type: Sequelize.DATE,
      allowNull: true
    });

    // Ajouter un index pour optimiser les requêtes sur SendBy
    await queryInterface.addIndex('logs_actions', ['SendBy']);
  },

  down: async (queryInterface, Sequelize) => {
    // Supprimer les colonnes en cas de rollback
    await queryInterface.removeColumn('logs_actions', 'SendBy');
    await queryInterface.removeColumn('logs_actions', 'SendOn');
  }
};
