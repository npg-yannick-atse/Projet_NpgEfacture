// backfill-fne.js
// Insère dans fne_invoices + fne_invoice_items des factures réellement envoyées
// à la FNE mais non persistées en base (réponse FNE jamais enregistrée).
//
// À LANCER SUR LE SERVEUR DE PROD : node backfill-fne.js
// (utilise la connexion DB de l'app via .env + les modèles existants)
//
// Distinction cruciale : fne_invoice_id = champ JSON "id" (PAS "token").
//   Le "token" (019b.../019e...) va dans fne_token, jamais dans fne_invoice_id.

const fs = require('fs');
const path = require('path');
const db = require('./models');
const { FneInvoice, FneInvoiceItem, LogsAction, sequelize } = db;

// Utilisateur attribué au log d'envoi créé en backfill (quand aucun n'existe).
const BACKFILL_USER = 'backfill';

// Par défaut DRY_RUN (n'écrit rien, affiche seulement). Pour insérer réellement,
// lance avec le flag : node backfill-fne.js --write
const DRY_RUN = !(process.argv.includes('--write') || process.env.DRY_RUN === 'false');

// Fichiers JSON à traiter (à placer À CÔTÉ de ce script, ou mettre des chemins absolus).
const FILES = [
  'factures_2026-05-29.json',
  'factures_2026-05-29 (1).json',
];

// numero_facture SAP par fne_invoice_id (champ "id" du JSON).
// Utilisé seulement quand le commercialMessage ne contient pas "Facture N°: ...".
const SAP_MAP = {
  '75949dcc-46c0-49b8-9bd9-39f9fb85a600': '8000060678', // GL PHARMACIE — A CONFIRMER (ref 9904279V26000000001)
  // eecaf15d-... (8000061806) est déduit automatiquement depuis commercialMessage
};

function extractSapNumber(inv) {
  const m = (inv.commercialMessage || '').match(/Facture\s*N[°ºo]?\s*:?\s*(\d{6,})/i);
  if (m) return m[1];
  return SAP_MAP[inv.id] || null;
}

// Cherche le fichier à côté du script, dans le dossier parent, puis dans le répertoire courant.
function resolveFile(f) {
  if (path.isAbsolute(f) && fs.existsSync(f)) return f;
  for (const base of [__dirname, path.resolve(__dirname, '..'), process.cwd()]) {
    const c = path.resolve(base, f);
    if (fs.existsSync(c)) return c;
  }
  return null;
}

async function run() {
  // Dédup : les deux fichiers se recoupent, un fne_invoice_id ne doit être traité qu'une fois.
  const seen = new Set();
  const invoices = [];
  for (const f of FILES) {
    const abs = resolveFile(f);
    if (!abs) { console.warn('Fichier introuvable, ignoré :', f); continue; }
    console.log('Lecture :', abs);
    for (const inv of JSON.parse(fs.readFileSync(abs, 'utf8'))) {
      if (!seen.has(inv.id)) { seen.add(inv.id); invoices.push(inv); }
    }
  }
  console.log(`${invoices.length} facture(s) distincte(s) a traiter. DRY_RUN=${DRY_RUN}\n`);

  for (const inv of invoices) {
    const numero = extractSapNumber(inv);
    if (!numero) {
      console.error(`SKIP ref ${inv.reference} (id=${inv.id}) : numero SAP introuvable — ajoute-le dans SAP_MAP.`);
      continue;
    }

    const existing = await FneInvoice.findOne({ where: { fne_invoice_id: inv.id } });
    if (existing) {
      console.log(`DEJA EN BASE : ref ${inv.reference} (id=${inv.id}) -> ignoree`);
      continue;
    }

    const nbItems = Array.isArray(inv.items) ? inv.items.length : 0;
    console.log(`${DRY_RUN ? '[DRY] ' : ''}fne_invoices : ref ${inv.reference} -> SAP ${numero} (id=${inv.id}, token=${inv.token}) + ${nbItems} item(s)`);
    if (DRY_RUN) continue;

    const t = await sequelize.transaction();
    try {
      // FK : fne_invoices.numero_facture -> logs_actions.numero_facture.
      // Un log d'envoi doit exister. S'il manque, on le crée (la facture a bien été envoyée à la FNE).
      const existingLog = await LogsAction.findOne({ where: { numero_facture: numero }, transaction: t });
      if (!existingLog) {
        await LogsAction.create({
          username: BACKFILL_USER,
          numero_facture: numero,
          SendBy: BACKFILL_USER,
          SendOn: inv.date ? new Date(inv.date) : new Date(),
          invoice_type: 'invoice',
          created_by: BACKFILL_USER,
          created_on: new Date(),
          erreur: false,
          api_response: JSON.stringify({
            success: true,
            reference: inv.reference,
            invoice: { id: inv.id },
            is_manual: true,
            backfilled_on: new Date(),
            note: "Backfill : envoi FNE non persiste a l'origine",
          }),
        }, { transaction: t });
        console.log(`  + log d'envoi cree (logs_actions) pour ${numero}`);
      }

      await FneInvoice.create({
        numero_facture: numero,
        fne_invoice_id: inv.id,            // vrai id FNE (pas le token)
        fne_reference: inv.reference,
        fne_ncc: inv.company && inv.company.ncc ? inv.company.ncc : null,
        fne_token: inv.token || null,
        api_response: inv,
        type: inv.type === 'refund' ? 'refund' : 'invoice',
      }, { transaction: t });

      for (const it of (inv.items || [])) {
        const exists = await FneInvoiceItem.findOne({ where: { fne_item_id: it.id }, transaction: t });
        if (exists) continue;
        await FneInvoiceItem.create({
          fne_invoice_id: inv.id,
          fne_item_id: it.id,
          reference: it.reference || null,
          description: it.description || null,
          quantity: it.quantity != null ? it.quantity : null,
          item_data: it,
        }, { transaction: t });
      }
      await t.commit();
      console.log(`  OK insere (entete + ${nbItems} items)`);
    } catch (e) {
      await t.rollback();
      console.error(`  ERREUR pour ${inv.reference} :`, e.message);
    }
  }

  await sequelize.close();
  console.log('\nTermine.');
}

run().catch(err => { console.error('ERREUR FATALE :', err); process.exit(1); });
