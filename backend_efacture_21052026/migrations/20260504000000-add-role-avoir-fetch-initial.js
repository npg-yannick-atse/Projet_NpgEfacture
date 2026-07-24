'use strict';

/**
 * Ajoute le rôle `avoir.fetch_initial` au catalogue.
 * Permet de restreindre la récupération automatique de la facture initiale
 * depuis SAP lorsqu'un avoir est bloqué (modal "Téléchargement de l'avoir bloqué").
 */
const NEW_ROLE = {
  code: 'avoir.fetch_initial',
  label: 'Récupérer la facture initiale d\'un avoir bloqué',
};

module.exports = {
  up: async (queryInterface) => {
    const [existing] = await queryInterface.sequelize.query(
      'SELECT id FROM roles WHERE code = :code LIMIT 1',
      { replacements: { code: NEW_ROLE.code } }
    );
    if (existing.length > 0) return;

    await queryInterface.bulkInsert('roles', [{
      code: NEW_ROLE.code,
      label: NEW_ROLE.label,
      created_at: new Date(),
    }]);
  },

  down: async (queryInterface) => {
    await queryInterface.bulkDelete('roles', { code: NEW_ROLE.code });
  },
};
