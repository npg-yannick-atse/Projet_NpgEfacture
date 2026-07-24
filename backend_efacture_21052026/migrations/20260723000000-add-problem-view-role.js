'use strict';

/**
 * Permission d'accès à la page "Factures Problème" :
 *   - problem.view : voir la page des factures en erreur (relance/suppression).
 * Idempotent : insérée seulement si absente.
 */
const ROLES_SEED = [
  ['problem.view', 'Voir les factures Problème (envois en erreur)'],
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
      console.log(`Rôle ajouté : ${toInsert.map(r => r.code).join(', ')}`);
    }
  },

  down: async (queryInterface) => {
    await queryInterface.bulkDelete('roles', { code: ROLES_SEED.map(([code]) => code) });
  },
};
