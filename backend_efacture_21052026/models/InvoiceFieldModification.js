const { DataTypes } = require('sequelize');

const InvoiceFieldModification = (sequelize, DataTypes) => {
  const Model = sequelize.define('InvoiceFieldModification', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  invoice_number: {
    type: DataTypes.STRING,
    allowNull: false,
    comment: 'Numéro de la facture'
  },
  field_name: {
    type: DataTypes.STRING,
    allowNull: false,
    comment: 'Nom du champ modifié (ClientEmail, ClientPhone, Template, etc.)'
  },
  old_value: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'Ancienne valeur du champ'
  },
  new_value: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'Nouvelle valeur du champ'
  },
  user_id: {
    type: DataTypes.STRING,
    allowNull: false,
    comment: 'Identifiant de l\'utilisateur qui a fait la modification'
  },
  user_name: {
    type: DataTypes.STRING,
    allowNull: true,
    comment: 'Nom de l\'utilisateur qui a fait la modification'
  },
  modification_date: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
    comment: 'Date et heure de la modification'
  },
  apply_to_all: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
    comment: 'Si la modification doit être appliquée à toutes les lignes de la facture'
  },
  line_number: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'Numéro de la ligne modifiée (si apply_to_all est false)'
  }
}, {
  tableName: 'InvoiceFieldModifications',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    {
      fields: ['invoice_number']
    },
    {
      fields: ['field_name']
    },
    {
      fields: ['user_id']
    },
    {
      fields: ['modification_date']
    }
  ]
});

  return Model;
};

module.exports = InvoiceFieldModification;
