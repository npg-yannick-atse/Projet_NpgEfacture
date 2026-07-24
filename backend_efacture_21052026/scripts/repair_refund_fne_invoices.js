/**
 * Réparation : créer les entrées fne_invoices manquantes pour les avoirs
 * dont l'envoi a réussi mais qui n'ont pas été enregistrés dans la table.
 *
 * Cause : avant le fix qui ajoute la création de la FneInvoice après un envoi
 *         d'avoir réussi, les avoirs étaient uniquement loggés dans logs_actions.
 *
 * Usage :
 *   node scripts/repair_refund_fne_invoices.js          # dry-run, montre ce qui serait fait
 *   node scripts/repair_refund_fne_invoices.js --apply  # applique réellement les inserts
 */
require('dotenv').config();
const db = require('../models');
const { LogsAction, FneInvoice } = db;

const APPLY = process.argv.includes('--apply');

const norm = (v) => v == null ? '' : String(v).trim();

// Tente d'extraire l'ID FNE et la référence depuis api_response (toutes variantes connues).
function extractFneFromApiResponse(apiResponse) {
  if (!apiResponse) return null;
  let resp = apiResponse;
  if (typeof resp === 'string') {
    try { resp = JSON.parse(resp); } catch { return null; }
  }
  // Si l'API a renvoyé une erreur (success=false), on n'enregistre rien
  if (resp.success === false) return null;
  if (resp.error || resp.errorMessage) return null;

  const fneId =
    resp.invoice?.id ||
    resp.id ||
    resp.refund_id ||
    resp.credit_note_id ||
    resp.fne_response?.invoice?.id ||
    resp.response?.invoice?.id ||
    null;

  const fneRef =
    resp.reference ||
    resp.credit_note_reference ||
    resp.refund_reference ||
    resp.invoice?.reference ||
    resp.fne_response?.reference ||
    resp.response?.reference ||
    null;

  const fneNcc   = resp.ncc || resp.invoice?.ncc || null;
  const fneToken = resp.token || resp.invoice?.token || null;

  if (!fneId && !fneRef) return null;

  return {
    fne_invoice_id: fneId ? String(fneId).trim() : null,
    fne_reference: fneRef ? String(fneRef).trim() : null,
    fne_ncc: fneNcc ? String(fneNcc).trim() : null,
    fne_token: fneToken ? String(fneToken).trim() : null,
    api_response: resp,
  };
}

