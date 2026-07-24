require('dotenv').config();

const dbPassword = process.env.DB_PASS ? decodeURIComponent(process.env.DB_PASS) : '';

module.exports = {
  development: {
    username: process.env.DB_USER || 'root',
    password: dbPassword,
    database: process.env.DB_NAME || 'npg_efacture',
    host: process.env.DB_HOST || '127.0.0.1',
    port: parseInt(process.env.DB_PORT) || 3306,
    dialect: 'mysql',
    logging: false
  },
  test: {
    username: process.env.DB_USER || 'root',
    password: dbPassword,
    database: 'database_test',
    host: process.env.DB_HOST || '127.0.0.1',
    dialect: 'mysql'
  },
  production: {
    username: process.env.DB_USER || 'root',
    password: dbPassword,
    database: process.env.DB_NAME || 'npg_efacture',
    host: process.env.DB_HOST || '127.0.0.1',
    port: parseInt(process.env.DB_PORT) || 3306,
    dialect: 'mysql',
    logging: false
  }
};
