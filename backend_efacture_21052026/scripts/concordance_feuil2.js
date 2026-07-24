/**
 * Concordance Feuil2 (grand livre PROSUMA PORT) ↔ Facture_ProsumaPort.xls
 *
 * Règle de match (donnée par l'utilisateur) :
 *   Le n° après le dash dans le libellé compta correspond à la FIN de la référence FNE.
 *   Exemples :
 *     libelle "FLO8-60587"   → match si une fne_reference se termine par "60587"
 *     libelle "AVL87-6550"   → match si une fne_reference se termine par "6550"
 *     libelle "...AVL87-65500..." → on prend la dernière séquence "PREFIX-DIGITS"
 *
 * Sortie : Feuil2 enrichie avec :
 *   - Suffixe_FNE_Detecte   : digits extraits du libellé
 *   - Reference_FNE         : référence FNE complète qui matche
 *   - Numero_Facture_App    : n° de facture côté app
 *   - Statut_App            : statut côté app
 *   - Match_Note            : info / ambiguïté éventuelle
 */
const XLSX = require('../../frontend_efacture_05052026/node_modules/xlsx');

const FILE1 = 'D:/Users/yannick.atse/Desktop/E_Facture/Facture_ProsumaPort.xls';
const FILE2 = 'D:/Users/yannick.atse/Desktop/E_Facture/fichier prosuma port.xlsx';
// Si le fichier "concordance_feuil2_prosuma.xlsx" est ouvert dans Excel,
// on écrit dans une variante datée pour éviter EBUSY.
const OUT_BASE = 'D:/Users/yannick.atse/Desktop/E_Facture/concordance_feuil2_prosuma';
const fs = require('fs');
function pickOutPath() {
  const main = OUT_BASE + '.xlsx';
  try {
    // tester l'accès en écriture
    if (fs.existsSync(main)) {
      const fd = fs.openSync(main, 'r+');
      fs.closeSync(fd);
    }
    return main;
  } catch {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    return `${OUT_BASE}_${stamp}.xlsx`;
  }
}
const OUT = pickOutPath();

const norm = (v) => v == null ? '' : String(v).trim();

// ─── 1. Charger fichier 1 (app) ─────────────────────────────────────────
console.log('1. Lecture du fichier 1 (app)…');
const wb1 = XLSX.readFile(FILE1);
const rows1 = XLSX.utils.sheet_to_json(wb1.Sheets[wb1.SheetNames[0]], { defval: null, raw: false });
console.log(`   ${rows1.length} lignes`);

// On indexe les FNE par suffixe : pour chaque longueur de suffixe utile, on stocke
// la liste des FNE qui se terminent par ce suffixe.
// Ex: "9904279V26000005378" → suffixes "8", "78", "378", "5378", "05378", "005378", ...
const SUFFIX_LENGTHS = [3, 4, 5, 6, 7, 8, 9, 10, 11];
const byFneSuffix = new Map();   // suffix → [{ fne, num, statut, erreur }]
let withFneCount = 0;

for (const r of rows1) {
  const num    = norm(r.numero_facture);
  const fne    = norm(r.fne_reference);
  const statut = norm(r.statut);
  if (!fne) continue;
  withFneCount++;
  const entry = { fne, num, statut, erreur: norm(r.erreur) };
  for (const len of SUFFIX_LENGTHS) {
    if (fne.length >= len) {
      const sfx = fne.slice(-len);
      if (!byFneSuffix.has(sfx)) byFneSuffix.set(sfx, []);
      byFneSuffix.get(sfx).push(entry);
    }
  }
}
console.log(`   → ${withFneCount} fne_reference indexées par suffixe`);

