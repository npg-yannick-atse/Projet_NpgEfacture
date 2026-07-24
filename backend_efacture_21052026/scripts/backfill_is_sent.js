'use strict';
// Backfill du flag is_sent sur downloaded_invoices.
// - Crée la colonne + index si absents (idempotent).
// - is_sent=1 pour tout numero ayant un envoi RÉUSSI (SendBy non nul, erreur=0).
// Relançable.
require('dotenv').config();
const { Sequelize, QueryTypes } = require('sequelize');
const p = process.env.DB_PASS ? decodeURIComponent(process.env.DB_PASS) : '';
const s = new Sequelize(process.env.DB_NAME || 'npg_efacture', process.env.DB_USER || 'root', p, {
  host: process.env.DB_HOST || '127.0.0.1', port: parseInt(process.env.DB_PORT) || 3306, dialect: 'mysql', logging: false });
const q = (sql) => s.query(sql, { type: QueryTypes.SELECT });

(async () => {
  try {
    console.log(`Backfill is_sent sur ${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}`);
    // colonne
    const cols = await q(`SELECT column_name AS n FROM information_schema.columns
      WHERE table_schema=DATABASE() AND table_name='downloaded_invoices' AND column_name='is_sent'`);
    if (!cols.length) { await s.query(`ALTER TABLE downloaded_invoices ADD COLUMN is_sent TINYINT(1) NOT NULL DEFAULT 0`); console.log('  + colonne is_sent'); }
    // index
    const idx = await q(`SELECT index_name AS n FROM information_schema.statistics
      WHERE table_schema=DATABASE() AND table_name='downloaded_invoices' AND index_name='idx_di_is_sent'`);
    if (!idx.length) { await s.query(`CREATE INDEX idx_di_is_sent ON downloaded_invoices (is_sent)`); console.log('  + index idx_di_is_sent'); }

    // reset puis marquage (anti-jointure une seule fois, en SQL)
    await s.query(`UPDATE downloaded_invoices SET is_sent = 0`);
    const [res] = await s.query(`UPDATE downloaded_invoices di
      SET is_sent = 1
      WHERE EXISTS (
        SELECT 1 FROM logs_actions la
        WHERE la.numero_facture = di.numero AND la.SendBy IS NOT NULL AND la.erreur = 0
      )`);

    const [{ n1 }] = await q(`SELECT COUNT(*) n1 FROM downloaded_invoices WHERE is_sent=1`);
    const [{ n0 }] = await q(`SELECT COUNT(*) n0 FROM downloaded_invoices WHERE is_sent=0`);
    console.log(`✔ Backfill terminé — envoyées (is_sent=1): ${n1}   non envoyées (is_sent=0): ${n0}`);
  } catch (e) {
    console.error('Erreur:', e.message);
    process.exitCode = 1;
  } finally { await s.close(); }
})();
