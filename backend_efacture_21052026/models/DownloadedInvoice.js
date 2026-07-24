module.exports = (sequelize, DataTypes) => {
  const DownloadedInvoice = sequelize.define('DownloadedInvoice', {
    id: {
      type: DataTypes.STRING,
      primaryKey: true
    },
    username: {
      type: DataTypes.STRING,
      allowNull: false
    },
    numero: {
      type: DataTypes.STRING,
      allowNull: false
    },
    date: {
      type: DataTypes.DATE,
      allowNull: false
    },
    client: {
      type: DataTypes.STRING,
      allowNull: false
    },
    data: {
      type: DataTypes.TEXT('long'),
      allowNull: false,
      get() {
        const value = this.getDataValue('data');
        return value ? JSON.parse(value) : null;
      },
      set(value) {
        this.setDataValue('data', JSON.stringify(value));
      }
    },
    download_date: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW
    },
    verified: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false
    },
    invoice_type_code: {
      type: DataTypes.STRING(60),
      allowNull: true,
      comment: 'Code du type choisi via le menu Accueil'
    },
    is_sent: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      comment: 'Envoyée avec succès à la FNE (évite l’anti-jointure sur la page non envoyées)'
    }
  }, {
    tableName: 'downloaded_invoices',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  });

  return DownloadedInvoice;
};
