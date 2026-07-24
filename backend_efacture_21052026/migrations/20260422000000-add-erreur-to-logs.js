'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('logs_actions', 'erreur', {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      comment: "Indique si l'envoi a échoué (true/1) ou réussi (false/0)"
    });

    await queryInterface.addIndex('logs_actions', ['erreur']);
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeIndex('logs_actions', ['erreur']);
    await queryInterface.removeColumn('logs_actions', 'erreur');
  }
};
