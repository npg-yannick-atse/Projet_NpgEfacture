'use strict';
const { Model, DataTypes } = require('sequelize');

const SapReferenceCmde = (sequelize) => {
  class SapReferenceCmde extends Model {
    static associate(models) {}
  }

  SapReferenceCmde.init({
    id: {
      type: DataTypes.BIGINT.UNSIGNED,
      primaryKey: true,
      autoIncrement: true,
    },
    VBELN: {
      type: DataTypes.CHAR(10),
      allowNull: false,
      comment: 'Numéro de facture (ZFACTURE en entrée)',
    },
    ZREFERENCE: {
      type: DataTypes.STRING(50),
      allowNull: true,
      comment: 'Référence de commande retournée par ZBAPI_REFERENCE_CMDE',
    },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
  }, {
    tableName: 'sap_reference_cmde',
    timestamps: false,
    sequelize,
    modelName: 'SapReferenceCmde',
  });

  return SapReferenceCmde;
};

module.exports = SapReferenceCmde;