// ─── 2. Extraction des suffixes candidats depuis un libellé ────────────
// Deux formats de libellés observés :
//   FORMAT NOUVEAU : "FLO26000001052 SAV+PROSUMA PORT"
//     → "26000001052" est la fin EXACTE de la fne_reference (9904279V + 26000001052).
//   FORMAT ANCIEN  : "FLO8-60488 AIF+PROSUMA S005042"
//     → "005042" (après le S) correspond à la fin courte d'une FNE.
function extractSuffixCandidatesFromLibelle(libelle) {
  const s = norm(libelle);
  if (!s) return [];
  const candidates = [];

  // a) PRIORITÉ : séquence de 11 chiffres consécutifs (format nouveau)
  //    Ex: FLO26000001052 → suffix = "26000001052"
  const elevenMatches = [...s.matchAll(/(\d{11})/g)];
  for (const m of elevenMatches) {
    candidates.push({ src: `11-digit "${m[1]}"`, suffix: m[1] });
  }

  // b) Pattern \w+\d+ en fin de libellé (ex: S005042) — format ancien
  const tailMatch = s.match(/[A-Z]+(\d{4,10})\s*$/i);
  if (tailMatch) {
    const digits = tailMatch[1];
    candidates.push({ src: `tail "${tailMatch[0]}"`, suffix: digits });
    if (digits.startsWith('0')) candidates.push({ src: `tail (no leading 0)`, suffix: digits.replace(/^0+/, '') });
  }

  // c) Pattern PREFIX-DIGITS en début (ex: FLO8-60488)
  const dashMatch = s.match(/(\d{1,3})-(\d{2,8})/);
  if (dashMatch) candidates.push({ src: `dash "${dashMatch[0]}"`, suffix: dashMatch[2] });

  // dedup en gardant le 1er
  const seen = new Set();
  return candidates.filter(c => { if (seen.has(c.suffix)) return false; seen.add(c.suffix); return true; });
}

// ─── 3. Match : on essaie le suffixe extrait, puis le suffixe avec préfixes possibles
function findFneMatch(extractedSuffix) {
  if (!extractedSuffix) return null;
  // Essai direct du suffixe
  if (byFneSuffix.has(extractedSuffix)) {
    return byFneSuffix.get(extractedSuffix);
  }
  // Essai avec zéros prepends (cas où le libellé a tronqué les zéros initiaux du suffixe FNE)
  for (let zerosToAdd = 1; zerosToAdd <= 3; zerosToAdd++) {
    const padded = '0'.repeat(zerosToAdd) + extractedSuffix;
    if (byFneSuffix.has(padded)) return byFneSuffix.get(padded);
  }
  return null;
}

// ─── 4. Charger Feuil2 ──────────────────────────────────────────────────
console.log('\n2. Lecture du fichier 2 (Feuil2)…');
const wb2 = XLSX.readFile(FILE2);
const rows2 = XLSX.utils.sheet_to_json(wb2.Sheets['Feuil2'], { defval: null, raw: false });
console.log(`   ${rows2.length} lignes`);

// ─── 5. Concordance ────────────────────────────────────────────────────
console.log('\n3. Concordance par suffixe FNE depuis libelle…');
let matched = 0, noMatch = 0, ambiguous = 0;
const matchedFneSet = new Set();

const enriched = rows2.map(r => {
  const lib = norm(r.libelle);
  const candidates = extractSuffixCandidatesFromLibelle(lib);
  const out = { ...r };

  let chosen = null;        // { src, suffix, fneMatches }
  for (const c of candidates) {
    const matches = findFneMatch(c.suffix);
    if (matches && matches.length > 0) { chosen = { ...c, fneMatches: matches }; break; }
  }

  out.Suffixes_Testes = candidates.map(c => `${c.suffix}(${c.src})`).join(' | ') || '(aucun)';

  if (!chosen) {
    noMatch++;
    out.Suffixe_FNE_Detecte = '';
    out.Reference_FNE       = '';
    out.Numero_Facture_App  = '';
    out.Statut_App          = '';
    out.Match_Note          = candidates.length > 0
      ? `aucun des suffixes testés ne matche : ${candidates.map(c => c.suffix).join(', ')}`
      : 'aucun chiffre exploitable dans libelle';
    return out;
  }

  out.Suffixe_FNE_Detecte = chosen.suffix;
  if (chosen.fneMatches.length === 1) {
    matched++;
    matchedFneSet.add(chosen.fneMatches[0].fne);
    out.Reference_FNE      = chosen.fneMatches[0].fne;
    out.Numero_Facture_App = chosen.fneMatches[0].num;
    out.Statut_App         = chosen.fneMatches[0].statut;
    out.Match_Note         = `match unique via ${chosen.src} → suffixe "${chosen.suffix}"`;
  } else {
    ambiguous++;
    matched++;
    chosen.fneMatches.forEach(c => matchedFneSet.add(c.fne));
    out.Reference_FNE      = chosen.fneMatches[0].fne;
    out.Numero_Facture_App = chosen.fneMatches[0].num;
    out.Statut_App         = chosen.fneMatches[0].statut;
    out.Match_Note         = `AMBIGU via ${chosen.src} : ${chosen.fneMatches.length} FNE matchent suffixe "${chosen.suffix}" → ${chosen.fneMatches.map(c => c.num).join(', ')}`;
  }
  return out;
});

