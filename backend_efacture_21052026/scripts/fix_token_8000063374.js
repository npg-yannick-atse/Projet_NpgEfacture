'use strict';
// Corrige fne_token de 8000063374 : il doit être l'URL de vérification complète
// (la génération PDF ouvre cette URL via Playwright), pas l'UUID nu.
require('dotenv').config();
const { Sequelize, QueryTypes } = require('sequelize');
const dbPassword = process.env.DB_PASS ? decodeURIComponent(process.env.DB_PASS) : '';
const s = new Sequelize(process.env.DB_NAME || 'npg_efacture', process.env.DB_USER || 'root', dbPassword, {
  host: process.env.DB_HOST || '127.0.0.1', port: parseInt(process.env.DB_PORT) || 3306, dialect: 'mysql', logging: false,
});
const NUM = '8000063374';
const URL = 'https://www.services.fne.dgi.gouv.ci/fr/verification/019cfd1a-b9c5-7001-af38-950f340ab23c';
(async () => {
  try {
    console.log(`Cible : ${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}`);
    await s.query(`UPDATE fne_invoices SET fne_token = :u WHERE numero_facture = :n`, { replacements: { u: URL, n: NUM } });
    console.table(await s.query(`SELECT numero_facture, fne_token FROM fne_invoices WHERE numero_facture = :n`, { replacements: { n: NUM }, type: QueryTypes.SELECT }));
  } catch (e) { console.error('Erreur:', e.message); process.exitCode = 1; } finally { await s.close(); }
})();
