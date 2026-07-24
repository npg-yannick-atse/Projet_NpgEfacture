'use strict';
const { Model, DataTypes } = require('sequelize');

const SapVbpaPartner = (sequelize) => {
  class SapVbpaPartner extends Model {
    static associate(models) {
      // Définir les associations ici si nécessaire
    }
  }
  
  SapVbpaPartner.init({
  id: {
    type: DataTypes.BIGINT.UNSIGNED,
    primaryKey: true,
    autoIncrement: true,
  },
  MANDT: { type: DataTypes.CHAR(3), allowNull: false },
  VBELN: { type: DataTypes.CHAR(10), allowNull: false },
  POSNR: { type: DataTypes.CHAR(6), allowNull: false },
  PARVW: { type: DataTypes.CHAR(2), allowNull: false },
  KUNNR: DataTypes.CHAR(10),
  LIFNR: DataTypes.CHAR(10),
  PERNR: DataTypes.CHAR(8),
  PARNR: DataTypes.CHAR(10),
  ADRNR: DataTypes.CHAR(10),
  ABLAD: DataTypes.STRING(25),
  LAND1: DataTypes.CHAR(3),
  ADRDA: DataTypes.CHAR(1),
  XCPDK: DataTypes.CHAR(1),
  HITYP: DataTypes.CHAR(1),
  PRFRE: DataTypes.CHAR(1),
  BOKRE: DataTypes.CHAR(1),
  HISTUNR: DataTypes.CHAR(2),
  KNREF: DataTypes.STRING(30),
  LZONE: DataTypes.CHAR(10),
  HZUOR: DataTypes.CHAR(2),
  STCEG: DataTypes.STRING(20),
  PARVW_FF: DataTypes.CHAR(2),
  ADRNP: DataTypes.CHAR(10),
  KALE: DataTypes.CHAR(2),
  UPDKZ: DataTypes.CHAR(1),
  NAME1: DataTypes.STRING(70),
  NRART: DataTypes.CHAR(2),
  FEHGR: DataTypes.CHAR(2),
  SPRAS: DataTypes.CHAR(1),
  TELFX: DataTypes.STRING(30),
  TELTX: DataTypes.STRING(30),
  TELX1: DataTypes.STRING(30),
  CNTPA: DataTypes.CHAR(6),
  REFOBJTYPE: DataTypes.CHAR(10),
  REFOBJKEY: DataTypes.STRING(70),
  REFLOGSYS: DataTypes.CHAR(10),
  STCD1: DataTypes.STRING(20),
  STCD2: DataTypes.STRING(20),
  STCD3: DataTypes.STRING(20),
  STCD4: DataTypes.STRING(20),
  STCD5: DataTypes.STRING(20),
  STKZN: DataTypes.CHAR(1),
  STCDT: DataTypes.CHAR(1),
  J_1KFREPRE: DataTypes.CHAR(2),
  J_1KFTBUS: DataTypes.CHAR(4),
  J_1KFTIND: DataTypes.CHAR(4),
}, {
  tableName: 'sap_vbpa_partner',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  sequelize,
  modelName: 'SapVbpaPartner',
  indexes: [
    { name: 'idx_vbpa_vbeln', fields: ['VBELN'] },
  ],
});

  return SapVbpaPartner;
};

// Export the model function for Sequelize initialization
module.exports = SapVbpaPartner;


