'use strict';

/**
 * Pointage d'impression : compteur du nombre d'impressions de la facture FNE
 * (page Statut Facture). Incrémenté à chaque impression.
 */
module.exports = {
  up: async (queryInterface, Sequelize) => {
    const table = await queryInterface.describeTable('bl_validations');
    if (!table.print_count) {
      await queryInterface.addColumn('bl_validations', 'print_count', {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      });
    }
  },
  down: async (queryInterface) => {
    await queryInterface.removeColumn('bl_validations', 'print_count');
  },
};
