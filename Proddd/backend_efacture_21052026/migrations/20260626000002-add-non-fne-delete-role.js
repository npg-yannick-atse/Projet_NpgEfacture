'use strict';

/**
 * Permission dédiée à la SUPPRESSION d'une facture de la liste "Non FNE".
 *   - non_fne.delete : retirer une facture de la liste noire
 * (distincte de non_fne.manage qui couvre l'ajout / la mise à jour)
 *
 * Idempotent : insertion seulement si le code est absent.
 */
const ROLES_SEED = [
  ['non_fne.delete', 'Supprimer une facture Non FNE (liste noire)'],
];

module.exports = {
  up: async (queryInterface) => {
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
      console.log(`Rôle Non FNE ajouté : ${toInsert.map(r => r.code).join(', ')}`);
    }
  },

  down: async (queryInterface) => {
    await queryInterface.bulkDelete('roles', { code: ROLES_SEED.map(([code]) => code) });
  },
};
