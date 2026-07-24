/**
 * Concordance entre 2 fichiers Excel par référence FNE :
 *   - Fichier 1 : Facture_ProsumaPort.xls (export app : numero_facture + fne_reference)
 *   - Fichier 2 : fichier prosuma port.xlsx (feuille "Feuil2 (2)" : N° Facture + Référence FNE_PROD)
 *
 * Pour chaque ligne du fichier 2, on cherche sa Référence FNE_PROD dans le fichier 1.
 * Si trouvée, on ajoute le numero_facture concordant + un statut.
 *
 * Sortie : un nouveau fichier .xlsx avec 4 feuilles :
 *   1. Concordance      → fichier 2 enrichi (toutes les lignes + colonnes de concordance)
 *   2. Matchs trouvés   → uniquement les lignes qui matchent
 *   3. Non trouvés      → lignes du fichier 1 (l'app) qui ne sont PAS dans le fichier 2
 *   4. Stats            → résumé global
 *
 * Usage : node scripts/concordance_prosuma_port.js
 */
const path = require('path');
const XLSX = require('../../frontend_efacture_05052026/node_modules/xlsx');

const FILE1 = 'D:/Users/yannick.atse/Desktop/E_Facture/Facture_ProsumaPort.xls';
const FILE2 = 'D:/Users/yannick.atse/Desktop/E_Facture/fichier prosuma port.xlsx';
const OUT   = 'D:/Users/yannick.atse/Desktop/E_Facture/concordance_prosuma_port.xlsx';

const norm = (v) => (v == null ? '' : String(v).trim());
const normFne = (v) => norm(v).toUpperCase().replace(/\s+/g, '');

// ─── 1. Charger le fichier 1 (source de vérité app) ────────────────────────
console.log('1. Lecture du fichier 1 (app)…');
const wb1 = XLSX.readFile(FILE1);
const rows1 = XLSX.utils.sheet_to_json(wb1.Sheets[wb1.SheetNames[0]], { defval: null, raw: false });
console.log(`   ${rows1.length} lignes chargées.`);

// Index par fne_reference → liste de numéros de facture (au cas où plusieurs)
// et par numero_facture → fne_reference (pour vérif inverse)
const byFne     = new Map();
const byNumero  = new Map();
let withFneCount = 0;
for (const r of rows1) {
  const num  = norm(r.numero_facture);
  const fne  = normFne(r.fne_reference);
  if (num)  byNumero.set(num, { fne, statut: norm(r.statut), erreur: norm(r.erreur) });
  if (fne) {
    withFneCount++;
    if (!byFne.has(fne)) byFne.set(fne, []);
    byFne.get(fne).push({
      numero_facture: num,
      statut: norm(r.statut),
      erreur: norm(r.erreur),
      erreur_message: norm(r.erreur_message),
    });
  }
}
console.log(`   → ${byFne.size} références FNE distinctes (sur ${withFneCount} non-vides)`);
console.log(`   → ${byNumero.size} numéros de facture distincts`);

// ─── 2. Charger le fichier 2 (pool comptable) ──────────────────────────────
console.log('\n2. Lecture du fichier 2 (pool)…');
const wb2 = XLSX.readFile(FILE2);
const sheet2Name = wb2.SheetNames.find(n => n.includes('(2)')) || wb2.SheetNames[0];
console.log(`   Feuille utilisée : "${sheet2Name}"`);
const rows2 = XLSX.utils.sheet_to_json(wb2.Sheets[sheet2Name], { defval: null, raw: false });
console.log(`   ${rows2.length} lignes chargées.`);

// ─── 3. Enrichir chaque ligne du fichier 2 ────────────────────────────────
console.log('\n3. Concordance par référence FNE…');
const matchedFneSet = new Set();
let matchByFne = 0;
let matchByNum = 0;
let noMatch = 0;
let bothEmpty = 0;
let conflict = 0;

