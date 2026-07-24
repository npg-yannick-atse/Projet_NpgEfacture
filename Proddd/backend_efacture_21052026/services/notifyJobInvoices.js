/**
 * Notification : factures rencontrées par le job de téléchargement auto qui
 * nécessitent un traitement manuel — avoirs (non téléchargés automatiquement)
 * et factures en problème (échec de téléchargement).
 *
 * Même pattern d'envoi que notifyAvoirBlocked : POST { key, object, message } vers NOTIFICATION_URL.
 */
const axios = require('axios');
const { NOTIFICATION_URL } = require('../config/notificationConfig');

// Canal dédié aux notifications du téléchargement automatique.
const NOTIFICATION_KEY = 'ec7d2fe2de8b41ee8f91';
const TIMEOUT_MS = 30000;
const MAX_RETRIES = 3;
const RETRY_BACKOFF_MS = 5000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const esc = (v) => (v === null || v === undefined || v === '' ? 'N/A'
  : String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'));

function buildTable(title, rows, color) {
  const body = (rows || []).map((r) => `
    <tr>
      <td style="border:1px solid #ddd;padding:6px;">${esc(r.numero)}</td>
      <td style="border:1px solid #ddd;padding:6px;">${esc(r.client)}</td>
      <td style="border:1px solid #ddd;padding:6px;text-align:center;">${esc(r.type)}</td>
      <td style="border:1px solid #ddd;padding:6px;">${esc(r.detail)}</td>
    </tr>`).join('');
  return `
    <h3 style="margin-top:18px;color:${color};">${esc(title)} (${(rows || []).length})</h3>
    <table style="border-collapse:collapse;width:100%;border:1px solid #ddd;">
      <tr style="background:#f2f2f2;">
        <th style="border:1px solid #ddd;padding:6px;text-align:left;">N° Facture</th>
        <th style="border:1px solid #ddd;padding:6px;text-align:left;">Client</th>
        <th style="border:1px solid #ddd;padding:6px;text-align:center;">Type</th>
        <th style="border:1px solid #ddd;padding:6px;text-align:left;">Détail</th>
      </tr>
      ${body || '<tr><td colspan="4" style="border:1px solid #ddd;padding:6px;text-align:center;">Aucune</td></tr>'}
    </table>`;
}

async function sendWithRetry(payload) {
  let lastErr;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const resp = await axios.post(NOTIFICATION_URL, payload, {
        headers: { 'Content-Type': 'application/json' }, timeout: TIMEOUT_MS,
      });
      return { ok: true, status: resp.status };
    } catch (e) {
      lastErr = e;
      if (attempt === MAX_RETRIES) break;
      await sleep(RETRY_BACKOFF_MS);
    }
  }
  return { ok: false, error: lastErr?.response?.data || lastErr?.message || 'erreur inconnue' };
}

/**
 * @param {{ avoirs?: Array, problemes?: Array, rangeStart?: string, rangeEnd?: string }} p
 *   chaque élément: { numero, client, type, detail }
 */
async function notifyJobInvoices(p) {
  const { avoirs = [], problemes = [], rangeStart, rangeEnd } = p || {};
  if (!avoirs.length && !problemes.length) return { ok: true, skipped: true };

  const html = `
    <h2 style="color:#b35900;margin-bottom:6px;">Téléchargement automatique — factures à traiter manuellement</h2>
    <p style="margin-top:0;">Période : <strong>${esc(rangeStart)} → ${esc(rangeEnd)}</strong>.
    Le job a rencontré des avoirs et/ou des factures en erreur qui n'ont pas été téléchargées automatiquement.</p>
    ${avoirs.length ? buildTable("Avoirs (à traiter via le circuit avoir)", avoirs, '#b35900') : ''}
    ${problemes.length ? buildTable('Factures en problème (échec de téléchargement)', problemes, '#b00') : ''}
    <p style="margin-top:14px;font-style:italic;color:#555;">Notification automatique du job de téléchargement E-Facture.</p>`;

  const object = `Téléchargement auto : ${avoirs.length} avoir(s), ${problemes.length} facture(s) en problème`;
  const result = await sendWithRetry({ key: NOTIFICATION_KEY, object, message: html });
  if (result.ok) console.log(`[notifyJobInvoices] OK status=${result.status}`);
  else console.error('[notifyJobInvoices] échec :', result.error);
  return result;
}

module.exports = { notifyJobInvoices, NOTIFICATION_KEY };
