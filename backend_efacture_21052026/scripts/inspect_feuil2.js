/**
 * Inspecte la feuille "Feuil2" (837 lignes) pour détecter où se trouvent les références FNE.
 * Les FNE peuvent être : - format strict 9904279VYY...
 *                        - embarquées dans un libellé (ex: "FAC. 9904279V25...")
 *                        - dans une colonne nommée différemment
 */
const XLSX = require('../../frontend_efacture_05052026/node_modules/xlsx');

const FILE2 = 'D:/Users/yannick.atse/Desktop/E_Facture/fichier prosuma port.xlsx';

const FNE_REGEX = /9904279V\d{11}/i;
const FNE_REGEX_LOOSE = /9904279/i;

const wb = XLSX.readFile(FILE2);
const sheet2Name = wb.SheetNames.find(n => n === 'Feuil2') || wb.SheetNames[1];
console.log('Feuille analysée :', sheet2Name);
const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheet2Name], { defval: null, raw: false });
console.log('Lignes :', rows.length);

const cols = Object.keys(rows[0]);
console.log('Colonnes :', cols.join(' | '));

console.log('\n── Aperçu 5 premières lignes ──');
rows.slice(0, 5).forEach((r, i) => {
  console.log(`\n[${i + 1}]`);
  for (const c of cols) {
    if (r[c] != null) console.log(`   ${c.padEnd(20)} = ${JSON.stringify(r[c])}`);
  }
});

console.log('\n── Détection FNE par colonne ──');
for (const c of cols) {
  let nonNull = 0, fneStrict = 0, fneLoose = 0;
  const samples = [];
  for (const r of rows) {
    const v = r[c];
    if (v != null && String(v).trim() !== '') {
      nonNull++;
      const s = String(v);
      if (FNE_REGEX.test(s)) {
        fneStrict++;
        if (samples.length < 2) samples.push(s.slice(0, 80));
      } else if (FNE_REGEX_LOOSE.test(s)) fneLoose++;
    }
  }
  if (nonNull > 0) {
    const flag = fneStrict > 0 ? '★ FNE strict ' : (fneLoose > 0 ? '~ FNE loose  ' : '             ');
    console.log(`  ${flag} ${c.padEnd(20)} → ${nonNull} non-vides, ${fneStrict} strict, ${fneLoose} loose`);
    samples.forEach(s => console.log(`       sample: ${s}`));
  }
}

// Cherche des SAP invoice numbers (8000xxxxxxx ou 8700xxxxxxx)
console.log('\n── Détection N° facture SAP par colonne ──');
const SAP_REGEX = /(8\d{9})/;  // N° facture SAP : 8 + 9 chiffres
for (const c of cols) {
  let nonNull = 0, sap = 0;
  const samples = [];
  for (const r of rows) {
    const v = r[c];
    if (v != null && String(v).trim() !== '') {
      nonNull++;
      const m = String(v).match(SAP_REGEX);
      if (m) {
        sap++;
        if (samples.length < 2) samples.push(`${String(v).slice(0, 60)} → ${m[1]}`);
      }
    }
  }
  if (sap > 0) {
    console.log(`  ★ ${c.padEnd(20)} → ${sap}/${nonNull} ressemblent à un n° SAP`);
    samples.forEach(s => console.log(`       sample: ${s}`));
  }
}
