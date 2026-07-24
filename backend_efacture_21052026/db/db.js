const { Sequelize } = require('sequelize');
const config = require('../config/database');

// Utiliser la configuration de l'environnement approprié
const env = process.env.NODE_ENV || 'production';
const dbConfig = config[env];

// Créer l'instance Sequelize avec toutes les options nécessaires
const sequelize = new Sequelize(
    dbConfig.database,
    dbConfig.username,
    dbConfig.password,
    {
        host: dbConfig.host,
        port: dbConfig.port,
        dialect: dbConfig.dialect || 'mysql',
        logging: dbConfig.logging,
        pool: dbConfig.pool,
        dialectOptions: dbConfig.dialectOptions,
        define: {
            timestamps: false
        }
    }
);

module.exports = sequelize;
