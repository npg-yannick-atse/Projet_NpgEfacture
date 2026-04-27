'use strict';
const { Model, DataTypes } = require('sequelize');

const SapKomvCondition = (sequelize) => {
  class SapKomvCondition extends Model {
    static associate(models) {
      // Définir les associations ici si nécessaire
    }
  }
  
  // Méthode pour obtenir la valeur de remise ZREM selon les conditions spécifiées
  SapKomvCondition.getZremValue = async function(knumv) {
    try {
      const condition = await this.findOne({
        where: {
          KNUMV: knumv,
          KSCHL: 'ZR01',
          KINAK: 'A'
        },
        attributes: ['KBETR'],
        raw: true
      });

      if (condition && condition.KBETR !== null) {
        // Convertir KBETR en nombre, diviser par 100 et arrondir à 2 décimales
        const kbetrValue = parseFloat(condition.KBETR);
        return (kbetrValue / 100).toFixed(2);
      }
      return '0.00';
    } catch (error) {
      console.error('Erreur lors de la récupération de la remise ZREM:', error);
      return '0.00';
    }
  };

  SapKomvCondition.init({
  id: {
    type: DataTypes.BIGINT.UNSIGNED,
    primaryKey: true,
    autoIncrement: true,
  },
  MANDT: { type: DataTypes.CHAR(3), allowNull: false },
  KNUMV: { type: DataTypes.CHAR(10), allowNull: false },
  KPOSN: { type: DataTypes.CHAR(6), allowNull: false },
  STUNR: { type: DataTypes.CHAR(3), allowNull: false },
  ZAEHK: { type: DataTypes.CHAR(2), allowNull: false },
  KAPPL: DataTypes.CHAR(2),
  KSCHL: DataTypes.CHAR(4),
  KDATU: DataTypes.CHAR(8),
  KRECH: DataTypes.CHAR(1),
  KAWRT: DataTypes.DECIMAL(18, 2),
  KBETR: DataTypes.DECIMAL(18, 2),
  WAERS: DataTypes.CHAR(5),
  KKURS: DataTypes.DECIMAL(15, 5),
  KPEIN: DataTypes.DECIMAL(15, 3),
  KMEIN: DataTypes.CHAR(3),
  KUMZA: DataTypes.DECIMAL(15, 3),
  KUMNE: DataTypes.DECIMAL(15, 3),
  KNTYP: DataTypes.CHAR(1),
  KSTAT: DataTypes.CHAR(1),
  KNPRS: DataTypes.CHAR(1),
  KRUEK: DataTypes.CHAR(1),
  KRELI: DataTypes.CHAR(1),
  KHERK: DataTypes.CHAR(1),
  KGRPE: DataTypes.CHAR(2),
  KOUPD: DataTypes.CHAR(1),
  KOLNR: DataTypes.CHAR(2),
  KNUMH: DataTypes.CHAR(10),
  KOPOS: DataTypes.CHAR(2),
  KVSL1: DataTypes.CHAR(4),
  SAKN1: DataTypes.CHAR(10),
  MWSK1: DataTypes.CHAR(2),
  KVSL2: DataTypes.CHAR(4),
  SAKN2: DataTypes.CHAR(10),
  MWSK2: DataTypes.CHAR(2),
  LIFNR: DataTypes.CHAR(10),
  KUNNR: DataTypes.CHAR(10),
  KDIFF: DataTypes.DECIMAL(18, 2),
  KWERT: DataTypes.DECIMAL(18, 2),
  KSTEU: DataTypes.CHAR(1),
  KINAK: DataTypes.CHAR(1),
  KOAID: DataTypes.CHAR(1),
  ZAEKO: DataTypes.CHAR(2),
  KMXAW: DataTypes.DECIMAL(18, 2),
  KMXWR: DataTypes.DECIMAL(18, 2),
  KFAKTOR: DataTypes.DECIMAL(18, 3),
  KDUPL: DataTypes.CHAR(1),
  KFAKTOR1: DataTypes.DECIMAL(18, 3),
  KZBZG: DataTypes.CHAR(1),
  KSTBS: DataTypes.DECIMAL(18, 2),
  KONMS: DataTypes.CHAR(3),
  KONWS: DataTypes.CHAR(5),
  KAWRT_K: DataTypes.DECIMAL(18, 2),
  KWAEH: DataTypes.CHAR(5),
  KWERT_K: DataTypes.DECIMAL(18, 2),
  KFKIV: DataTypes.CHAR(1),
  KVARC: DataTypes.CHAR(1),
  KMPRS: DataTypes.CHAR(1),
  PRSQU: DataTypes.CHAR(1),
  VARCOND: DataTypes.CHAR(1),
  STUFE: DataTypes.CHAR(1),
  WEGXX: DataTypes.CHAR(1),
  KTREL: DataTypes.CHAR(1),
  MDFLG: DataTypes.CHAR(1),
  TXJLV: DataTypes.STRING(15),
  KBFLAG: DataTypes.BLOB,
  KOLNR3: DataTypes.CHAR(3),
  PRSCH: DataTypes.CHAR(1),
  KOFRM: DataTypes.CHAR(3),
  STFKZ: DataTypes.CHAR(1),
  KSTBM: DataTypes.DECIMAL(18, 2),
  KSTBM_NEXT: DataTypes.DECIMAL(18, 2),
  IX_KOMT1: DataTypes.INTEGER,
  IX_GKOMV: DataTypes.INTEGER,
  ZAEHK_IND: DataTypes.CHAR(2),
  DRUKZ: DataTypes.CHAR(1),
  STUNB: DataTypes.CHAR(3),
  STUN2: DataTypes.CHAR(3),
  KZWIW: DataTypes.CHAR(1),
  KOFRA: DataTypes.CHAR(3),
  KOFRS: DataTypes.CHAR(3),
  KMANU: DataTypes.CHAR(1),
  TXPRF: DataTypes.CHAR(1),
  KNEGA: DataTypes.CHAR(1),
  GANZZ: DataTypes.CHAR(1),
  KOBLI: DataTypes.CHAR(1),
  KAEND_BTR: DataTypes.CHAR(1),
  KAEND_WRT: DataTypes.CHAR(1),
  KAEND_UFK: DataTypes.CHAR(1),
  KAEND_RCH: DataTypes.CHAR(1),
  KAEND_LOE: DataTypes.CHAR(1),
  KAEND_MEH: DataTypes.CHAR(1),
  KZTERM: DataTypes.CHAR(1),
  FXMSG: DataTypes.STRING(70),
  UPDKZ: DataTypes.CHAR(1),
  SELKZ: DataTypes.CHAR(1),
  BOSTA: DataTypes.CHAR(1),
  KSPAE: DataTypes.CHAR(1),
  LOEVM_KO: DataTypes.CHAR(1),
  KNUMA_BO: DataTypes.CHAR(10),
  BERGL: DataTypes.CHAR(1),
  VHART: DataTypes.CHAR(4),
  RDIFA: DataTypes.CHAR(1),
  KMENG: DataTypes.DECIMAL(18, 3),
  KBUFF: DataTypes.CHAR(1),
  BOSTA_CR: DataTypes.CHAR(1),
  SBZRR: DataTypes.CHAR(1),
}, {
  tableName: 'sap_komv_condition',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  sequelize,
  modelName: 'SapKomvCondition',
});

  return SapKomvCondition;
};

// Export the model function for Sequelize initialization
module.exports = SapKomvCondition;


