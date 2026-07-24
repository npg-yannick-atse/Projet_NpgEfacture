const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const AutoDownloadFlagged = sequelize.define('AutoDownloadFlagged', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
    numero_facture: { type: DataTypes.STRING(50), allowNull: false, unique: true },
    kind: { type: DataTypes.ENUM('avoir', 'probleme', 'non_fne'), allowNull: false },
    client: { type: DataTypes.STRING(255), allowNull: true },
    type: { type: DataTypes.STRING(10), allowNull: true },
    detail: { type: DataTypes.STRING(255), allowNull: true },
    created_by: { type: DataTypes.STRING(100), allowNull: true },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  }, {
    tableName: 'auto_download_flagged',
    timestamps: false,
    indexes: [{ name: 'idx_auto_flagged_numero', unique: true, fields: ['numero_facture'] }],
  });

  return AutoDownloadFlagged;
};
