'use strict';

/**
 * Table de traçage de la validation de réception du BL (Bon de Livraison)
 * par numéro de facture. Double validation SÉQUENTIELLE :
 *   en_attente → valide_logistique (validé par la logistique)
 *              → valide            (puis validé par le commercial)
 *
 * Un seul enregistrement par facture (numero_facture unique).
 * Finalité : traçage seul (qui a validé quoi, quand). Aucun autre effet métier.
 */

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('bl_validations', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false,
      },
      numero_facture: {
        type: Sequelize.STRING(50),
        allowNull: false,
      },
      // Snapshot du/des BL (VGBEL) lus dans SAP au moment de la 1ère validation.
      numero_bl: {
        type: Sequelize.STRING(255),
        allowNull: true,
      },
      statut: {
        type: Sequelize.ENUM('en_attente', 'valide_logistique', 'valide'),
        allowNull: false,
        defaultValue: 'en_attente',
      },
      logistique_valide_by: {
        type: Sequelize.STRING(100),
        allowNull: true,
      },
      logistique_valide_on: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      commercial_valide_by: {
        type: Sequelize.STRING(100),
        allowNull: true,
      },
      commercial_valide_on: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      created_on: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW,
      },
      updated_on: {
        type: Sequelize.DATE,
        allowNull: true,
      },
    });

    await queryInterface.addIndex('bl_validations', ['numero_facture'], {
      name: 'idx_bl_validations_numero_facture',
      unique: true,
    });
    await queryInterface.addIndex('bl_validations', ['statut'], {
      name: 'idx_bl_validations_statut',
    });
  },

  down: async (queryInterface) => {
    await queryInterface.dropTable('bl_validations');
  },
};
