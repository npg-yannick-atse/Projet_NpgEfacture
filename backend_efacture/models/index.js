'use strict';

const fs = require('fs');
const path = require('path');
const { Sequelize, DataTypes } = require('sequelize');
const process = require('process');
const basename = path.basename(__filename);
const env = process.env.NODE_ENV || 'development';
const config = require(__dirname + '/../config/database.js')[env];
const db = {};

// Créer une instance Sequelize
let sequelize;
if (config.use_env_variable) {
  sequelize = new Sequelize(process.env[config.use_env_variable], config);
} else {
  sequelize = new Sequelize(
    config.database,
    config.username,
    config.password,
    {
      host: config.host,
      dialect: config.dialect || 'mysql', // Assurez-vous que le dialecte est défini
      logging: false,
      define: {
        timestamps: false // Désactive les champs createdAt et updatedAt par défaut
      }
    }
  );
}

// Charger tous les modèles
fs.readdirSync(__dirname)
  .filter(file => {
    return (
      file.indexOf('.') !== 0 &&
      file !== basename &&
      file.slice(-3) === '.js' &&
      file.indexOf('.test.js') === -1
    );
  })
  .forEach(file => {
    try {
      const modelModule = require(path.join(__dirname, file));

      // 1. Si c'est une fonction (pattern Sequelize standard: (sequelize, DataTypes) => model)
      if (typeof modelModule === 'function') {
        try {
          // On tente d'abord comme une fonction normale
          const model = modelModule(sequelize, DataTypes);
          if (model && model.name) db[model.name] = model;
        } catch (e) {
          // Si ça échoue avec "Class constructor ... cannot be invoked without 'new'", it's a class
          if (e.message.includes('cannot be invoked without \'new\'')) {
            // Ces modèles sont probablement déjà initialisés ou utilisent db.define
            // Si c'est une classe qui n'est PAS une instance déjà liée, on l'ignorerait ici
            // mais dans notre cas, Details_Doc_livraison est déjà une instance liée à un autre sequelize.
            console.warn(`Modèle ${file} semble être une classe ou déjà initialisé. Ignoré.`);
          } else {
            throw e;
          }
        }
      }
      // 2. Si c'est déjà un modèle initialisé (instance de Model)
      else if (modelModule && modelModule.prototype instanceof Sequelize.Model) {
        db[modelModule.name] = modelModule;
      }
      // 3. Fallback pour les objets avec .init
      else if (modelModule && typeof modelModule === 'object' && typeof modelModule.init === 'function') {
        db[modelModule.name] = modelModule;
      }
    } catch (error) {
      console.error(`Erreur lors du chargement du modèle ${file}:`, error.message);
    }
  });

// Définir les associations
// Définir les associations après avoir chargé tous les modèles
Object.keys(db).forEach(modelName => {
  if (db[modelName].associate) {
    db[modelName].associate(db);
  }
});

// Ajouter l'association entre LogsAction et FneInvoice
if (db.LogsAction && db.FneInvoice) {
  // Un LogsAction peut avoir un FneInvoice
  db.LogsAction.hasOne(db.FneInvoice, {
    foreignKey: 'numero_facture',
    sourceKey: 'numero_facture',
    as: 'fneInvoice'
  });

  // Un FneInvoice appartient à un LogsAction
  db.FneInvoice.belongsTo(db.LogsAction, {
    foreignKey: 'numero_facture',
    targetKey: 'numero_facture',
    as: 'logsAction'
  });
}

// Ajouter les méthodes de l'instance Sequelize
Object.assign(db, {
  sequelize,
  Sequelize,
  // Ajouter d'autres utilitaires si nécessaire
  // Par exemple :
  // Opérateurs: Sequelize.Op,
  // Types de données: DataTypes
});

module.exports = db;
