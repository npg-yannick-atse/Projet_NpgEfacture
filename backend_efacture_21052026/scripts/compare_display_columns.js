'use strict';
// Validation : compare les colonnes précalculées (backfill) au calcul "à l'ancienne"
// produit par le VRAI getSentInvoices (source de vérité de l'affichage actuel).
// Un écart => l'extraction dans computeInvoiceDisplay n'est pas fidèle.
// Usage: node scripts/compare_display_columns.js
require('dotenv').config();
const { Sequelize, QueryTypes } = require('sequelize');
const controller = require('../controllers/sentInvoicesController');

const dbPassword = process.env.DB_PASS ? decodeURIComponent(process.env.DB_PASS) : '';
const s = new Sequelize(process.env.DB_NAME || 'npg_efacture', process.env.DB_USER || 'root', dbPassword, {
  host: process.env.DB_HOST || '127.0.0.1', port: parseInt(process.env.DB_PORT) || 3306, dialect: 'mysql', logging: false,
});
const q = (sql) => s.query(sql, { type: QueryTypes.SELECT });

(async () => {
  try {
    // 1) sortie du vrai contrôleur (startDate large => pas de fenêtre 60j)
    const req = { query: { startDate: '2020-01-01' } };
    let captured = null;
    const res = { status: () => res, json: (o) => { captured = o; } };
    await controller.getSentInvoices(req, res);
    const rows = (captured && captured.data) || [];
    // ne garder que les vraies lignes de log (id numérique), pas les orphelins/parents
    const live = rows.filter(r => typeof r.id === 'number' || /^\d+$/.test(String(r.id)));
    console.log(`Contrôleur: ${rows.length} lignes, dont ${live.length} vrais logs comparables.`);

    // 2) colonnes précalculées
    const stored = await q(`SELECT id, total_ttc, point_of_sale, client_name, is_manual, is_cancellation FROM logs_actions`);
    const byId = {};
    for (const r of stored) byId[r.id] = r;

    // 3) diff
    let ok = 0, diffs = [];
    for (const inv of live) {
      const st = byId[inv.id];
      if (!st) continue;
      const problems = [];
      const dTtc = Math.abs(parseFloat(st.total_ttc || 0) - parseFloat(inv.total_ttc || 0));
      if (dTtc > 0.01) problems.push(`total_ttc: stocké=${st.total_ttc} vs live=${inv.total_ttc}`);
      if ((st.point_of_sale || '') !== (inv.point_of_sale || '')) problems.push(`pos: stocké=${st.point_of_sale} vs live=${inv.point_of_sale}`);
      if ((st.client_name || '') !== (String(inv.client_name || '').slice(0,255))) problems.push(`client: stocké=${st.client_name} vs live=${inv.client_name}`);
      if (!!st.is_manual !== !!inv.is_manual) problems.push(`is_manual: ${st.is_manual} vs ${inv.is_manual}`);
      if (!!st.is_cancellation !== !!inv.is_cancellation) problems.push(`is_cancellation: ${st.is_cancellation} vs ${inv.is_cancellation}`);
      if (problems.length) diffs.push({ id: inv.id, numero: inv.numero_facture, problems }); else ok++;
    }

    console.log(`\n✔ Identiques : ${ok}`);
    console.log(`✗ Écarts     : ${diffs.length}`);
    diffs.slice(0, 20).forEach(d => console.log(`  #${d.id} ${d.numero}: ${d.problems.join(' | ')}`));
    if (diffs.length > 20) console.log(`  ... (+${diffs.length - 20} autres)`);
  } catch (e) {
    console.error('Erreur comparaison:', e.message, e.stack);
    process.exitCode = 1;
  } finally {
    await s.close();
  }
})();
