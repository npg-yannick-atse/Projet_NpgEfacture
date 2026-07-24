'use strict';
// Backfill des colonnes d'affichage sur logs_actions (total_ttc, point_of_sale,
// client_name, is_manual, is_cancellation) à partir de api_response + downloaded.data.
// - Crée les colonnes si absentes (idempotent).
// - Ne retraite que les lignes envoyées non encore remplies (total_ttc IS NULL) -> relançable.
// Usage: node scripts/backfill_display_columns.js
require('dotenv').config();
const { Sequelize, QueryTypes } = require('sequelize');
const { computeInvoiceDisplay } = require('../services/computeInvoiceDisplay');

const dbPassword = process.env.DB_PASS ? decodeURIComponent(process.env.DB_PASS) : '';
const s = new Sequelize(process.env.DB_NAME || 'npg_efacture', process.env.DB_USER || 'root', dbPassword, {
  host: process.env.DB_HOST || '127.0.0.1', port: parseInt(process.env.DB_PORT) || 3306, dialect: 'mysql', logging: false,
});
const q = (sql, r) => s.query(sql, { replacements: r, type: QueryTypes.SELECT });
const safeParse = (v) => { if (v == null) return null; if (typeof v !== 'string') return v; try { return JSON.parse(v); } catch { return null; } };

async function ensureColumns() {
  const cols = await q(`SELECT column_name AS n FROM information_schema.columns
    WHERE table_schema=DATABASE() AND table_name='logs_actions'`);
  const have = new Set(cols.map(c => c.n));
  const defs = {
    total_ttc: 'DECIMAL(15,3) NULL',
    point_of_sale: 'VARCHAR(80) NULL',
    client_name: 'VARCHAR(255) NULL',
    is_manual: 'TINYINT(1) NOT NULL DEFAULT 0',
    is_cancellation: 'TINYINT(1) NOT NULL DEFAULT 0',
    fne_invoice_id: 'VARCHAR(100) NULL',
    reference: 'VARCHAR(100) NULL',
  };
  for (const [name, def] of Object.entries(defs)) {
    if (!have.has(name)) { await s.query(`ALTER TABLE logs_actions ADD COLUMN ${name} ${def}`); console.log('  + colonne ajoutée:', name); }
  }
}

(async () => {
  try {
    console.log(`Backfill sur ${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}`);
    await ensureColumns();

    const [{ n: toDo }] = await q(`SELECT COUNT(*) n FROM logs_actions WHERE SendBy IS NOT NULL AND total_ttc IS NULL`);
    console.log(`Lignes à traiter : ${toDo}`);

    let done = 0;
    const BATCH = 500;
    for (;;) {
      const logs = await q(`SELECT id, numero_facture, invoice_type, SendOn, api_response
        FROM logs_actions WHERE SendBy IS NOT NULL AND total_ttc IS NULL ORDER BY id LIMIT ${BATCH}`);
      if (logs.length === 0) break;

      const nums = [...new Set(logs.map(l => l.numero_facture).filter(Boolean))];
      const dlMap = {};
      if (nums.length) {
        const dls = await q(`SELECT numero, data, download_date, id, client FROM downloaded_invoices WHERE numero IN (:nums)`, { nums });
        for (const d of dls) {
          if (!dlMap[String(d.numero)]) dlMap[String(d.numero)] = { data: safeParse(d.data), download_date: d.download_date, id: d.id, client: d.client };
        }
      }

      for (const log of logs) {
        const api = safeParse(log.api_response);
        const dl = dlMap[String(log.numero_facture)] || null;
        const disp = computeInvoiceDisplay(dl, api, {
          numero_facture: log.numero_facture, invoice_type: log.invoice_type, sendOn: log.SendOn,
        });
        await s.query(`UPDATE logs_actions SET total_ttc=:t, point_of_sale=:p, client_name=:c, is_manual=:m, is_cancellation=:x, fne_invoice_id=:f, reference=:r WHERE id=:id`, {
          replacements: {
            t: disp.total_ttc, p: disp.point_of_sale, c: disp.client_name,
            m: disp.is_manual ? 1 : 0, x: disp.is_cancellation ? 1 : 0,
            f: disp.fne_invoice_id || null, r: disp.reference || null, id: log.id,
          },
        });
      }
      done += logs.length;
      console.log(`  ${done}/${toDo}`);
    }
    console.log('✔ Backfill terminé.');
  } catch (e) {
    console.error('Erreur backfill:', e.message);
    process.exitCode = 1;
  } finally {
    await s.close();
  }
})();
