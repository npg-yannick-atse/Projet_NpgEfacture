'use strict';

/**
 * Ajoute la colonne `type` à fne_invoices pour distinguer factures et avoirs.
 *   - 'invoice' (défaut) : facture initiale signée par la FNE
 *   - 'refund'           : avoir (note de crédit) signé par la FNE
 *
 * Toutes les lignes existantes sont rétroactivement marquées 'invoice'
 * (puisque jusqu'ici la table ne stockait que les factures).
 */
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('fne_invoices', 'type', {
      type: Sequelize.ENUM('invoice', 'refund'),
      allowNull: false,
      defaultValue: 'invoice',
      comment: "Type de document FNE : 'invoice' = facture, 'refund' = avoir",
    });

    await queryInterface.addIndex('fne_invoices', ['type'], { name: 'idx_fne_invoices_type' });
  },

  down: async (queryInterface) => {
    await queryInterface.removeIndex('fne_invoices', 'idx_fne_invoices_type');
    await queryInterface.removeColumn('fne_invoices', 'type');
    // Nettoyer le type ENUM côté MySQL (ne pas planter sur dialectes sans ENUM)
    try {
      await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_fne_invoices_type";');
    } catch (e) { /* MySQL n'a pas de DROP TYPE, ignore */ }
  },
};
