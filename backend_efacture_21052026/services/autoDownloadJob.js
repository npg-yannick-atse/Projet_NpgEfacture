const axios = require('axios');
const { Op } = require('sequelize');
const db = require('../models');
const { notifyJobInvoices } = require('./notifyJobInvoices');

const { AutoDownloadConfig, AutoDownloadRun, DownloadedInvoice, LogsAction, FneInvoice, AutoDownloadFlagged } = db;

const PORT = process.env.PORT || 6050;
const BASE = `http://127.0.0.1:${PORT}`;

let running = false;       // évite les exécutions concurrentes
let cancelRequested = false; // demande d'arrêt du job en cours
let timer = null;

function requestStop() {
  if (!running) return false;
  cancelRequested = true;
  return true;
}
function isRunning() {
  return running;
}

const ymd = (d) => {
  const x = new Date(d);
  const local = new Date(x.getTime() - x.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
};
const sameDay = (a, b) => ymd(a) === ymd(b);

async function getConfig() {
  let cfg = await AutoDownloadConfig.findByPk(1);
  if (!cfg) cfg = await AutoDownloadConfig.create({ id: 1 });
  return cfg;
}

/**
 * Exécute le job : liste les factures SAP depuis le dernier run et télécharge
 * celles qui ne sont pas déjà présentes. Téléchargement SEUL (pas d'envoi FNE).
 */
async function runJob(triggeredBy = 'scheduler') {
  if (running) return { skipped: true, reason: 'already_running' };
  running = true;
  cancelRequested = false;

  const cfg = await getConfig();
  const end = ymd(new Date());
  const start = cfg.last_run_at ? ymd(cfg.last_run_at) : end; // "depuis le dernier run"
  const pos = cfg.point_of_sale || 'NPG_SIEGE_FACTURATION';

  const run = await AutoDownloadRun.create({
    started_at: new Date(), status: 'running', triggered_by: triggeredBy,
    range_start: start, range_end: end,
  });

  let found = 0, downloaded = 0, skipped = 0, errors = 0;
  const avoirs = [];
  const problemes = [];
  // Signale une facture (avoir/problème) une seule fois (dédup en base) pour la notif.
  const flagOnce = async (kind, numero, inv, detail) => {
    try {
      const already = await AutoDownloadFlagged.findOne({ where: { numero_facture: numero }, attributes: ['id'] });
      if (already) return;
      await AutoDownloadFlagged.create({
        numero_facture: numero, kind, client: inv.nomClient || null, type: inv.type || null,
        detail: String(detail || '').slice(0, 250),
      });
      (kind === 'avoir' ? avoirs : problemes).push({ numero, client: inv.nomClient, type: inv.type, detail });
    } catch (e) { /* non bloquant */ }
  };

  try {
    const listResp = await axios.post(`${BASE}/api/sap/invoices-by-date`,
      { startDate: start, endDate: end }, { timeout: 120000, validateStatus: () => true });

    if (listResp.status < 200 || listResp.status >= 300 || !listResp.data || !listResp.data.success) {
      throw new Error(`Liste SAP: statut ${listResp.status} ${listResp.data && listResp.data.error ? '- ' + listResp.data.error : ''}`);
    }

    const invoices = Array.isArray(listResp.data.data) ? listResp.data.data : [];
    found = invoices.length;

    // Factures déjà signalées (saisies "non FNE", ou avoirs/problèmes déjà vus) → on ne les retraite pas.
    const flaggedRows = await AutoDownloadFlagged.findAll({ attributes: ['numero_facture'], raw: true });
    const flaggedSet = new Set(flaggedRows.map((r) => r.numero_facture));

    for (const inv of invoices) {
      if (cancelRequested) break; // arrêt manuel demandé
      const numero = (inv.numero || '').trim();
      if (!numero) { skipped++; continue; }
      if (flaggedSet.has(numero)) { skipped++; continue; } // déjà signalée (non FNE / avoir / problème)

      // Pré-filtre éligibilité (mêmes critères que getInvoiceDocument : District LOC, Groupe != Z4)
      const bzirk = (inv.bzirk || '').trim();
      const kdgrp = (inv.kdgrp || '').trim();
      if (!bzirk.startsWith('LOC') || kdgrp === 'Z4') { skipped++; continue; }

      // Avoirs (FKART G2/RE/S1/CR) : pas de téléchargement auto → notification.
      const fkart = (inv.type || '').toUpperCase();
      if (fkart.includes('G2') || fkart.includes('RE') || fkart.includes('S1') || fkart.includes('CR')) {
        skipped++;
        await flagOnce('avoir', numero, inv, `Avoir (FKART ${inv.type})`);
        continue;
      }

      // Déjà téléchargée ?
      const exists = await DownloadedInvoice.findOne({ where: { numero }, attributes: ['id'] });
      if (exists) { skipped++; continue; }

      // Déjà envoyée à la FNE ? (log d'envoi OU certificat FNE) — on ne re-télécharge pas.
      const sentLog = await LogsAction.findOne({
        where: { numero_facture: numero, SendBy: { [Op.ne]: null } },
        attributes: ['id'],
      });
      if (sentLog) { skipped++; continue; }
      const fneExists = await FneInvoice.findOne({ where: { numero_facture: numero }, attributes: ['id'] });
      if (fneExists) { skipped++; continue; }

      try {
        const doc = await axios.post(`${BASE}/api/sap/invoices`, { VBELN: numero },
          { timeout: 90000, validateStatus: () => true });

        // 409 = déjà téléchargée/envoyée, 403 = non éligible → on ignore proprement
        if (doc.status === 409 || doc.status === 403) { skipped++; continue; }
        if (doc.status < 200 || doc.status >= 300 || !doc.data || !doc.data.success) {
          errors++;
          await flagOnce('probleme', numero, inv, `Réponse SAP invalide (statut ${doc.status})`);
          continue;
        }

        const lignes = Array.isArray(doc.data.data) ? doc.data.data : (doc.data.data ? [doc.data.data] : []);
        const dataTagged = lignes.map((item) => ({
          ...item,
          template: item.template || 'B2B',
          paymentMethod: 'deferred',
          invoiceType: item.invoiceType || 'sale',
          isRne: item.isRne || 'False',
          pointOfSale: pos,
          point_of_sale: pos,
          import_view: pos,
        }));

        await DownloadedInvoice.create({
          id: `AUTO_${Date.now()}_${numero}`,
          username: 'AUTO',
          numero,
          date: new Date(),
          client: inv.nomClient || 'Client inconnu',
          data: dataTagged,
          invoice_type_code: pos,
        });

        // Journaliser le téléchargement (réutilise l'endpoint existant)
        try {
          await axios.post(`${BASE}/api/logs/download`,
            { username: 'AUTO', numeroFacture: numero }, { timeout: 15000, validateStatus: () => true });
        } catch (e) { /* log non bloquant */ }

        downloaded++;
      } catch (e) {
        errors++;
        await flagOnce('probleme', numero, inv, e.message || 'Échec du téléchargement');
      }
    }

    const stoppedNote = cancelRequested ? ' (arrêté manuellement)' : '';
    const flagNote = (avoirs.length || problemes.length)
      ? ` — ${avoirs.length} avoir(s), ${problemes.length} en problème (notifiés).` : '';
    const message = `${downloaded} téléchargée(s), ${skipped} ignorée(s), ${errors} erreur(s) sur ${found} trouvée(s).${stoppedNote}${flagNote}`;
    await run.update({ finished_at: new Date(), status: 'success', found_count: found, downloaded_count: downloaded, skipped_count: skipped, error_count: errors, message });
    await cfg.update({ last_run_at: new Date(), last_status: 'success', last_message: message, last_downloaded_count: downloaded, updated_at: new Date() });

    // Notifier les avoirs / factures en problème rencontrés (nouveaux uniquement).
    if (avoirs.length || problemes.length) {
      await notifyJobInvoices({ avoirs, problemes, rangeStart: start, rangeEnd: end })
        .catch((e) => console.error('[AUTO-DOWNLOAD] notif:', e.message));
    }
    return { success: true, found, downloaded, skipped, errors };
  } catch (err) {
    const message = err.message || 'Erreur inconnue';
    await run.update({ finished_at: new Date(), status: 'error', found_count: found, downloaded_count: downloaded, skipped_count: skipped, error_count: errors, message });
    await cfg.update({ last_run_at: new Date(), last_status: 'error', last_message: message, updated_at: new Date() });
    return { success: false, error: message };
  } finally {
    running = false;
  }
}

/** Vérifie chaque minute s'il faut lancer le job, selon la config (lue à chaud). */
async function tick() {
  try {
    if (running) return;
    const cfg = await getConfig();
    if (!cfg.enabled) return;

    const now = new Date();
    let due = false;
    if (cfg.mode === 'daily') {
      const [h, m] = String(cfg.daily_time || '06:00').split(':').map(Number);
      const passedTime = now.getHours() > h || (now.getHours() === h && now.getMinutes() >= m);
      const ranToday = cfg.last_run_at && sameDay(cfg.last_run_at, now);
      due = passedTime && !ranToday;
    } else { // interval
      const mins = Math.max(1, cfg.interval_minutes || 120);
      due = !cfg.last_run_at || (now - new Date(cfg.last_run_at)) >= mins * 60000;
    }

    if (due) {
      console.log('[AUTO-DOWNLOAD] Déclenchement du job planifié…');
      await runJob('scheduler');
    }
  } catch (e) {
    console.error('[AUTO-DOWNLOAD] tick error:', e.message);
  }
}

function startScheduler() {
  if (timer) return;
  // Tick toutes les 60s ; la config est relue à chaque tick (les changements admin s'appliquent seuls).
  timer = setInterval(tick, 60000);
  console.log('[AUTO-DOWNLOAD] Planificateur démarré (tick 60s).');
}

module.exports = { runJob, startScheduler, getConfig, requestStop, isRunning };
