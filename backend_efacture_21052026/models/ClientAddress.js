'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class ClientAddress extends Model {
    static associate(models) {
      // Définir les associations ici si nécessaire
    }
  }
  
  ClientAddress.init({
    kunnr: {
      type: DataTypes.STRING(10),
      primaryKey: true,
      allowNull: false,
      field: 'KUNNR'
    },
    adrnr: {
      type: DataTypes.STRING(10),
      field: 'ADRNR'
    },
    telf1: {
      type: DataTypes.STRING(16),
      field: 'TELF1'
    },
    smtpAddr: {
      type: DataTypes.STRING(241),
      field: 'SMTP_ADDR'
    },
    ort01: {
      type: DataTypes.STRING(35),
      field: 'ORT01'
    },
    createdAt: {
      type: DataTypes.DATE,
      field: 'CREATED_AT'
    },
    updatedAt: {
      type: DataTypes.DATE,
      field: 'UPDATED_AT'
    }
  }, {
    sequelize,
    modelName: 'ClientAddress',
    tableName: 'ZADRESSE_CLIENT',
    timestamps: true,
    createdAt: 'createdAt',
    updatedAt: 'updatedAt'
  });

  return ClientAddress;
};