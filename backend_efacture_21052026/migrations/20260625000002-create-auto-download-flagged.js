'use strict';

/**
 * Factures signalées par le job de téléchargement auto (avoirs ou factures en
 * problème) — sert à NE PAS re-notifier la même facture à chaque tour.
 */
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('auto_download_flagged', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
      numero_facture: { type: Sequelize.STRING(50), allowNull: false },
      kind: { type: Sequelize.ENUM('avoir', 'probleme'), allowNull: false },
      client: { type: Sequelize.STRING(255), allowNull: true },
      type: { type: Sequelize.STRING(10), allowNull: true },
      detail: { type: Sequelize.STRING(255), allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
    });
    await queryInterface.addIndex('auto_download_flagged', ['numero_facture'], {
      name: 'idx_auto_flagged_numero', unique: true,
    });
  },
  down: async (queryInterface) => {
    await queryInterface.dropTable('auto_download_flagged');
  },
};
