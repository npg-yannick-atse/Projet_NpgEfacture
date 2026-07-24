'use strict';

/**
 * Colonnes d'AFFICHAGE précalculées sur logs_actions, pour que la page
 * "Factures envoyées" n'ait plus à charger / parser api_response (TEXT ~9,5 Ko)
 * ni downloaded_invoices.data pour construire la liste.
 * Remplies à l'envoi + par un backfill (scripts/backfill_display_columns.js).
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const table = await queryInterface.describeTable('logs_actions');
    const addIfMissing = async (name, spec) => {
      if (!table[name]) await queryInterface.addColumn('logs_actions', name, spec);
    };
    await addIfMissing('total_ttc', { type: Sequelize.DECIMAL(15, 3), allowNull: true });
    await addIfMissing('point_of_sale', { type: Sequelize.STRING(80), allowNull: true });
    await addIfMissing('client_name', { type: Sequelize.STRING(255), allowNull: true });
    await addIfMissing('is_manual', { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false });
    await addIfMissing('is_cancellation', { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false });
    await addIfMissing('fne_invoice_id', { type: Sequelize.STRING(100), allowNull: true });
    await addIfMissing('reference', { type: Sequelize.STRING(100), allowNull: true });
  },

  async down(queryInterface) {
    for (const c of ['total_ttc', 'point_of_sale', 'client_name', 'is_manual', 'is_cancellation', 'fne_invoice_id', 'reference']) {
      try { await queryInterface.removeColumn('logs_actions', c); } catch (e) { /* ignore */ }
    }
  },
};
