const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const LogsAction = sequelize.define('LogsAction', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      allowNull: false
    },
    username: {
      type: DataTypes.STRING(100),
      allowNull: false
    },
    numero_facture: {
      type: DataTypes.STRING(50),
      allowNull: false
    },
    download_date: {
      type: DataTypes.DATE,
      allowNull: true
    },
    downloadBy: {
      type: DataTypes.STRING(100),
      allowNull: true
    },
    delete_on: {
      type: DataTypes.DATE,
      allowNull: true
    },
    delete_by: {
      type: DataTypes.STRING(100),
      allowNull: true
    },
    SendBy: {
      type: DataTypes.STRING(100),
      allowNull: true
    },
    SendOn: {
      type: DataTypes.DATE,
      allowNull: true
    },
    api_response: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    invoice_type: {
      type: DataTypes.ENUM('invoice', 'refund'),
      allowNull: true,
      defaultValue: 'invoice',
      comment: 'Type de facture: invoice (facture normale) ou refund (avoir)'
    },
    created_on: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW
    },
    created_by: {
      type: DataTypes.STRING(100),
      allowNull: false
    },
    updated_on: {
      type: DataTypes.DATE,
      allowNull: true
    },
    print_by: {
      type: DataTypes.STRING(100),
      allowNull: true,
      comment: 'Username of the person who printed the invoice'
    },
    print_on: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: 'Date and time when the invoice was printed'
    },
    erreur: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      comment: "Indique si l'envoi a échoué (true/1) ou réussi (false/0)"
    },
    fne_response_time_ms: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: "Durée de l'appel FNE en millisecondes"
    },
    // --- Colonnes d'affichage précalculées (évitent de parser api_response/data pour la liste) ---
    total_ttc: {
      type: DataTypes.DECIMAL(15, 3),
      allowNull: true,
      comment: "Montant TTC précalculé (règle ×1000 avant 30/12/2025 appliquée)"
    },
    point_of_sale: {
      type: DataTypes.STRING(80),
      allowNull: true
    },
    client_name: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    is_manual: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false
    },
    is_cancellation: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false
    },
    fne_invoice_id: {
      type: DataTypes.STRING(100),
      allowNull: true,
      comment: "Id de certif FNE embarqué dans ce log (matching précis) — REFUND_<ref> pour un avoir"
    },
    reference: {
      type: DataTypes.STRING(100),
      allowNull: true,
      comment: "Référence FNE propre au log (repli d'affichage)"
    }
  }, {
    tableName: 'logs_actions',
    timestamps: false, // On gère manuellement avec created_on/updated_on
    indexes: [
      {
        fields: ['numero_facture']
      },
      {
        fields: ['username']
      },
      {
        fields: ['download_date']
      },
      {
        fields: ['downloadBy']
      },
      {
        fields: ['delete_on']
      },
      {
        fields: ['SendBy']
      },
      {
        fields: ['erreur']
      }
    ]
  });

  return LogsAction;
};
