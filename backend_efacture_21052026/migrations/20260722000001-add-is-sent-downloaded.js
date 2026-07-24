'use strict';

/**
 * Flag `is_sent` sur downloaded_invoices : 1 si la facture a été envoyée AVEC SUCCÈS
 * à la FNE (log SendBy non nul + erreur=0). Permet à la page "Factures téléchargées
 * non envoyées" de filtrer par `WHERE is_sent = 0` (indexé) au lieu d'une anti-jointure
 * NOT EXISTS coûteuse (~1 s sur le volume prod).
 * Maintenu à l'envoi (logSendAction / manualRegisterFne) et au (re)téléchargement.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const table = await queryInterface.describeTable('downloaded_invoices');
    if (!table.is_sent) {
      await queryInterface.addColumn('downloaded_invoices', 'is_sent', {
        type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false,
      });
    }
    const idx = await queryInterface.showIndex('downloaded_invoices');
    if (!idx.some(i => i.name === 'idx_di_is_sent')) {
      await queryInterface.addIndex('downloaded_invoices', ['is_sent'], { name: 'idx_di_is_sent' });
    }

    // Index COUVRANT pour la condition AIRSI (MWAL) de la page téléchargées :
    // rend la requête komv index-only (mesuré : 1092 ms -> 77 ms).
    const kidx = await queryInterface.showIndex('sap_komv_condition');
    if (!kidx.some(i => i.name === 'idx_komv_cover')) {
      await queryInterface.addIndex('sap_komv_condition', ['KSCHL', 'KRECH', 'KNUMV', 'KBETR'], { name: 'idx_komv_cover' });
    }
  },

  async down(queryInterface) {
    try { await queryInterface.removeIndex('downloaded_invoices', 'idx_di_is_sent'); } catch (e) {}
    try { await queryInterface.removeColumn('downloaded_invoices', 'is_sent'); } catch (e) {}
  },
};
