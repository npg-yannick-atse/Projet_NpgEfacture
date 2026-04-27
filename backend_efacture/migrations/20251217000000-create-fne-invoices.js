'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Créer la table fne_invoices
    await queryInterface.createTable('fne_invoices', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false
      },
      numero_facture: {
        type: Sequelize.STRING(50),
        allowNull: false,
        comment: 'Numéro de facture SAP'
      },
      fne_invoice_id: {
        type: Sequelize.STRING(100),
        allowNull: false,
        unique: true,
        comment: 'ID de la facture dans le système FNE'
      },
      fne_reference: {
        type: Sequelize.STRING(100),
        allowNull: true,
        comment: 'Référence FNE de la facture'
      },
      fne_ncc: {
        type: Sequelize.STRING(50),
        allowNull: true,
        comment: 'NCC FNE'
      },
      fne_token: {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: 'Token FNE pour vérification'
      },
      api_response: {
        type: Sequelize.JSON,
        allowNull: true,
        comment: 'Réponse complète de l\'API FNE'
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

    // Ajouter des index
    await queryInterface.addIndex('fne_invoices', ['numero_facture']);
    await queryInterface.addIndex('fne_invoices', ['fne_invoice_id']);

    // Créer la table fne_invoice_items
    await queryInterface.createTable('fne_invoice_items', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false
      },
      fne_invoice_id: {
        type: Sequelize.STRING(100),
        allowNull: false,
        comment: 'ID de la facture FNE (clé étrangère vers fne_invoices.fne_invoice_id)'
      },
      fne_item_id: {
        type: Sequelize.STRING(100),
        allowNull: false,
        comment: 'ID de l\'article dans le système FNE'
      },
      reference: {
        type: Sequelize.STRING(100),
        allowNull: true,
        comment: 'Référence de l\'article'
      },
      description: {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: 'Description de l\'article'
      },
      quantity: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: true,
        comment: 'Quantité initiale de l\'article'
      },
      item_data: {
        type: Sequelize.JSON,
        allowNull: true,
        comment: 'Données complètes de l\'article depuis FNE'
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

    // Ajouter des index
    await queryInterface.addIndex('fne_invoice_items', ['fne_invoice_id']);
    await queryInterface.addIndex('fne_invoice_items', ['fne_item_id']);
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('fne_invoice_items');
    await queryInterface.dropTable('fne_invoices');
  }
};

