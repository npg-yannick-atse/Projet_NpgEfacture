'use strict';

/**
 * Ajoute la 3ème étape de validation : Comptabilité.
 * Flux séquentiel : en_attente -> valide_logistique -> valide_commercial -> valide (complet)
 *
 * - nouveau statut 'valide_commercial' inséré entre commercial et complet
 * - colonnes comptabilite_valide_by / comptabilite_valide_on
 * - rôle bl.validate_comptabilite
 */

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.changeColumn('bl_validations', 'statut', {
      type: Sequelize.ENUM('en_attente', 'valide_logistique', 'valide_commercial', 'valide'),
      allowNull: false,
      defaultValue: 'en_attente',
    });

    await queryInterface.addColumn('bl_validations', 'comptabilite_valide_by', {
      type: Sequelize.STRING(100),
      allowNull: true,
    });
    await queryInterface.addColumn('bl_validations', 'comptabilite_valide_on', {
      type: Sequelize.DATE,
      allowNull: true,
    });

    // Données existantes : les anciennes 'valide' (= logistique + commercial sous l'ancien
    // schéma à 2 étapes) deviennent 'valide_commercial' (la compta n'existait pas encore).
    await queryInterface.sequelize.query(
      "UPDATE bl_validations SET statut = 'valide_commercial' WHERE statut = 'valide' AND comptabilite_valide_by IS NULL"
    );

    // Rôle
    const existing = await queryInterface.sequelize.query(
      "SELECT code FROM roles WHERE code = 'bl.validate_comptabilite'",
      { type: queryInterface.sequelize.QueryTypes.SELECT }
    );
    if (!existing.length) {
      await queryInterface.bulkInsert('roles', [{
        code: 'bl.validate_comptabilite',
        label: 'Valider la réception BL (Comptabilité)',
        created_at: new Date(),
      }]);
    }
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeColumn('bl_validations', 'comptabilite_valide_by');
    await queryInterface.removeColumn('bl_validations', 'comptabilite_valide_on');
    await queryInterface.changeColumn('bl_validations', 'statut', {
      type: Sequelize.ENUM('en_attente', 'valide_logistique', 'valide'),
      allowNull: false,
      defaultValue: 'en_attente',
    });
    await queryInterface.bulkDelete('roles', { code: 'bl.validate_comptabilite' });
  },
};