const enriched = rows2.map(r => {
  const fnePool   = normFne(r['Référence FNE_PROD']);
  const numPool   = norm(r['N° Facture']);
  const out = { ...r };

  let matchInfo = null;
  if (fnePool && byFne.has(fnePool)) {
    const candidates = byFne.get(fnePool);
    matchInfo = candidates[0];
    matchByFne++;
    matchedFneSet.add(fnePool);
    out.Concordance_NumFacture_App = matchInfo.numero_facture;
    out.Concordance_Statut_App    = matchInfo.statut;
    out.Match_Type                = 'PAR REF FNE';
    if (numPool && norm(matchInfo.numero_facture) !== numPool) {
      conflict++;
      out.Match_Type = 'PAR REF FNE — CONFLIT N° FACTURE';
      out.Concordance_Note = `Le pool a N°=${numPool} mais l'app dit N°=${matchInfo.numero_facture}`;
    }
  } else if (numPool && byNumero.has(numPool)) {
    // Fallback : pas de match sur la réf FNE, mais le numero_facture existe dans l'app
    const info = byNumero.get(numPool);
    matchByNum++;
    out.Concordance_NumFacture_App = numPool;
    out.Concordance_Statut_App    = info.statut;
    out.Match_Type                = 'PAR N° FACTURE (réf FNE différente)';
    if (info.fne && info.fne !== fnePool) {
      out.Concordance_Note = `Le pool a réf FNE=${r['Référence FNE_PROD'] || '(vide)'} mais l'app dit réf=${info.fne}`;
    }
  } else if (!fnePool && !numPool) {
    bothEmpty++;
    out.Match_Type = '(ligne vide)';
  } else {
    noMatch++;
    out.Match_Type = 'NON TROUVÉ DANS APP';
  }

  return out;
});

// ─── 4. Lignes de l'app non trouvées dans le pool ──────────────────────────
const orphansFromApp = [];
for (const [fne, candidates] of byFne.entries()) {
  if (!matchedFneSet.has(fne)) {
    candidates.forEach(c => orphansFromApp.push({
      numero_facture: c.numero_facture,
      fne_reference:  fne,
      statut:         c.statut,
      erreur:         c.erreur,
      erreur_message: c.erreur_message,
      raison:         'Réf FNE absente du pool comptable',
    }));
  }
}

// Et les lignes du fichier 1 SANS réf FNE (envois en erreur)
const errorsInApp = rows1.filter(r => !normFne(r.fne_reference)).map(r => ({
  numero_facture: norm(r.numero_facture),
  fne_reference:  '',
  statut:         norm(r.statut),
  erreur:         norm(r.erreur),
  erreur_message: norm(r.erreur_message),
  raison:         'Pas de référence FNE (échec d\'envoi)',
}));

// ─── 5. Stats ──────────────────────────────────────────────────────────────
const stats = [
  { Métrique: 'Total lignes Fichier 1 (app)',                  Valeur: rows1.length },
  { Métrique: '  dont avec référence FNE valide',              Valeur: withFneCount },
  { Métrique: '  dont en échec / sans réf FNE',                Valeur: rows1.length - withFneCount },
  { Métrique: '',                                              Valeur: '' },
  { Métrique: 'Total lignes Fichier 2 (pool comptable)',       Valeur: rows2.length },
  { Métrique: '  Match par référence FNE',                     Valeur: matchByFne },
  { Métrique: '  Match par N° Facture (fallback)',             Valeur: matchByNum },
  { Métrique: '  Non trouvées dans l\'app',                    Valeur: noMatch },
  { Métrique: '  Lignes vides',                                Valeur: bothEmpty },
  { Métrique: '  Conflits (FNE OK mais N° facture différent)', Valeur: conflict },
  { Métrique: '',                                              Valeur: '' },
  { Métrique: 'Lignes app absentes du pool',                   Valeur: orphansFromApp.length },
  { Métrique: 'Lignes app en erreur (sans réf FNE)',           Valeur: errorsInApp.length },
];

// ─── 6. Écrire le fichier de sortie ────────────────────────────────────────
console.log('\n4. Écriture du fichier de sortie…');
const wbOut = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wbOut, XLSX.utils.json_to_sheet(enriched),       'Concordance');
XLSX.utils.book_append_sheet(wbOut, XLSX.utils.json_to_sheet(enriched.filter(e => e.Match_Type && e.Match_Type.startsWith('PAR'))), 'Matchs trouvés');
XLSX.utils.book_append_sheet(wbOut, XLSX.utils.json_to_sheet([...orphansFromApp, ...errorsInApp]), 'App non concordés');
XLSX.utils.book_append_sheet(wbOut, XLSX.utils.json_to_sheet(stats),          'Stats');
XLSX.writeFile(wbOut, OUT);

console.log(`\n✓ Fichier généré : ${OUT}\n`);
stats.forEach(s => {
  if (s.Métrique) console.log(`  ${s.Métrique.padEnd(50)} ${String(s.Valeur).padStart(8)}`);
});
console.log(`\nFeuilles générées :`);
console.log(`  • Concordance       → toutes les lignes du pool, enrichies`);
console.log(`  • Matchs trouvés    → uniquement les ${matchByFne + matchByNum} lignes qui matchent`);
console.log(`  • App non concordés → ${orphansFromApp.length + errorsInApp.length} factures de l'app absentes du pool ou en erreur`);
console.log(`  • Stats             → résumé global`);
