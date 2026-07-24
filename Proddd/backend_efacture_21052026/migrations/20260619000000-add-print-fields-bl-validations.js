'use strict';

/**
 * Ajoute le traçage de l'impression de la facture FNE sur bl_validations :
 *   imprime_by  : qui a imprimé (username)
 *   imprime_on  : quand (date/heure)
 */

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('bl_validations', 'imprime_by', {
      type: Sequelize.STRING(100),
      allowNull: true,
    });
    await queryInterface.addColumn('bl_validations', 'imprime_on', {
      type: Sequelize.DATE,
      allowNull: true,
    });
  },

  down: async (queryInterface) => {
    await queryInterface.removeColumn('bl_validations', 'imprime_by');
    await queryInterface.removeColumn('bl_validations', 'imprime_on');
  },
};
