'use strict';

/**
 * Ajoute la colonne fne_response_time_ms sur logs_actions.
 * Enregistre la durée de l'appel HTTP à la FNE pour chaque envoi / avoir / annulation.
 * Null si l'action n'implique pas d'appel FNE (téléchargement, suppression).
 */
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('logs_actions', 'fne_response_time_ms', {
      type: Sequelize.INTEGER,
      allowNull: true,
      comment: "Durée de l'appel FNE en millisecondes (null si non applicable)",
    });
    await queryInterface.addIndex('logs_actions', ['fne_response_time_ms']);
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeIndex('logs_actions', ['fne_response_time_ms']);
    await queryInterface.removeColumn('logs_actions', 'fne_response_time_ms');
  },
};
