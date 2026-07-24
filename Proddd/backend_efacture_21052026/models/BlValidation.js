const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const BlValidation = sequelize.define('BlValidation', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      allowNull: false,
    },
    numero_facture: {
      type: DataTypes.STRING(50),
      allowNull: false,
    },
    // Snapshot du/des BL (VGBEL) lus dans SAP au moment de la 1ère validation.
    numero_bl: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    statut: {
      type: DataTypes.ENUM('en_attente', 'valide_logistique', 'valide_commercial', 'valide'),
      allowNull: false,
      defaultValue: 'en_attente',
    },
    logistique_valide_by: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    logistique_valide_on: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    commercial_valide_by: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    commercial_valide_on: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    comptabilite_valide_by: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    comptabilite_valide_on: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    imprime_by: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    imprime_on: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    // Compteur d'impressions (pointage) : incrémenté à chaque impression FNE.
    print_count: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    created_on: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    updated_on: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  }, {
    tableName: 'bl_validations',
    timestamps: false,
    indexes: [
      { name: 'idx_bl_validations_numero_facture', unique: true, fields: ['numero_facture'] },
      { name: 'idx_bl_validations_statut', fields: ['statut'] },
    ],
  });

  return BlValidation;
};
