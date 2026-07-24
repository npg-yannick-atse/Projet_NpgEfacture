'use strict';

/**
 * Factures déjà "marquées FNE" dans SAP (BAPI ZBAPI_INFO_FNE_FACTURES, champ TEXT1
 * non vide). Ces factures ne doivent PAS être renvoyées à la FNE.
 */
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('fne_marked_invoices', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
      numero_facture: { type: Sequelize.STRING(50), allowNull: false },
      text1: { type: Sequelize.STRING(255), allowNull: true },
      marked_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
    });
    await queryInterface.addIndex('fne_marked_invoices', ['numero_facture'], {
      name: 'idx_fne_marked_numero', unique: true,
    });
  },
  down: async (queryInterface) => {
    await queryInterface.dropTable('fne_marked_invoices');
  },
};
