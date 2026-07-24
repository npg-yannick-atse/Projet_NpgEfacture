'use strict';
const { Model, DataTypes } = require('sequelize');

const TemplateInvoiceDetail = (sequelize) => {
  class TemplateInvoiceDetail extends Model {
    static associate(models) {}
  }

  TemplateInvoiceDetail.init({
    id: {
      type: DataTypes.BIGINT.UNSIGNED,
      primaryKey: true,
      autoIncrement: true,
    },
    numero_facture: {
      type: DataTypes.STRING(50),
      allowNull: false,
      comment: 'Numéro de facture (ex: TMP_xxx)',
    },
    ligne_numero: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: 'Numéro de la ligne',
    },
    reference: {
      type: DataTypes.STRING(100),
      allowNull: true,
      comment: 'Référence article',
    },
    designation: {
      type: DataTypes.STRING(255),
      allowNull: true,
      comment: 'Désignation / libellé article',
    },
    quantite: {
      type: DataTypes.DECIMAL(15, 3),
      allowNull: true,
      comment: 'Quantité',
    },
    unite: {
      type: DataTypes.STRING(20),
      allowNull: true,
      comment: 'Unité de mesure',
    },
    prix_unitaire_ht: {
      type: DataTypes.DECIMAL(18, 2),
      allowNull: true,
      comment: 'Prix unitaire HT',
    },
    remise_pct: {
      type: DataTypes.DECIMAL(5, 2),
      allowNull: true,
      comment: 'Pourcentage de remise',
    },
    montant_brut: {
      type: DataTypes.DECIMAL(18, 2),
      allowNull: true,
      comment: 'Montant brut (PU x Qté)',
    },
    montant_net: {
      type: DataTypes.DECIMAL(18, 2),
      allowNull: true,
      comment: 'Montant net (après remise)',
    },
    tva_pct: {
      type: DataTypes.DECIMAL(5, 2),
      allowNull: true,
      comment: 'Taux TVA (%)',
    },
    airsi_pct: {
      type: DataTypes.DECIMAL(5, 2),
      allowNull: true,
      comment: 'Taux AIRSI (%)',
    },
    client_name: {
      type: DataTypes.STRING(200),
      allowNull: true,
      comment: 'Nom du client',
    },
    client_email: {
      type: DataTypes.STRING(200),
      allowNull: true,
      comment: 'Email du client',
    },
    client_phone: {
      type: DataTypes.STRING(50),
      allowNull: true,
      comment: 'Téléphone du client',
    },
    client_ncc: {
      type: DataTypes.STRING(50),
      allowNull: true,
      comment: 'NCC du client',
    },
    template: {
      type: DataTypes.STRING(50),
      allowNull: true,
      comment: 'Type de template (B2B, B2C, etc.)',
    },
    payment_method: {
      type: DataTypes.STRING(50),
      allowNull: true,
      comment: 'Mode de paiement',
    },
    point_of_sale: {
      type: DataTypes.STRING(100),
      allowNull: true,
      comment: 'Point de vente',
    },
    is_rne: {
      type: DataTypes.STRING(10),
      allowNull: true,
      comment: 'Statut RNE (True/False)',
    },
    username: {
      type: DataTypes.STRING(100),
      allowNull: true,
      comment: 'Utilisateur qui a importé',
    },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
  }, {
    tableName: 'template_invoice_details',
    timestamps: false,
    sequelize,
    modelName: 'TemplateInvoiceDetail',
  });

  return TemplateInvoiceDetail;
};

module.exports = TemplateInvoiceDetail;
