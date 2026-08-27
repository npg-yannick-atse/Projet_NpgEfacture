'use strict';
/**
 * Facture Access — registre des factures certifiées (accès réservé admin).
 * Filtre par plage de dates (SendOn) OU par numéro de facture, et fournit les
 * champs nécessaires à l'export Excel (rapprochement stickers FNE).
 *
 * SQL BRUT (prod-safe : le modèle DownloadedInvoice sélectionne is_sent, absente
 * en prod). Les champs Code Client / BL sont extraits du message commercial.
 */
const db = require('../models');
const { QueryTypes } = require('sequelize');

// Extrait "Code Client:" et "BL:" du message commercial.
function parseCommercialMessage(cm) {
  const s = String(cm || '');
  const code = (s.match(/Code\s*Client\s*:?\s*([^\n\r]+)/i) || [])[1];
  const bl = (s.match(/(?:^|\n)\s*BL\s*:?\s*([^\n\r]+)/i) || [])[1];
  return { code: code ? code.trim() : null, bl: bl ? bl.trim() : null };
}

exports.list = async (req, res) => {
  try {
    const seq = db.sequelize;
    const { startDate, endDate, numero } = req.query;

    const repl = {};
    let filter;
    if (numero && String(numero).trim()) {
      filter = 'l.numero_facture = :num';
      repl.num = String(numero).trim();
    } else if (startDate || endDate) {
      const parts = [];
      if (startDate) { parts.push('l.SendOn >= :sd'); repl.sd = `${startDate} 00:00:00`; }
      if (endDate)   { parts.push('l.SendOn <= :ed'); repl.ed = `${endDate} 23:59:59`; }
      filter = parts.join(' AND ');
    } else {
      return res.status(400).json({ success: false, error: 'Fournir une plage de dates OU un numéro de facture.' });
    }

    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 3000, 1), 10000);

    // 1) Envois de factures (invoice) certifiés, dans le périmètre demandé.
    const logs = await seq.query(
      `SELECT l.numero_facture,
              l.reference,
              l.invoice_type AS doc_type,
              DATE_FORMAT(l.SendOn, '%Y-%m-%d') AS date_facturation,
              DATE_FORMAT(l.SendOn, '%m/%Y')    AS mois_facture,
              l.total_ttc AS log_ttc,
              l.client_name
         FROM logs_actions l
        WHERE l.invoice_type IN ('invoice', 'refund') AND l.SendBy IS NOT NULL AND ${filter}
        ORDER BY l.SendOn DESC
        LIMIT :limit`,
      { replacements: { ...repl, limit }, type: QueryTypes.SELECT });

    if (!logs.length) return res.json({ success: true, data: [], count: 0, truncated: false });

    const numeros = [...new Set(logs.map(l => l.numero_facture))];
    const ph = numeros.map(() => '?').join(',');

    // 2) Montants (valeurs réelles, non ×10).
    const totals = await seq.query(
      `SELECT numero_facture, total_ttc, total_a_payer FROM invoice_totals WHERE numero_facture IN (${ph})`,
      { replacements: numeros, type: QueryTypes.SELECT });
    const tMap = {}; totals.forEach(t => { tMap[t.numero_facture] = t; });

    // 3) Référence FNE = numéro de sticker (facture 9904… OU avoir A9904…).
    //    Pas de filtre sur le type : un numéro est soit une facture, soit un avoir.
    const fnes = await seq.query(
      `SELECT numero_facture, fne_reference, type FROM fne_invoices WHERE numero_facture IN (${ph}) ORDER BY created_at ASC`,
      { replacements: numeros, type: QueryTypes.SELECT });
    const fMap = {}; fnes.forEach(f => { fMap[f.numero_facture] = f.fne_reference; }); // ASC + écrasement ⇒ plus récente

    // 4) Code Client SAP, NCC, BL depuis downloaded_invoices.data (1re ligne).
    const dls = await seq.query(
      `SELECT numero, client, data FROM downloaded_invoices WHERE numero IN (${ph})`,
      { replacements: numeros, type: QueryTypes.SELECT });
    const dMap = {};
    for (const d of dls) {
      let arr = null; try { arr = typeof d.data === 'string' ? JSON.parse(d.data) : d.data; } catch (e) { /* noop */ }
      const l0 = (Array.isArray(arr) && arr[0]) ? arr[0] : {};
      const { code, bl } = parseCommercialMessage(l0.commercialMessage);
      dMap[d.numero] = {
        client: d.client || l0.nomClient || null,
        ncc: l0.clientNCC || l0.clientNcc || null,
        kunnr: l0.kunnr || code || null,
        bl,
        source: l0.source || null, // 'template_import' = facture importée (montant NON ×10)
      };
    }

    const data = logs.map(l => {
      const num = l.numero_facture;
      const dd = dMap[num] || {};
      const t = tMap[num] || {};
      // Montant réel : invoice_totals.total_ttc est réel (siège ET export). En repli
      // (invoice_totals absent, ~34% des cas), l'échelle de logs.total_ttc dépend de
      // l'origine : SAP → ×10 ; importée (template) → déjà réel.
      let montant;
      if (t.total_ttc != null) montant = Number(t.total_ttc);
      else if (l.log_ttc != null) montant = (dd.source === 'template_import') ? Number(l.log_ttc) : Number(l.log_ttc) / 10;
      else montant = null;
      const totalPayer = (t.total_a_payer != null) ? Number(t.total_a_payer) : montant;
      return {
        type: l.doc_type === 'refund' ? 'avoir' : 'facture',
        code_client_sap: dd.kunnr || null,
        nom1: l.client_name || dd.client || null,
        compte_contribuable: dd.ncc || null,
        ancien_code_si: null,
        date_facturation: l.date_facturation || null,
        numero_bl: dd.bl || null,
        numero_facture: num,
        montant_facture: montant,
        total_a_payer: totalPayer,
        mois_facture: l.mois_facture || null,
        numero_sticker: fMap[num] || l.reference || null,
      };
    });

    return res.json({ success: true, data, count: data.length, truncated: logs.length >= limit });
  } catch (error) {
    console.error('facture-access list:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
};
