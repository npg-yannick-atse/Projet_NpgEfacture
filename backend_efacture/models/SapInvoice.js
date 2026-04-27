'use strict';
const { Model, DataTypes } = require('sequelize');

const SapInvoice = (sequelize) => {
  class SapInvoice extends Model {
    static associate(models) {
      // Définir les associations ici si nécessaire
    }
  }
  
  SapInvoice.init({
  id: {
    type: DataTypes.BIGINT.UNSIGNED,
    primaryKey: true,
    autoIncrement: true,
  },
  invoice_number: {
    type: DataTypes.STRING(20),
    allowNull: false,
  },
  fiscal_year: {
    type: DataTypes.STRING(4),
    allowNull: true,
  },
  company_code: {
    type: DataTypes.STRING(4),
    allowNull: true,
  },
  currency: {
    type: DataTypes.STRING(5),
    allowNull: true,
  },
  net_value: {
    type: DataTypes.DECIMAL(18, 2),
    allowNull: true,
  },
  gross_value: {
    type: DataTypes.DECIMAL(18, 2),
    allowNull: true,
  },
  billing_date: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  vbrk_e_json: {
    type: DataTypes.JSON,
    allowNull: true,
  },
  vbuk_e_json: {
    type: DataTypes.JSON,
    allowNull: true,
  },
}, {
  tableName: 'sap_invoice',
  timestamps: false,
  sequelize,
  modelName: 'SapInvoice',
});

  return SapInvoice;
};

// Export the model function for Sequelize initialization
module.exports = SapInvoice;


