'use strict';

/**
 * Page "Factures Non FNE" :
 *   1) Traçabilité : colonne created_by (qui a enregistré la facture en liste noire).
 *   2) Autorisations : rôles dans le catalogue `roles` pour gérer l'accès par permission
 *      (au lieu d'un accès admin en dur) :
 *        - non_fne.view   : consulter la liste des factures Non FNE
 *        - non_fne.manage : ajouter / retirer des factures de la liste noire
 *
 * Idempotent : colonne ajoutée seulement si absente, rôles insérés seulement si absents.
 */
const ROLES_SEED = [
  ['non_fne.view',   'Voir les factures Non FNE'],
  ['non_fne.manage', 'Gérer les factures Non FNE (liste noire)'],
];

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // 1) Colonne de traçabilité
    const table = await queryInterface.describeTable('auto_download_flagged');
    if (!table.created_by) {
      await queryInterface.addColumn('auto_download_flagged', 'created_by', {
        type: Sequelize.STRING(100),
        allowNull: true,
      });
    }

    // 2) Rôles d'autorisation (insertion des codes absents seulement)
    const codes = ROLES_SEED.map(([code]) => code);
    const existing = await queryInterface.sequelize.query(
      'SELECT code FROM roles WHERE code IN (:codes)',
      { replacements: { codes }, type: queryInterface.sequelize.QueryTypes.SELECT }
    );
    const existingCodes = new Set(existing.map(r => r.code));
    const toInsert = ROLES_SEED
      .filter(([code]) => !existingCodes.has(code))
      .map(([code, label]) => ({ code, label, created_at: new Date() }));

    if (toInsert.length > 0) {
      await queryInterface.bulkInsert('roles', toInsert);
      console.log(`Rôles Non FNE ajoutés : ${toInsert.map(r => r.code).join(', ')}`);
    }
  },

  down: async (queryInterface) => {
    await queryInterface.removeColumn('auto_download_flagged', 'created_by');
    await queryInterface.bulkDelete('roles', { code: ROLES_SEED.map(([code]) => code) });
  },
};