// ─── 6. App non concordés ──────────────────────────────────────────────
const orphansFromApp = [];
for (const r of rows1) {
  const fne = norm(r.fne_reference);
  if (!fne) {
    orphansFromApp.push({
      numero_facture: norm(r.numero_facture),
      fne_reference: '',
      statut: norm(r.statut),
      raison: 'Aucune réf FNE (échec d\'envoi)',
    });
  } else if (!matchedFneSet.has(fne)) {
    orphansFromApp.push({
      numero_facture: norm(r.numero_facture),
      fne_reference: fne,
      statut: norm(r.statut),
      raison: 'FNE absente du grand livre Feuil2',
    });
  }
}

// ─── 7. Stats ───────────────────────────────────────────────────────────
const stats = [
  { Métrique: 'Lignes Fichier 1 (app)',                   Valeur: rows1.length },
  { Métrique: '  avec réf FNE',                           Valeur: withFneCount },
  { Métrique: '',                                         Valeur: '' },
  { Métrique: 'Lignes Feuil2 (compta)',                   Valeur: rows2.length },
  { Métrique: '  avec match',                             Valeur: matched },
  { Métrique: '    dont matchs ambigus (>1 candidat FNE)', Valeur: ambiguous },
  { Métrique: '  sans match',                             Valeur: noMatch },
  { Métrique: '',                                         Valeur: '' },
  { Métrique: 'FNE distinctes touchées par la compta',    Valeur: matchedFneSet.size },
  { Métrique: 'FNE de l\'app non retrouvées en compta',   Valeur: orphansFromApp.length },
];

// ─── 8. Écriture ───────────────────────────────────────────────────────
console.log('\n4. Écriture du fichier de sortie…');
const wbOut = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wbOut, XLSX.utils.json_to_sheet(enriched),                    'Feuil2_Enrichie');
XLSX.utils.book_append_sheet(wbOut, XLSX.utils.json_to_sheet(enriched.filter(e => e.Reference_FNE)), 'Avec FNE');
XLSX.utils.book_append_sheet(wbOut, XLSX.utils.json_to_sheet(enriched.filter(e => !e.Reference_FNE)), 'Sans FNE (Feuil2 non match)');
XLSX.utils.book_append_sheet(wbOut, XLSX.utils.json_to_sheet(enriched.filter(e => /AMBIGU/.test(e.Match_Note))), 'Ambiguïtés');
XLSX.utils.book_append_sheet(wbOut, XLSX.utils.json_to_sheet(orphansFromApp),              'App non concordés');
XLSX.utils.book_append_sheet(wbOut, XLSX.utils.json_to_sheet(stats),                       'Stats');
XLSX.writeFile(wbOut, OUT);

console.log(`\n✓ Fichier généré : ${OUT}\n`);
stats.forEach(s => { if (s.Métrique) console.log(`  ${s.Métrique.padEnd(50)} ${String(s.Valeur).padStart(8)}`); });

// ─── 9. Quelques exemples de match pour debug ──────────────────────────
console.log('\n── Exemples de matches (5 premiers) ──');
enriched.filter(e => e.Reference_FNE).slice(0, 5).forEach((e, i) => {
  console.log(`  [${i+1}] libelle="${e.libelle}"  → suffixe="${e.Suffixe_FNE_Detecte}"  → FNE=${e.Reference_FNE}  N°=${e.Numero_Facture_App}`);
});
console.log('\n── Exemples de non-matches (10 premiers, avec suffixes testés) ──');
enriched.filter(e => !e.Reference_FNE).slice(0, 10).forEach((e, i) => {
  console.log(`  [${i+1}] libelle="${e.libelle}"`);
  console.log(`       suffixes testés : ${e.Suffixes_Testes}`);
});

// Stats par type de libellé pour comprendre la distribution
console.log('\n── Distribution des libellés ──');
const patterns = {};
for (const r of rows2) {
  const lib = norm(r.libelle);
  let cat = 'AUTRE';
  if (/BORD\.?\s*REMISE/i.test(lib)) cat = 'BORD REMISE CHQ';
  else if (/^FLO\d/.test(lib))      cat = 'FLO (facture)';
  else if (/^AVL\d/.test(lib))      cat = 'AVL (avoir)';
  else if (/^FAC/i.test(lib))       cat = 'FAC';
  else if (/AVOIR/i.test(lib))      cat = 'AVOIR (texte)';
  else if (/REGUL/i.test(lib))      cat = 'REGUL';
  else if (/PROSUMA/i.test(lib))    cat = 'AUTRE PROSUMA';
  patterns[cat] = (patterns[cat] || 0) + 1;
}
Object.entries(patterns).sort((a,b) => b[1]-a[1]).forEach(([k,v]) => {
  console.log(`  ${k.padEnd(30)} → ${v}`);
});
