/**
 * Inspecte les 2 fichiers : structure + détecte où sont les vraies références FNE.
 */
const path = require('path');
const XLSX = require('../../frontend_efacture_05052026/node_modules/xlsx');

const FILES = [
  'D:/Users/yannick.atse/Desktop/E_Facture/Facture_ProsumaPort.xls',
  'D:/Users/yannick.atse/Desktop/E_Facture/fichier prosuma port.xlsx',
];

const isFneRef = (v) => /^9904279V\d{11}$/.test(String(v || '').trim());

for (const f of FILES) {
  console.log('\n══════════════════════════════════════════════════════════');
  console.log('FICHIER :', path.basename(f));
  console.log('══════════════════════════════════════════════════════════');
  const wb = XLSX.readFile(f);
  for (const sheetName of wb.SheetNames) {
    const sheet = wb.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: null, raw: false });
    console.log('\n— Feuille :', sheetName, `(${rows.length} lignes)`);
    if (rows.length === 0) { console.log('  (vide)'); continue; }
    const cols = Object.keys(rows[0]);
    console.log('  Colonnes :', cols.join(' | '));

    // Pour chaque colonne : compte combien de valeurs ressemblent à une réf FNE
    const stats = {};
    for (const c of cols) {
      let total = 0, withVal = 0, fneLike = 0;
      const samples = [];
      for (const r of rows) {
        total++;
        const v = r[c];
        if (v != null && String(v).trim() !== '') {
          withVal++;
          if (isFneRef(v)) {
            fneLike++;
            if (samples.length < 2) samples.push(String(v).trim());
          }
        }
      }
      stats[c] = { total, withVal, fneLike, samples };
    }
    console.log('  Détection FNE (^9904279V\\d{11}$) :');
    for (const [c, s] of Object.entries(stats)) {
      const flag = s.fneLike > 0 ? '★ FNE' : (s.withVal > 0 ? '   ' : '   (vide)');
      console.log(`    ${flag.padEnd(8)} ${c.padEnd(28)} → ${s.withVal}/${s.total} non-vides, ${s.fneLike} FNE  ${s.samples.length ? '['+s.samples.join(', ')+']' : ''}`);
    }
  }
}
