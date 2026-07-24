// Extrait Excel (.xlsx) — 2 feuilles :
//   1) "Envoyées avec erreur" : factures téléchargées ayant AU MOINS une tentative d'envoi en erreur
//   2) "Non envoyées"         : factures téléchargées jamais certifiées (absentes de fne_invoices)
// Usage: node stats_extracts.js [date_debut=2026-05-01] [fichier_sortie]
'use strict';
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Sequelize, QueryTypes } = require('sequelize');
const { zip } = require('./lib_zip');

const dateDebut = process.argv[2] || '2026-05-01';
const outFile = process.argv[3] || path.join(__dirname, `extraits_factures_${dateDebut}.xlsx`);

const dbPassword = process.env.DB_PASS ? decodeURIComponent(process.env.DB_PASS) : '';
const sequelize = new Sequelize(process.env.DB_NAME || 'npg_efacture', process.env.DB_USER || 'root', dbPassword, {
  host: process.env.DB_HOST || '127.0.0.1', port: parseInt(process.env.DB_PORT) || 3306, dialect: 'mysql', logging: false
});

const TYPE_EXPR = `CASE
  WHEN JSON_UNQUOTE(JSON_EXTRACT(di.data,'$[0].fkart')) = 'ZRE'
    OR EXISTS(SELECT 1 FROM fne_invoices fr WHERE fr.numero_facture = di.numero AND fr.type = 'refund') THEN 'Avoir'
  WHEN di.numero REGEXP '^[A-Za-z]' THEN 'Succursale'
  WHEN di.numero LIKE '00%' THEN 'Export'
  ELSE 'NPG Siège' END`;

// ---------- helpers XML / xlsx (tables seules, sans graphiques) ----------
const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const colL = n => { let s = ''; n++; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };
const fmtDate = d => { if (!d) return ''; const x = new Date(d); const p = n => String(n).padStart(2, '0'); return `${x.getFullYear()}-${p(x.getMonth() + 1)}-${p(x.getDate())} ${p(x.getHours())}:${p(x.getMinutes())}`; };
const fmtMonth = d => { if (!d) return ''; const x = new Date(d); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}`; };
const S = { title: 3, head: 2, data: 5 };

function makeRows() {
  const rows = [];
  const put = (r, c, v, t, s) => {
    let row = rows.find(x => x.r === r);
    if (!row) { row = { r, cells: [] }; rows.push(row); }
    row.cells.push({ c, v, t, s });
  };
  return { rows, put };
}
function serializeSheet(rows, cols, autoFilterRef) {
  rows.sort((a, b) => a.r - b.r);
  const body = rows.map(row => {
    const cells = row.cells.sort((a, b) => a.c - b.c).map(cell => {
      const ref = colL(cell.c) + row.r;
      const s = cell.s ? ` s="${cell.s}"` : '';
      if (cell.t === 'n') return `<c r="${ref}"${s}><v>${cell.v}</v></c>`;
      return `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${esc(cell.v)}</t></is></c>`;
    }).join('');
    return `<row r="${row.r}">${cells}</row>`;
  }).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
${cols ? `<cols>${cols}</cols>` : ''}
<sheetData>${body}</sheetData>
${autoFilterRef ? `<autoFilter ref="${autoFilterRef}"/>` : ''}
</worksheet>`;
}

// extrait un message court depuis une réponse API stockée
function shortError(api) {
  if (!api) return '';
  let msg = api;
  try {
    const o = JSON.parse(api);
    msg = o.errorMessage || o.error || o.message
      || (o.response && (o.response.message || o.response.error))
      || JSON.stringify(o);
  } catch { /* texte brut */ }
  msg = String(msg).replace(/\s+/g, ' ').trim();
  return msg.length > 240 ? msg.slice(0, 240) + '…' : msg;
}

