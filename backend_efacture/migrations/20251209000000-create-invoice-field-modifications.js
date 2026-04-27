'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('InvoiceFieldModifications', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true
      },
      invoice_number: {
        type: Sequelize.STRING,
        allowNull: false,
        comment: 'Numéro de la facture'
      },
      field_name: {
        type: Sequelize.STRING,
        allowNull: false,
        comment: 'Nom du champ modifié (ClientEmail, ClientPhone, Template, etc.)'
      },
      old_value: {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: 'Ancienne valeur du champ'
      },
      new_value: {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: 'Nouvelle valeur du champ'
      },
      user_id: {
        type: Sequelize.STRING,
        allowNull: false,
        comment: 'Identifiant de l\'utilisateur qui a fait la modification'
      },
      user_name: {
        type: Sequelize.STRING,
        allowNull: true,
        comment: 'Nom de l\'utilisateur qui a fait la modification'
      },
      modification_date: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW,
        comment: 'Date et heure de la modification'
      },
      apply_to_all: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        comment: 'Si la modification doit être appliquée à toutes les lignes de la facture'
      },
      line_number: {
        type: Sequelize.INTEGER,
        allowNull: true,
        comment: 'Numéro de la ligne modifiée (si apply_to_all est false)'
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW
      }
    });

    // Ajout d'indexes pour optimiser les performances
    await queryInterface.addIndex('InvoiceFieldModifications', ['invoice_number']);
    await queryInterface.addIndex('InvoiceFieldModifications', ['field_name']);
    await queryInterface.addIndex('InvoiceFieldModifications', ['user_id']);
    await queryInterface.addIndex('InvoiceFieldModifications', ['modification_date']);
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('InvoiceFieldModifications');
  }
};
