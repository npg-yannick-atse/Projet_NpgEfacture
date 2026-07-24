/**
 * Notification : tentative d'enregistrement d'une facture en "liste noire" (Non FNE)
 * bloquée car la facture est DÉJÀ téléchargée ou DÉJÀ envoyée à la FNE.
 *
 * Même pattern d'envoi que notifyJobInvoices : POST { key, object, message } vers NOTIFICATION_URL.
 */
const axios = require('axios');
const { NOTIFICATION_URL } = require('../config/notificationConfig');

// Canal dédié aux blocages d'enregistrement Non FNE.
const NOTIFICATION_KEY = '4d119a18ee214d18a66b';
const TIMEOUT_MS = 30000;
const MAX_RETRIES = 3;
const RETRY_BACKOFF_MS = 5000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const esc = (v) => (v === null || v === undefined || v === '' ? 'N/A'
  : String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'));

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
 * @param {{ numero:string, reason:'envoyee'|'telechargee', user?:string, client?:string }} p
 */
async function notifyNonFneBlocked(p) {
  const { numero, reason, user, client } = p || {};
  const reasonLabel = reason === 'envoyee'
    ? 'déjà ENVOYÉE à la FNE'
    : 'déjà TÉLÉCHARGÉE';
  const color = reason === 'envoyee' ? '#b00' : '#b35900';

  const html = `
    <h2 style="color:${color};margin-bottom:6px;">Enregistrement "Non FNE" bloqué</h2>
    <p style="margin-top:0;">Une tentative d'enregistrement de la facture
      <strong>${esc(numero)}</strong> dans la liste noire (à ne pas envoyer à la FNE) a été
      <strong>bloquée</strong> car cette facture est <strong>${esc(reasonLabel)}</strong>.</p>
    <table style="border-collapse:collapse;border:1px solid #ddd;">
      <tr><td style="border:1px solid #ddd;padding:6px;"><strong>N° Facture</strong></td><td style="border:1px solid #ddd;padding:6px;">${esc(numero)}</td></tr>
      <tr><td style="border:1px solid #ddd;padding:6px;"><strong>Client</strong></td><td style="border:1px solid #ddd;padding:6px;">${esc(client)}</td></tr>
      <tr><td style="border:1px solid #ddd;padding:6px;"><strong>Motif du blocage</strong></td><td style="border:1px solid #ddd;padding:6px;">${esc(reasonLabel)}</td></tr>
      <tr><td style="border:1px solid #ddd;padding:6px;"><strong>Tentative par</strong></td><td style="border:1px solid #ddd;padding:6px;">${esc(user)}</td></tr>
    </table>
    <p style="margin-top:14px;font-style:italic;color:#555;">Notification automatique E-Facture (page Factures Non FNE).</p>`;

  const object = `Non FNE bloqué : facture ${numero} ${reasonLabel}`;
  const result = await sendWithRetry({ key: NOTIFICATION_KEY, object, message: html });
  if (result.ok) console.log(`[notifyNonFneBlocked] OK status=${result.status} (${numero})`);
  else console.error('[notifyNonFneBlocked] échec :', result.error);
  return result;
}

module.exports = { notifyNonFneBlocked, NOTIFICATION_KEY };
