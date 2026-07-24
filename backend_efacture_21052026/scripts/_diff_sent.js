'use strict';
const fs = require('fs');
const [,, baseF, afterF] = process.argv;
const a = JSON.parse(fs.readFileSync(baseF));
const b = JSON.parse(fs.readFileSync(afterF));
const am = new Map(a.map(r => [String(r.id), r]));
const bm = new Map(b.map(r => [String(r.id), r]));
const fields = ['numero_facture','invoice_type','reference','total_ttc','point_of_sale','client_name','status','is_manual','is_cancellation','initial_invoice_numero','initial_invoice_reference','fne_invoice_id','is_orphan'];
let diffs = 0;
for (const r of a) {
  const o = bm.get(String(r.id));
  if (!o) { console.log('SEULEMENT baseline:', r.id, r.numero_facture, r.invoice_type); diffs++; continue; }
  for (const f of fields) {
    if (JSON.stringify(r[f]) !== JSON.stringify(o[f])) { console.log(`#${r.id} ${r.numero_facture} ${f}: base=${JSON.stringify(r[f])} vs after=${JSON.stringify(o[f])}`); diffs++; }
  }
}
for (const r of b) if (!am.has(String(r.id))) console.log('SEULEMENT after:', r.id, r.numero_facture, r.invoice_type, 'orphan=' + r.is_orphan);
console.log(`\nBaseline: ${a.length}  After: ${b.length}  Écarts sur lignes communes: ${diffs}`);
