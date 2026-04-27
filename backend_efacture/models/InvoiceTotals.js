'use strict';
const { Model, DataTypes } = require('sequelize');

const InvoiceTotals = (sequelize) => {
  class InvoiceTotals extends Model {
    static associate(models) {}
  }

  InvoiceTotals.init({
    id: {
      type: DataTypes.BIGINT.UNSIGNED,
      primaryKey: true,
      autoIncrement: true,
    },
    numero_facture: {
      type: DataTypes.STRING(50),
      allowNull: false,
      comment: 'Numéro de facture',
    },
    point_of_sale: {
      type: DataTypes.STRING(100),
      allowNull: true,
      comment: 'Point de vente associé',
    },
    total_ht: {
      type: DataTypes.DECIMAL(18, 2),
      allowNull: true,
      comment: 'Total HT (somme montants bruts)',
    },
    total_net_ht: {
      type: DataTypes.DECIMAL(18, 2),
      allowNull: true,
      comment: 'Total Net HT (après remises)',
    },
    montant_remise: {
      type: DataTypes.DECIMAL(18, 2),
      allowNull: true,
      comment: 'Montant total des remises',
    },
    tva_rate: {
      type: DataTypes.DECIMAL(5, 2),
      allowNull: true,
      comment: 'Taux de TVA appliqué (%)',
    },
    montant_tva: {
      type: DataTypes.DECIMAL(18, 2),
      allowNull: true,
      comment: 'Montant TVA',
    },
    total_ttc: {
      type: DataTypes.DECIMAL(18, 2),
      allowNull: true,
      comment: 'Total TTC (Net HT + TVA)',
    },
    airsi_rate: {
      type: DataTypes.DECIMAL(5, 2),
      allowNull: true,
      comment: 'Taux AIRSI appliqué (%)',
    },
    montant_airsi: {
      type: DataTypes.DECIMAL(18, 2),
      allowNull: true,
      comment: 'Montant AIRSI',
    },
    total_a_payer: {
      type: DataTypes.DECIMAL(18, 2),
      allowNull: false,
      comment: 'Total à payer (TTC + AIRSI)',
    },
    source: {
      type: DataTypes.ENUM('sap', 'template'),
      allowNull: false,
      defaultValue: 'sap',
      comment: 'Source de la facture',
    },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
  }, {
    tableName: 'invoice_totals',
    timestamps: false,
    sequelize,
    modelName: 'InvoiceTotals',
  });

  return InvoiceTotals;
};

module.exports = InvoiceTotals;
