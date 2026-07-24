'use strict';
const { Model, DataTypes } = require('sequelize');

const FneInvoice = (sequelize) => {
  class FneInvoice extends Model {
    static associate(models) {
      // Association avec les articles
      FneInvoice.hasMany(models.FneInvoiceItem, {
        foreignKey: 'fne_invoice_id',
        sourceKey: 'fne_invoice_id',
        as: 'items'
      });
    }
  }

  FneInvoice.init({
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      allowNull: false
    },
    numero_facture: {
      type: DataTypes.STRING(50),
      allowNull: false,
      comment: 'Numéro de facture SAP'
    },
    fne_invoice_id: {
      type: DataTypes.STRING(100),
      allowNull: false,
      unique: true,  // L'index UNIQUE est défini ici
      comment: 'ID de la facture dans le système FNE'
    },
    fne_reference: {
      type: DataTypes.STRING(100),
      allowNull: true,
      comment: 'Référence FNE de la facture'
    },
    fne_ncc: {
      type: DataTypes.STRING(50),
      allowNull: true,
      comment: 'NCC FNE'
    },
    fne_token: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'Token FNE pour vérification'
    },
    api_response: {
      type: DataTypes.JSON,
      allowNull: true,
      comment: 'Réponse complète de l\'API FNE'
    },
    type: {
      type: DataTypes.ENUM('invoice', 'refund'),
      allowNull: false,
      defaultValue: 'invoice',
      comment: "Type de document FNE : 'invoice' = facture, 'refund' = avoir"
    }
  }, {
    sequelize,
    modelName: 'FneInvoice',
    tableName: 'fne_invoices',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
      {
        name: 'idx_numero_facture',
        fields: ['numero_facture']
      }
      // L'index unique sur fne_invoice_id est déjà défini dans la colonne
    ]
  });

  return FneInvoice;
};

module.exports = FneInvoice;

