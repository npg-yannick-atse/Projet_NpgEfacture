// Stat factures téléchargées vs envoyées, par utilisateur, depuis début mai.
// Usage: node stats_factures.js [date_debut=2026-05-01]
require('dotenv').config();
const { Sequelize, QueryTypes } = require('sequelize');

const dbPassword = process.env.DB_PASS ? decodeURIComponent(process.env.DB_PASS) : '';
const sequelize = new Sequelize(
  process.env.DB_NAME || 'npg_efacture',
  process.env.DB_USER || 'root',
  dbPassword,
  {
    host: process.env.DB_HOST || '127.0.0.1',
    port: parseInt(process.env.DB_PORT) || 3306,
    dialect: 'mysql',
    logging: false
  }
);

const dateDebut = process.argv[2] || '2026-05-01';

(async () => {
  try {
    // Une facture est "téléchargée" si elle a une ligne download_date dans la période.
    // Elle est "envoyée" si un numero_facture identique a au moins un envoi réussi (SendBy non nul, erreur=0).
    const rows = await sequelize.query(
      `
      SELECT
        d.downloadBy AS utilisateur,
        COUNT(DISTINCT d.numero_facture) AS telechargees,
        COUNT(DISTINCT CASE WHEN s.numero_facture IS NOT NULL THEN d.numero_facture END) AS telechargees_envoyees,
        COUNT(DISTINCT CASE WHEN s.numero_facture IS NULL THEN d.numero_facture END) AS telechargees_non_envoyees
      FROM logs_actions d
      LEFT JOIN (
        SELECT DISTINCT numero_facture
        FROM logs_actions
        WHERE SendBy IS NOT NULL AND erreur = 0
      ) s ON s.numero_facture = d.numero_facture
      WHERE d.download_date >= :dateDebut
        AND d.downloadBy IS NOT NULL
      GROUP BY d.downloadBy
      ORDER BY telechargees DESC;
      `,
      { replacements: { dateDebut }, type: QueryTypes.SELECT }
    );

    const totals = await sequelize.query(
      `
      SELECT
        COUNT(DISTINCT d.numero_facture) AS telechargees,
        COUNT(DISTINCT CASE WHEN s.numero_facture IS NOT NULL THEN d.numero_facture END) AS telechargees_envoyees,
        COUNT(DISTINCT CASE WHEN s.numero_facture IS NULL THEN d.numero_facture END) AS telechargees_non_envoyees
      FROM logs_actions d
      LEFT JOIN (
        SELECT DISTINCT numero_facture
        FROM logs_actions
        WHERE SendBy IS NOT NULL AND erreur = 0
      ) s ON s.numero_facture = d.numero_facture
      WHERE d.download_date >= :dateDebut
        AND d.downloadBy IS NOT NULL;
      `,
      { replacements: { dateDebut }, type: QueryTypes.SELECT }
    );

    console.log(`\n=== Statistique factures téléchargées / envoyées (depuis ${dateDebut}) ===\n`);
    console.table(
      rows.map(r => ({
        Utilisateur: r.utilisateur,
        'Téléchargées': Number(r.telechargees),
        'Tél. + Envoyées': Number(r.telechargees_envoyees),
        'Tél. NON envoyées': Number(r.telechargees_non_envoyees)
      }))
    );

    const t = totals[0];
    console.log('\n--- TOTAL global (factures distinctes) ---');
    console.log(`Téléchargées          : ${t.telechargees}`);
    console.log(`Téléchargées+envoyées : ${t.telechargees_envoyees}`);
    console.log(`Téléchargées NON env. : ${t.telechargees_non_envoyees}`);
    console.log('');
  } catch (e) {
    console.error('Erreur:', e.message);
    process.exitCode = 1;
  } finally {
    await sequelize.close();
  }
})();
