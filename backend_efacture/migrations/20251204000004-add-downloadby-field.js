'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Ajouter la colonne downloadBy
    await queryInterface.addColumn('logs_actions', 'downloadBy', {
      type: Sequelize.STRING(100),
      allowNull: true
    });

    // Ajouter un index pour optimiser les requêtes sur downloadBy
    await queryInterface.addIndex('logs_actions', ['downloadBy']);
  },

  down: async (queryInterface, Sequelize) => {
    // Supprimer la colonne en cas de rollback
    await queryInterface.removeColumn('logs_actions', 'downloadBy');
  }
};
