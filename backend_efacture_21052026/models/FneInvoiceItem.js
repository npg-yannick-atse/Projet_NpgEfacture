'use strict';
const { Model, DataTypes } = require('sequelize');

const FneInvoiceItem = (sequelize) => {
  class FneInvoiceItem extends Model {
    static associate(models) {
      // Association avec la facture
      FneInvoiceItem.belongsTo(models.FneInvoice, {
        foreignKey: 'fne_invoice_id',
        targetKey: 'fne_invoice_id',
        as: 'invoice'
      });
    }
  }

  FneInvoiceItem.init({
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      allowNull: false
    },
    fne_invoice_id: {
      type: DataTypes.STRING(100),
      allowNull: false,
      comment: 'ID de la facture FNE'
    },
    fne_item_id: {
      type: DataTypes.STRING(100),
      allowNull: false,
      comment: 'ID de l\'article dans le système FNE'
    },
    reference: {
      type: DataTypes.STRING(100),
      allowNull: true,
      comment: 'Référence de l\'article'
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'Description de l\'article'
    },
    quantity: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
      comment: 'Quantité initiale de l\'article'
    },
    item_data: {
      type: DataTypes.JSON,
      allowNull: true,
      comment: 'Données complètes de l\'article depuis FNE'
    }
  }, {
    sequelize,
    modelName: 'FneInvoiceItem',
    tableName: 'fne_invoice_items',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
      {
        fields: ['fne_invoice_id']
      },
      {
        fields: ['fne_item_id']
      }
    ]
  });

  return FneInvoiceItem;
};

module.exports = FneInvoiceItem;

