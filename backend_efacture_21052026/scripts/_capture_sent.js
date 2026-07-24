'use strict';
// Capture la sortie de getSentInvoices dans un fichier JSON (pour diff avant/après refonte).
// Usage: node scripts/_capture_sent.js <fichier_sortie>
require('dotenv').config();
const fs = require('fs');
const { sequelize } = require('../models');
const controller = require('../controllers/sentInvoicesController');
const out = process.argv[2] || 'baseline.json';

(async () => {
  try {
    const req = { query: { startDate: '2020-01-01' } };
    let captured = null;
    const res = { status: () => res, json: (o) => { captured = o; } };
    await controller.getSentInvoices(req, res);
    const rows = (captured && captured.data) || [];
    // ne garder que les champs stables + trier par id pour un diff propre
    const norm = rows.map(r => ({
      id: r.id,
      numero_facture: r.numero_facture,
      invoice_type: r.invoice_type,
      reference: r.reference || null,
      total_ttc: Math.round((parseFloat(r.total_ttc) || 0) * 1000) / 1000,
      point_of_sale: r.point_of_sale || null,
      client_name: r.client_name || null,
      status: r.status || null,
      is_manual: !!r.is_manual,
      is_cancellation: !!r.is_cancellation,
      initial_invoice_numero: r.initial_invoice_numero || null,
      initial_invoice_reference: r.initial_invoice_reference || null,
      fne_invoice_id: r.fne_invoice_id || null,
      is_orphan: !!r.is_orphan,
    })).sort((a, b) => String(a.id).localeCompare(String(b.id)));
    fs.writeFileSync(out, JSON.stringify(norm, null, 1));
    console.log(`Capturé ${norm.length} lignes -> ${out}`);
  } catch (e) {
    console.error('Erreur capture:', e.message, e.stack);
    process.exitCode = 1;
  } finally {
    await sequelize.close();
  }
})();
