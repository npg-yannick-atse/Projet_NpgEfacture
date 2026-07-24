/**
 * Réparation PROD : créer les fne_invoices manquantes pour les avoirs envoyés.
 *
 * Diffère de la version locale : se connecte directement à PROD via mysql2,
 * indépendamment de l'environnement local.
 *
 * Usage :
 *   node scripts/repair_refund_fne_invoices_prod.js          # dry-run
 *   node scripts/repair_refund_fne_invoices_prod.js --apply  # applique
 */
const mysql = require('mysql2/promise');

const PROD = {
  host: '10.10.2.17',
  port: 3306,
  user: 'connectdb',
  password: 'c0n3!@#2030',
  database: 'npg_efacture',
};

const APPLY = process.argv.includes('--apply');

function extractFneFromApiResponse(apiResponse) {
  if (!apiResponse) return null;
  let resp = apiResponse;
  if (typeof resp === 'string') {
    try { resp = JSON.parse(resp); } catch { return null; }
  }
  if (resp.success === false) return null;
  if (resp.error || resp.errorMessage) return null;

  const fneId =
    resp.invoice?.id || resp.id || resp.refund_id || resp.credit_note_id ||
    resp.fne_response?.invoice?.id || resp.response?.invoice?.id || null;

  const fneRef =
    resp.reference || resp.credit_note_reference || resp.refund_reference ||
    resp.invoice?.reference || resp.fne_response?.reference || resp.response?.reference || null;

  const fneNcc   = resp.ncc || resp.invoice?.ncc || null;
  const fneToken = resp.token || resp.invoice?.token || null;

  if (!fneId && !fneRef) return null;

  return {
    fne_invoice_id: fneId ? String(fneId).trim() : null,
    fne_reference:  fneRef ? String(fneRef).trim() : null,
    fne_ncc:        fneNcc ? String(fneNcc).trim() : null,
    fne_token:      fneToken ? String(fneToken).trim() : null,
    api_response:   resp,
  };
}

(async () => {
  const conn = await mysql.createConnection(PROD);
  console.log(`🔗 Connecté PROD ${PROD.host}/${PROD.database}`);
  console.log(APPLY ? '🛠  Mode APPLY' : '🔍 DRY-RUN — lance avec --apply pour écrire en base.');

  const [refundLogs] = await conn.query(
    `SELECT id, numero_facture, SendBy, SendOn, api_response
     FROM logs_actions
     WHERE invoice_type = 'refund'
     ORDER BY SendOn ASC`
  );
  console.log(`\n${refundLogs.length} log(s) d'avoir trouvé(s).`);

  let toCreate = 0, alreadyOk = 0, noFne = 0, created = 0, conflicts = 0;
  const lines = [];

  for (const log of refundLogs) {
    const ext = extractFneFromApiResponse(log.api_response);
    if (!ext) { noFne++; continue; }

    let effectiveFneId = ext.fne_invoice_id;
    if (!effectiveFneId && ext.fne_reference) {
      effectiveFneId = `REFUND_${ext.fne_reference}`;
    }
    if (!effectiveFneId) { noFne++; continue; }

    const [exists] = await conn.query(
      `SELECT id FROM fne_invoices WHERE fne_invoice_id = ? LIMIT 1`,
      [effectiveFneId]
    );
    if (exists.length > 0) { alreadyOk++; continue; }

    toCreate++;
    if (APPLY) {
      try {
        await conn.query(
          `INSERT INTO fne_invoices
             (numero_facture, fne_invoice_id, fne_reference, fne_ncc, fne_token, api_response, type, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, 'refund', ?, ?)`,
          [
            log.numero_facture,
            effectiveFneId,
            ext.fne_reference,
            ext.fne_ncc,
            ext.fne_token,
            JSON.stringify(ext.api_response),
            log.SendOn || new Date(),
            log.SendOn || new Date(),
          ]
        );
        created++;
      } catch (e) {
        conflicts++;
        lines.push({ log_id: log.id, numero: log.numero_facture, action: `ERREUR: ${e.message.slice(0, 80)}`, ref: ext.fne_reference });
        continue;
      }
    }
    lines.push({
      log_id: log.id,
      numero: log.numero_facture,
      action: APPLY ? 'CRÉÉE' : 'À CRÉER',
      ref: ext.fne_reference,
      fne_id: effectiveFneId.slice(0, 40),
    });
  }

  console.log('\n─── RÉCAPITULATIF ───');
  console.log(`  Logs analysés                     : ${refundLogs.length}`);
  console.log(`  Déjà en fne_invoices              : ${alreadyOk}`);
  console.log(`  À créer (manquants)               : ${toCreate}`);
  console.log(`  Skippés (pas de FNE id ni ref)    : ${noFne}`);
  if (APPLY) {
    console.log(`  → Effectivement créés             : ${created}`);
    if (conflicts > 0) console.log(`  → ⚠ Conflits / erreurs            : ${conflicts}`);
  }

  if (lines.length > 0) {
    console.log(`\n─── Détail (${lines.length}) ───`);
    lines.forEach(l => {
      console.log(`  log#${l.log_id}  num=${l.numero}  ${l.action.padEnd(30)}  ref=${l.ref}  id=${l.fne_id || ''}`);
    });
  }

  if (!APPLY && toCreate > 0) {
    console.log(`\n→ Pour appliquer : node scripts/repair_refund_fne_invoices_prod.js --apply`);
  }
  await conn.end();
})().catch(err => { console.error('Erreur :', err.message); process.exit(1); });
