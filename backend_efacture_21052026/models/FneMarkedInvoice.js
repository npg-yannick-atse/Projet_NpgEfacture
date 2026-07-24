const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const FneMarkedInvoice = sequelize.define('FneMarkedInvoice', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
    numero_facture: { type: DataTypes.STRING(50), allowNull: false, unique: true },
    text1: { type: DataTypes.STRING(255), allowNull: true },
    marked_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  }, {
    tableName: 'fne_marked_invoices',
    timestamps: false,
    indexes: [{ name: 'idx_fne_marked_numero', unique: true, fields: ['numero_facture'] }],
  });

  return FneMarkedInvoice;
};