(async () => {
  await db.sequelize.authenticate();

  console.log(APPLY ? '🛠  Mode APPLY — les changements seront écrits en base.' : '🔍 DRY-RUN — aucune écriture, lance avec --apply pour appliquer.');

  // 1. Lister tous les logs d'avoir réussis
  const refundLogs = await LogsAction.findAll({
    where: { invoice_type: 'refund' },
    order: [['SendOn', 'ASC']],
    raw: true,
  });
  console.log(`\nLogs d'avoirs trouvés : ${refundLogs.length}`);

  let toCreate = 0;
  let alreadyOk = 0;
  let cantParse = 0;
  let noFneId = 0;
  let isCancellation = 0;
  let created = 0;
  let conflicts = 0;

  const lines = [];

  for (const log of refundLogs) {
    if (!log.api_response) {
      cantParse++;
      continue;
    }
    const extracted = extractFneFromApiResponse(log.api_response);
    if (!extracted) {
      cantParse++;
      continue;
    }
    // Si pas d'invoice.id mais qu'on a une reference FNE, on génère un ID synthétique
    // basé sur la référence (l'API FNE refund ne renvoie pas d'invoice.id, juste une ref).
    if (!extracted.fne_invoice_id && extracted.fne_reference) {
      extracted.fne_invoice_id = `REFUND_${extracted.fne_reference}`;
    }
    if (!extracted.fne_invoice_id) {
      noFneId++;
      lines.push({
        log_id: log.id,
        numero: log.numero_facture,
        action: 'SKIP — ni fne_invoice_id ni fne_reference exploitable',
        ref: extracted.fne_reference,
      });
      continue;
    }

    // Détection : est-ce une annulation de doublon (cas géré par fneDuplicates) ?
    const ar = typeof log.api_response === 'string' ? JSON.parse(log.api_response) : log.api_response;
    const isCancel = !!(ar?.cancellation || ar?.cancelled_fne_invoice_id || ar?.cancelled_fne_reference);
    if (isCancel) isCancellation++;

    // Existe-t-il déjà une fne_invoice pour ce fne_invoice_id ?
    const existing = await FneInvoice.findOne({
      where: { fne_invoice_id: extracted.fne_invoice_id },
      raw: true,
    });
    if (existing) {
      alreadyOk++;
      continue;
    }

    // Sinon : la créer (en mode APPLY) ou simuler (dry-run)
    toCreate++;
    const newRow = {
      numero_facture: log.numero_facture,
      fne_invoice_id: extracted.fne_invoice_id,
      fne_reference: extracted.fne_reference,
      fne_ncc: extracted.fne_ncc,
      fne_token: extracted.fne_token,
      api_response: extracted.api_response,
      type: 'refund',
      created_at: log.SendOn || new Date(),
      updated_at: log.SendOn || new Date(),
    };

    if (APPLY) {
      try {
        await FneInvoice.create(newRow);
        created++;
      } catch (e) {
        conflicts++;
        lines.push({ log_id: log.id, numero: log.numero_facture, action: `ERREUR: ${e.message.slice(0, 100)}`, ref: extracted.fne_reference });
        continue;
      }
    }

    lines.push({
      log_id: log.id,
      numero: log.numero_facture,
      action: APPLY ? 'CRÉÉE' : 'À CRÉER',
      ref: extracted.fne_reference,
      fne_id: extracted.fne_invoice_id.slice(0, 36) + (extracted.fne_invoice_id.length > 36 ? '…' : ''),
    });
  }

  // 2. Résumé
  console.log('\n─── RÉCAPITULATIF ───');
  console.log(`  Logs d'avoirs analysés                     : ${refundLogs.length}`);
  console.log(`  Déjà présents en fne_invoices              : ${alreadyOk}`);
  console.log(`  À créer (manquants)                        : ${toCreate}`);
  console.log(`    dont annulations de doublons             : ${isCancellation}`);
  console.log(`  Skippés (pas de fne_invoice_id parsable)   : ${noFneId}`);
  console.log(`  Skippés (api_response illisible)           : ${cantParse}`);
  if (APPLY) {
    console.log(`  → Effectivement créés                      : ${created}`);
    if (conflicts > 0) console.log(`  → ⚠ Conflits / erreurs                     : ${conflicts}`);
  }

  // 3. Détail (max 50 lignes pour ne pas saturer)
  if (lines.length > 0) {
    console.log(`\n─── Détail (${lines.length} lignes, ${Math.min(50, lines.length)} affichées) ───`);
    lines.slice(0, 50).forEach(l => {
      const ref = l.ref ? `ref=${l.ref}` : 'ref=∅';
      const fneId = l.fne_id ? `id=${l.fne_id}` : '';
      console.log(`  log#${l.log_id}  num=${l.numero}  ${l.action.padEnd(38)}  ${ref}  ${fneId}`);
    });
    if (lines.length > 50) console.log(`  … et ${lines.length - 50} de plus`);
  }

  if (!APPLY && toCreate > 0) {
    console.log(`\n${'─'.repeat(60)}`);
    console.log(`Pour appliquer réellement la réparation :`);
    console.log(`  node scripts/repair_refund_fne_invoices.js --apply`);
    console.log(`${'─'.repeat(60)}`);
  }

  await db.sequelize.close();
})().catch(err => {
  console.error('Erreur fatale :', err);
  process.exit(1);
});