(async () => {
  // 1) Téléchargées avec au moins une tentative d'envoi en erreur
  const errRows = await sequelize.query(`
    SELECT di.numero AS numero, ${TYPE_EXPR} AS type, MIN(di.username) AS username,
      MAX(di.download_date) AS download_date,
      (SELECT COUNT(*) FROM logs_actions la WHERE la.numero_facture = di.numero AND la.SendBy IS NOT NULL AND la.erreur = 1) AS nb_erreurs,
      (SELECT MAX(la.SendOn) FROM logs_actions la WHERE la.numero_facture = di.numero AND la.SendBy IS NOT NULL AND la.erreur = 1) AS derniere_erreur,
      (SELECT la.SendBy FROM logs_actions la WHERE la.numero_facture = di.numero AND la.SendBy IS NOT NULL AND la.erreur = 1 ORDER BY la.SendOn DESC LIMIT 1) AS par,
      (SELECT la.api_response FROM logs_actions la WHERE la.numero_facture = di.numero AND la.SendBy IS NOT NULL AND la.erreur = 1 ORDER BY la.SendOn DESC LIMIT 1) AS dernier_message,
      EXISTS(SELECT 1 FROM fne_invoices fi WHERE fi.numero_facture = di.numero) AS finalement_certifiee
    FROM downloaded_invoices di
    WHERE di.download_date >= :d
      AND EXISTS(SELECT 1 FROM logs_actions la WHERE la.numero_facture = di.numero AND la.SendBy IS NOT NULL AND la.erreur = 1)
    GROUP BY di.numero, type
    ORDER BY finalement_certifiee ASC, derniere_erreur DESC`,
    { replacements: { d: dateDebut }, type: QueryTypes.SELECT });

  // 2) Téléchargées jamais certifiées (absentes de fne_invoices)
  const nonRows = await sequelize.query(`
    SELECT di.numero AS numero, ${TYPE_EXPR} AS type, MIN(di.username) AS username,
      MAX(di.download_date) AS download_date,
      EXISTS(SELECT 1 FROM logs_actions la WHERE la.numero_facture = di.numero AND la.SendBy IS NOT NULL AND la.erreur = 1) AS a_tente_erreur,
      EXISTS(SELECT 1 FROM logs_actions la WHERE la.numero_facture = di.numero AND la.SendBy IS NOT NULL) AS a_tente_envoi
    FROM downloaded_invoices di
    WHERE di.download_date >= :d
      AND NOT EXISTS(SELECT 1 FROM fne_invoices fi WHERE fi.numero_facture = di.numero)
    GROUP BY di.numero, type
    ORDER BY type, download_date DESC`,
    { replacements: { d: dateDebut }, type: QueryTypes.SELECT });

  console.log(`\n=== Extraits depuis ${dateDebut} ===`);
  console.log(`1) Téléchargées envoyées AVEC ERREUR : ${errRows.length}`);
  console.log(`   dont jamais certifiées ensuite     : ${errRows.filter(r => Number(r.finalement_certifiee) === 0).length}`);
  console.log(`2) Téléchargées NON envoyées (hors fne_invoices) : ${nonRows.length}`);
  console.log(`   dont avec une tentative en erreur  : ${nonRows.filter(r => Number(r.a_tente_erreur) === 1).length}`);
  console.log(`   dont jamais tentées d'envoi        : ${nonRows.filter(r => Number(r.a_tente_envoi) === 0).length}\n`);

  // ---------- Feuille 1 ----------
  const s1 = makeRows();
  s1.put(1, 0, `Factures téléchargées ENVOYÉES AVEC ERREUR — depuis le ${dateDebut}`, 's', S.title);
  const h1 = ['Numéro', 'Type', 'Utilisateur', 'Date téléchargement', 'Mois', 'Nb tentatives en erreur', 'Dernière erreur', 'Envoyée par', 'Finalement certifiée', 'Message erreur'];
  h1.forEach((h, i) => s1.put(3, i, h, 's', S.head));
  errRows.forEach((r, i) => {
    const rr = 4 + i;
    s1.put(rr, 0, r.numero, 's', S.data);
    s1.put(rr, 1, r.type, 's', S.data);
    s1.put(rr, 2, r.username, 's', S.data);
    s1.put(rr, 3, fmtDate(r.download_date), 's', S.data);
    s1.put(rr, 4, fmtMonth(r.download_date), 's', S.data);
    s1.put(rr, 5, Number(r.nb_erreurs), 'n', S.data);
    s1.put(rr, 6, fmtDate(r.derniere_erreur), 's', S.data);
    s1.put(rr, 7, r.par, 's', S.data);
    s1.put(rr, 8, Number(r.finalement_certifiee) === 1 ? 'Oui' : 'NON', 's', S.data);
    s1.put(rr, 9, shortError(r.dernier_message), 's', S.data);
  });
  const af1 = `A3:J${3 + errRows.length}`;

  // ---------- Feuille 2 ----------
  const s2 = makeRows();
  s2.put(1, 0, `Factures téléchargées NON envoyées — depuis le ${dateDebut}`, 's', S.title);
  const h2 = ['Numéro', 'Type', 'Utilisateur', 'Date téléchargement', 'Mois', 'Statut'];
  h2.forEach((h, i) => s2.put(3, i, h, 's', S.head));
  nonRows.forEach((r, i) => {
    const rr = 4 + i;
    const statut = Number(r.a_tente_erreur) === 1 ? 'Échec envoi (erreur)'
      : Number(r.a_tente_envoi) === 0 ? 'Jamais tentée'
      : 'Tentée, non certifiée';
    s2.put(rr, 0, r.numero, 's', S.data);
    s2.put(rr, 1, r.type, 's', S.data);
    s2.put(rr, 2, r.username, 's', S.data);
    s2.put(rr, 3, fmtDate(r.download_date), 's', S.data);
    s2.put(rr, 4, fmtMonth(r.download_date), 's', S.data);
    s2.put(rr, 5, statut, 's', S.data);
  });
  const af2 = `A3:F${3 + nonRows.length}`;

  // ---------- packaging ----------
  const cols1 = `<col min="1" max="1" width="16"/><col min="2" max="2" width="12"/><col min="3" max="3" width="16"/><col min="4" max="4" width="18"/><col min="5" max="5" width="10"/><col min="6" max="6" width="20"/><col min="7" max="7" width="18"/><col min="8" max="8" width="14"/><col min="9" max="9" width="18"/><col min="10" max="10" width="60"/>`;
  const cols2 = `<col min="1" max="1" width="16"/><col min="2" max="2" width="12"/><col min="3" max="3" width="16"/><col min="4" max="4" width="18"/><col min="5" max="5" width="10"/><col min="6" max="6" width="22"/>`;

  const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<fonts count="4">
<font><sz val="11"/><name val="Calibri"/></font>
<font><b/><sz val="11"/><name val="Calibri"/></font>
<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>
<font><b/><sz val="14"/><color rgb="FF1F4E78"/><name val="Calibri"/></font>
</fonts>
<fills count="3">
<fill><patternFill patternType="none"/></fill>
<fill><patternFill patternType="gray125"/></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FF1F4E78"/></patternFill></fill>
</fills>
<borders count="2">
<border><left/><right/><top/><bottom/><diagonal/></border>
<border><left style="thin"><color rgb="FFB0B0B0"/></left><right style="thin"><color rgb="FFB0B0B0"/></right><top style="thin"><color rgb="FFB0B0B0"/></top><bottom style="thin"><color rgb="FFB0B0B0"/></bottom><diagonal/></border>
</borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="6">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1"/>
<xf numFmtId="0" fontId="2" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
<xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="0" fontId="1" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1"/>
<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1"/>
</cellXfs>
</styleSheet>`;

  const workbookXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets>
<sheet name="Envoyées avec erreur" sheetId="1" r:id="rId1"/>
<sheet name="Non envoyées" sheetId="2" r:id="rId2"/>
</sheets>
</workbook>`;

  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
<Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`;

  const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;

  const workbookRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/>
<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;

  const buf = zip([
    { name: '[Content_Types].xml', data: contentTypes },
    { name: '_rels/.rels', data: rootRels },
    { name: 'xl/workbook.xml', data: workbookXml },
    { name: 'xl/_rels/workbook.xml.rels', data: workbookRels },
    { name: 'xl/styles.xml', data: stylesXml },
    { name: 'xl/worksheets/sheet1.xml', data: serializeSheet(s1.rows, cols1, af1) },
    { name: 'xl/worksheets/sheet2.xml', data: serializeSheet(s2.rows, cols2, af2) },
  ]);

  fs.writeFileSync(outFile, buf);
  console.log(`✔ Fichier généré : ${outFile}  (${buf.length} octets)`);
  await sequelize.close();
})().catch(async e => { console.error('Erreur:', e); try { await sequelize.close(); } catch {} process.exitCode = 1; });
