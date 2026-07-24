/**
 * Diagnostic ponctuel sur la base PROD : où apparaît un n° donné ?
 * Usage : node scripts/check_avoir_prod.js [numero]
 *   défaut : 8700006861
 */
const mysql = require('mysql2/promise');

const PROD = {
  host: '10.10.2.17',
  port: 3306,
  user: 'connectdb',
  password: 'c0n3!@#2030',
  database: 'npg_efacture',
};

const NUMERO = (process.argv[2] || '8700006861').trim();

(async () => {
  const conn = await mysql.createConnection(PROD);
  console.log(`\n🔎 PROD ${PROD.host} — recherche sur '${NUMERO}'\n`);

  // 1. logs_actions
  console.log('── logs_actions ─────────────────────────────────────────');
  const [logs] = await conn.query(
    `SELECT id, numero_facture, invoice_type, SendBy, SendOn, downloadBy, download_date, delete_by, delete_on, erreur,
            LEFT(api_response, 250) AS api_preview
     FROM logs_actions
     WHERE numero_facture = ? OR numero_facture = ?
     ORDER BY id DESC`,
    [NUMERO, NUMERO.padStart(10, '0')]
  );
  if (logs.length === 0) {
    console.log('  ✗ aucun log');
  } else {
    logs.forEach(l => {
      const action = l.SendOn ? `ENVOI (${l.invoice_type})`
                  : l.download_date ? 'DOWNLOAD'
                  : l.delete_on ? 'DELETE'
                  : 'AUTRE';
      console.log(`  log#${l.id}  ${action}  par=${l.SendBy || l.downloadBy || l.delete_by || '?'}  le=${l.SendOn || l.download_date || l.delete_on || '?'}  erreur=${l.erreur}`);
      if (l.api_preview) console.log(`            api_response: ${l.api_preview.replace(/\s+/g, ' ').slice(0, 200)}…`);
    });
  }

  // 2. fne_invoices
  console.log('\n── fne_invoices ─────────────────────────────────────────');
  const [fne] = await conn.query(
    `SELECT id, numero_facture, fne_invoice_id, fne_reference, type, created_at
     FROM fne_invoices
     WHERE numero_facture = ? OR numero_facture = ?`,
    [NUMERO, NUMERO.padStart(10, '0')]
  );
  if (fne.length === 0) {
    console.log('  ✗ aucune entrée');
  } else {
    fne.forEach(f => {
      console.log(`  fne#${f.id}  type=${f.type}  ref=${f.fne_reference}  fne_id=${f.fne_invoice_id}  créée=${f.created_at}`);
    });
  }

  // 3. downloaded_invoices
  console.log('\n── downloaded_invoices ──────────────────────────────────');
  const [dl] = await conn.query(
    `SELECT id, numero, client, username, download_date, invoice_type_code
     FROM downloaded_invoices
     WHERE numero = ? OR numero = ?`,
    [NUMERO, NUMERO.padStart(10, '0')]
  );
  if (dl.length === 0) {
    console.log('  ✗ pas téléchargée');
  } else {
    dl.forEach(d => console.log(`  dl#${d.id}  ${d.numero}  client=${d.client}  par=${d.username}  le=${d.download_date}  type=${d.invoice_type_code}`));
  }

  // 4. Compteur global avoirs en logs_actions vs fne_invoices type='refund'
  console.log('\n── Compteurs globaux refunds ────────────────────────────');
  const [[la]] = await conn.query(`SELECT COUNT(*) AS n FROM logs_actions WHERE invoice_type='refund'`);
  const [[fi]] = await conn.query(`SELECT COUNT(*) AS n FROM fne_invoices WHERE type='refund'`);
  console.log(`  logs_actions invoice_type='refund'   : ${la.n}`);
  console.log(`  fne_invoices type='refund'           : ${fi.n}`);
  console.log(`  → écart                              : ${la.n - fi.n} (avoirs non enregistrés en fne_invoices)`);

  await conn.end();
})().catch(err => { console.error('Erreur :', err.message); process.exit(1); });
