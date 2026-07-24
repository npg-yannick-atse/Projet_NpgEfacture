'use strict';

/**
 * Ajoute au catalogue `roles` les permissions de la page "Validation réception BL" :
 *   - bl.view                : accéder à la page / consulter les validations
 *   - bl.validate_logistique : valider la réception BL au niveau Logistique (1ère étape)
 *   - bl.validate_commercial : valider au niveau Commercial (2ème étape, après logistique)
 *
 * Idempotent : on n'insère que les codes absents (le code est unique).
 */
const ROLES_SEED = [
  ['bl.view',                'Voir les validations de réception BL'],
  ['bl.validate_logistique', 'Valider la réception BL (Logistique)'],
  ['bl.validate_commercial', 'Valider la réception BL (Commercial)'],
];

module.exports = {
  up: async (queryInterface) => {
    const codes = ROLES_SEED.map(([code]) => code);
    const existing = await queryInterface.sequelize.query(
      'SELECT code FROM roles WHERE code IN (:codes)',
      {
        replacements: { codes },
        type: queryInterface.sequelize.QueryTypes.SELECT,
      }
    );
    const existingCodes = new Set(existing.map(r => r.code));
    const toInsert = ROLES_SEED
      .filter(([code]) => !existingCodes.has(code))
      .map(([code, label]) => ({ code, label, created_at: new Date() }));

    if (toInsert.length > 0) {
      await queryInterface.bulkInsert('roles', toInsert);
      console.log(`Rôles BL ajoutés : ${toInsert.map(r => r.code).join(', ')}`);
    } else {
      console.log('Rôles BL déjà présents, rien à insérer.');
    }
  },

  down: async (queryInterface) => {
    const codes = ROLES_SEED.map(([code]) => code);
    await queryInterface.bulkDelete('roles', { code: codes });
  },
};
