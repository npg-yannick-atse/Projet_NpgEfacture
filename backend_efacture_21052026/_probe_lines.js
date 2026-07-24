require('dotenv').config();
const { Sequelize, QueryTypes } = require('sequelize');
const dbPassword = process.env.DB_PASS ? decodeURIComponent(process.env.DB_PASS) : '';
const s = new Sequelize(process.env.DB_NAME, process.env.DB_USER, dbPassword, {
  host: process.env.DB_HOST, port: parseInt(process.env.DB_PORT)||3306, dialect:'mysql', logging:false });
const q = (sql,r) => s.query(sql,{replacements:r,type:QueryTypes.SELECT});
const NUM = 'P26/81K';
const preview = (v,n=4000)=>{ const str = typeof v==='string'?v:JSON.stringify(v); return str.length>n?str.slice(0,n)+' …[TRONQUE]':str; };
(async () => {
  try {
    // 1) downloaded_invoices.data — combien de lignes/articles à la source
    const dl = await q(`SELECT id, data FROM downloaded_invoices WHERE numero=:n`, {n:NUM});
    for (const row of dl) {
      let d; try { d = JSON.parse(row.data); } catch { d = null; }
      console.log(`\n[downloaded ${row.id}] data est un tableau de ${Array.isArray(d)?d.length:'?'} élément(s)`);
      if (Array.isArray(d)) d.forEach((l,i)=>console.log(`   ligne[${i}] designation=${l.designation||l.designationArticle||'?'} qte=${l.quantite} ref=${l.reference} pu=${l.prixUnitaireHT}`));
    }

    // 2) fne_invoices.api_response — ce que la FNE a renvoyé (invoice.items)
    const fi = await q(`SELECT id, fne_invoice_id, api_response FROM fne_invoices WHERE numero_facture=:n`, {n:NUM});
    for (const row of fi) {
      let a = row.api_response; if (typeof a==='string'){ try{a=JSON.parse(a);}catch{} }
      const inv = a && (a.invoice || (a.response && a.response.invoice));
      const items = inv && inv.items;
      console.log(`\n[fne_invoices ${row.id}] fne_id=${row.fne_invoice_id}  invoice.items = ${Array.isArray(items)?items.length:'(absent)'}`);
      if (Array.isArray(items)) items.forEach((it,i)=>console.log(`   item[${i}] id=${it.id} ref=${it.reference} desc=${it.description} qte=${it.quantity}`));
      console.log('   api_response (aperçu):', preview(a, 1500));
    }

    // 3) fne_invoice_items stockés
    const it = await q(`SELECT fii.* FROM fne_invoice_items fii
      JOIN fne_invoices f ON f.fne_invoice_id = fii.fne_invoice_id
      WHERE f.numero_facture=:n`, {n:NUM});
    console.log(`\n[fne_invoice_items] ${it.length} ligne(s) stockée(s)`);
    it.forEach((r,i)=>console.log(`   item[${i}] fne_item_id=${r.fne_item_id} ref=${r.reference} desc=${r.description} qte=${r.quantity}`));

    // 4) logs_actions.api_response de l'envoi
    const lo = await q(`SELECT id, LENGTH(api_response) len, api_response FROM logs_actions WHERE numero_facture=:n AND SendOn IS NOT NULL ORDER BY id DESC LIMIT 1`, {n:NUM});
    for (const row of lo) {
      let a = row.api_response; if (typeof a==='string'){ try{a=JSON.parse(a);}catch{} }
      const inv = a && (a.invoice || (a.response && a.response.invoice));
      const items = inv && inv.items;
      console.log(`\n[logs_actions ${row.id}] api_response len=${row.len}  invoice.items = ${Array.isArray(items)?items.length:'(absent)'}`);
    }
  } catch(e){ console.error(e.message); } finally { await s.close(); }
})();
