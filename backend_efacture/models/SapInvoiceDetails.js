const { DataTypes } = require('sequelize');
const db = require('../db/db');

const baseFields = {
  id: {
    type: DataTypes.BIGINT.UNSIGNED,
    primaryKey: true,
    autoIncrement: true,
  },
  invoice_id: {
    type: DataTypes.BIGINT.UNSIGNED,
    allowNull: false,
  },
  row_index: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  data: {
    type: DataTypes.JSON,
    allowNull: false,
  },
};

const makeModel = (name, tableName) => {
  return db.define(name, baseFields, {
    tableName,
    timestamps: false,
  });
};

const SapInvoiceXvbrk = makeModel('SapInvoiceXvbrk', 'sap_invoice_xvbrk');
const SapInvoiceXvbrp = makeModel('SapInvoiceXvbrp', 'sap_invoice_xvbrp');
const SapInvoiceXvbpa = makeModel('SapInvoiceXvbpa', 'sap_invoice_xvbpa');
const SapInvoiceXkomv = makeModel('SapInvoiceXkomv', 'sap_invoice_xkomv');
const SapInvoiceXkomfk = makeModel('SapInvoiceXkomfk', 'sap_invoice_xkomfk');
const SapInvoiceXthead = makeModel('SapInvoiceXthead', 'sap_invoice_xthead');
const SapInvoiceXvbfs = makeModel('SapInvoiceXvbfs', 'sap_invoice_xvbfs');
const SapInvoiceXvbss = makeModel('SapInvoiceXvbss', 'sap_invoice_xvbss');

module.exports = {
  SapInvoiceXvbrk,
  SapInvoiceXvbrp,
  SapInvoiceXvbpa,
  SapInvoiceXkomv,
  SapInvoiceXkomfk,
  SapInvoiceXthead,
  SapInvoiceXvbfs,
  SapInvoiceXvbss,
};


