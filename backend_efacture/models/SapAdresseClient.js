'use strict';
const { Model, DataTypes } = require('sequelize');

const SapAdresseClient = (sequelize) => {
  class SapAdresseClient extends Model {
    static associate(models) {}
  }

  SapAdresseClient.init({
    id: {
      type: DataTypes.BIGINT.UNSIGNED,
      primaryKey: true,
      autoIncrement: true,
    },
    KUNNR: {
      type: DataTypes.CHAR(10),
      allowNull: false,
      comment: 'Numéro client SAP (ZKUNNR en entrée)',
    },
    ADRNR: {
      type: DataTypes.CHAR(10),
      allowNull: true,
      comment: 'Numéro d\'adresse SAP',
    },
    TELF1: {
      type: DataTypes.STRING(30),
      allowNull: true,
      comment: 'Numéro de téléphone',
    },
    SMTP_ADDR: {
      type: DataTypes.STRING(200),
      allowNull: true,
      comment: 'Adresse email',
    },
    ORT01: {
      type: DataTypes.STRING(100),
      allowNull: true,
      comment: 'Ville',
    },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
  }, {
    tableName: 'sap_adresse_client',
    timestamps: false,
    sequelize,
    modelName: 'SapAdresseClient',
  });

  return SapAdresseClient;
};

module.exports = SapAdresseClient;
