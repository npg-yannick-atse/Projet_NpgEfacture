'use strict';

/**
 * Ajoute le type 'non_fne' à auto_download_flagged : factures saisies manuellement
 * comme "à ne pas envoyer à la FNE" (en plus des 'avoir' / 'probleme' du job).
 */
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.changeColumn('auto_download_flagged', 'kind', {
      type: Sequelize.ENUM('avoir', 'probleme', 'non_fne'),
      allowNull: false,
    });
  },
  down: async (queryInterface, Sequelize) => {
    await queryInterface.changeColumn('auto_download_flagged', 'kind', {
      type: Sequelize.ENUM('avoir', 'probleme'),
      allowNull: false,
    });
  },
};
