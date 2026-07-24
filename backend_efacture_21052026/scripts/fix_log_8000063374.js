'use strict';
// Corrige le log d'envoi de la facture 8000063374 (certifiée FNE mais enregistrée en
// erreur). SQL BRUT volontairement : le modèle LogsAction (dev) a des colonnes qui
// n'existent pas encore en prod -> une requête via le modèle échouerait en prod.
// Idempotent. DEV par défaut ; PROD via surcharge des variables d'env.
require('dotenv').config();
const { Sequelize, QueryTypes } = require('sequelize');

const NUMERO = '8000063374';
const REFERENCE = '9904279V26000003445';
const FNE_ID = 'eee755cd-f293-4526-bd79-037e33ab6861';
const NCC = '9904279V';
const TOKEN = '019cfd1a-b9c5-7001-af38-950f340ab23c';

const dbPassword = process.env.DB_PASS ? decodeURIComponent(process.env.DB_PASS) : '';
const s = new Sequelize(process.env.DB_NAME || 'npg_efacture', process.env.DB_USER || 'root', dbPassword, {
  host: process.env.DB_HOST || '127.0.0.1', port: parseInt(process.env.DB_PORT) || 3306, dialect: 'mysql', logging: false,
});

(async () => {
  try {
    console.log(`Cible : ${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}`);
    const apiResponse = JSON.stringify({
      success: true, reference: REFERENCE, ncc: NCC, token: TOKEN,
      invoice: { id: FNE_ID, reference: REFERENCE, type: 'invoice' },
      _repaired_manually: true,
    });
    const [result, meta] = await s.query(
      `UPDATE logs_actions SET erreur = 0, api_response = :api
       WHERE numero_facture = :num AND SendBy IS NOT NULL AND invoice_type = 'invoice' AND erreur = 1`,
      { replacements: { api: apiResponse, num: NUMERO } }
    );
    const affected = (meta && meta.affectedRows != null) ? meta.affectedRows : (result && result.affectedRows);
    console.log(`✔ Lignes corrigées : ${affected != null ? affected : '(voir ci-dessous)'}`);

    const rows = await s.query(
      `SELECT id, erreur FROM logs_actions WHERE numero_facture = :num AND SendBy IS NOT NULL AND invoice_type = 'invoice'`,
      { replacements: { num: NUMERO }, type: QueryTypes.SELECT }
    );
    console.table(rows);
  } catch (e) {
    console.error('Erreur:', e.message);
    process.exitCode = 1;
  } finally {
    await s.close();
  }
})();
