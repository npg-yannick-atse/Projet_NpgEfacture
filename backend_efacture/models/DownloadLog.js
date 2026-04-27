'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class DownloadLog extends Model {
    static associate(models) {
      // Définir les associations ici si nécessaire
    }
  }
  
  DownloadLog.init({
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    userId: {
      type: DataTypes.STRING,
      allowNull: false
    },
    action: {
      type: DataTypes.ENUM('DOWNLOAD', 'DELETE'),
      allowNull: false
    },
    documentId: {
      type: DataTypes.STRING,
      allowNull: false
    },
    documentType: {
      type: DataTypes.STRING,
      allowNull: false
    },
    ipAddress: {
      type: DataTypes.STRING,
      allowNull: true
    },
    userAgent: {
      type: DataTypes.TEXT,
      allowNull: true
    }
  }, {
    sequelize,
    modelName: 'DownloadLog',
    tableName: 'download_logs',
    timestamps: true,
    underscored: false
  });

  return DownloadLog;
};
