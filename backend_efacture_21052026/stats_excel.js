// Génère un classeur Excel (.xlsx) natif avec graphiques :
//  - Feuille "Synthèse"  : par type (NPG Siège / Succursale / Export) et par utilisateur + colonnes + camembert
//  - Feuille "Par jour"  : téléchargées / envoyées / non envoyées par jour + courbe
//  - Feuille "Liste"     : détail de chaque facture avec son statut
//  depuis début mai (paramétrable)
// Usage: node stats_excel.js [date_debut=2026-05-01] [fichier_sortie]
'use strict';
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Sequelize, QueryTypes } = require('sequelize');
const { zip } = require('./lib_zip');

const dateDebut = process.argv[2] || '2026-05-01';
const outFile = process.argv[3] || path.join(__dirname, `stats_factures_${dateDebut}.xlsx`);

const dbPassword = process.env.DB_PASS ? decodeURIComponent(process.env.DB_PASS) : '';
const sequelize = new Sequelize(process.env.DB_NAME || 'npg_efacture', process.env.DB_USER || 'root', dbPassword, {
  host: process.env.DB_HOST || '127.0.0.1', port: parseInt(process.env.DB_PORT) || 3306, dialect: 'mysql', logging: false
});

// Type de la facture (priorité à l'avoir pour éviter le double comptage) :
//   - fkart='ZRE' OU présent comme refund dans fne_invoices -> Avoir
//   - sinon, préfixe du numéro : LETTRE -> Succursale ; "00" -> Export ; autre chiffre -> NPG Siège
const TYPE_EXPR = `CASE
  WHEN JSON_UNQUOTE(JSON_EXTRACT(di.data,'$[0].fkart')) = 'ZRE'
    OR EXISTS(SELECT 1 FROM fne_invoices fr WHERE fr.numero_facture = di.numero AND fr.type = 'refund') THEN 'Avoir'
  WHEN di.numero REGEXP '^[A-Za-z]' THEN 'Succursale'
  WHEN di.numero LIKE '00%' THEN 'Export'
  ELSE 'NPG Siège' END`;
const TYPE_ORDER = ['NPG Siège', 'Succursale', 'Export', 'Avoir'];

// ---------- helpers XML ----------
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const colL = n => { let s = ''; n++; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };
const fmtDate = d => { const x = new Date(d); const p = n => String(n).padStart(2, '0'); return `${x.getFullYear()}-${p(x.getMonth() + 1)}-${p(x.getDate())}`; };

// Styles : 0 normal, 2 header, 3 titre, 4 total, 5 data(bordure), 6 sous-titre
const S = { title: 3, sub: 6, head: 2, data: 5, total: 4 };

// fabrique un modèle de lignes pour une feuille
function makeRows() {
  const rows = [];
  const put = (r, c, v, t, s) => {
    let row = rows.find(x => x.r === r);
    if (!row) { row = { r, cells: [] }; rows.push(row); }
    row.cells.push({ c, v, t, s });
    return r;
  };
  return { rows, put };
}

function serializeSheet(rows, cols, drawingRid) {
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
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
${cols ? `<cols>${cols}</cols>` : ''}
<sheetData>${body}</sheetData>
${drawingRid ? `<drawing r:id="${drawingRid}"/>` : ''}
</worksheet>`;
}

// caches pour graphiques
const strCache = arr => `<c:strCache><c:ptCount val="${arr.length}"/>${arr.map((v, i) => `<c:pt idx="${i}"><c:v>${esc(v)}</c:v></c:pt>`).join('')}</c:strCache>`;
const numCache = arr => `<c:numCache><c:formatCode>General</c:formatCode><c:ptCount val="${arr.length}"/>${arr.map((v, i) => `<c:pt idx="${i}"><c:v>${v}</c:v></c:pt>`).join('')}</c:numCache>`;

function anchor(rid, fromCol, fromRow, toCol, toRow, id, name) {
  return `<xdr:twoCellAnchor>
<xdr:from><xdr:col>${fromCol}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${fromRow}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from>
<xdr:to><xdr:col>${toCol}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${toRow}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to>
<xdr:graphicFrame macro=""><xdr:nvGraphicFramePr><xdr:cNvPr id="${id}" name="${name}"/><xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr>
<xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm>
<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart"><c:chart xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:id="${rid}"/></a:graphicData></a:graphic>
</xdr:graphicFrame><xdr:clientData/>
</xdr:twoCellAnchor>`;
}
const drawingDoc = body => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">${body}</xdr:wsDr>`;
const chartHead = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">`;
const titleXml = t => `<c:title><c:tx><c:rich><a:bodyPr/><a:p><a:r><a:t>${esc(t)}</a:t></a:r></a:p></c:rich></c:tx><c:overlay val="0"/></c:title><c:autoTitleDeleted val="0"/>`;

(async () => {
  // ---------------------------------------------------------------
  // 1) Données détaillées (une ligne par numéro distinct)
  // ---------------------------------------------------------------
  const data = await sequelize.query(`
    SELECT di.numero AS numero, MIN(di.username) AS user, ${TYPE_EXPR} AS type,
      MAX(di.download_date) AS download_date,
      EXISTS(SELECT 1 FROM fne_invoices fi WHERE fi.numero_facture = di.numero) AS sent
    FROM downloaded_invoices di
    WHERE di.download_date >= :d
    GROUP BY di.numero, type`,
    { replacements: { d: dateDebut }, type: QueryTypes.SELECT });

  // ---------- agrégats type / utilisateur ----------
  const blank = () => ({ tel: 0, env: 0, non: 0 });
  const byType = {}, byUser = {}, byDay = {}, byDayUser = {};
  let totTel = 0, totEnv = 0, totNon = 0;
  for (const row of data) {
    const sent = Number(row.sent) === 1;
    const day = fmtDate(row.download_date);
    const du = `${day}|${row.user}`;
    (byType[row.type] = byType[row.type] || blank());
    (byUser[row.user] = byUser[row.user] || blank());
    (byDay[day] = byDay[day] || blank());
    (byDayUser[du] = byDayUser[du] || { day, user: row.user, ...blank() });
    byType[row.type].tel++; byUser[row.user].tel++; byDay[day].tel++; byDayUser[du].tel++; totTel++;
    if (sent) { byType[row.type].env++; byUser[row.user].env++; byDay[day].env++; byDayUser[du].env++; totEnv++; }
    else { byType[row.type].non++; byUser[row.user].non++; byDay[day].non++; byDayUser[du].non++; totNon++; }
  }

  const typeKeys = [...TYPE_ORDER.filter(k => byType[k]), ...Object.keys(byType).filter(k => !TYPE_ORDER.includes(k))];
  const typeData = typeKeys.map(k => ({ label: k, ...byType[k] }));
  const userData = Object.keys(byUser).sort((a, b) => byUser[b].tel - byUser[a].tel).map(u => ({ label: u, ...byUser[u] }));
  const dayData = Object.keys(byDay).sort().map(d => ({ label: d, ...byDay[d] }));
  const dayUserData = Object.values(byDayUser).sort((a, b) => a.day < b.day ? -1 : a.day > b.day ? 1 : (a.user < b.user ? -1 : 1));

  console.log(`\n=== Depuis ${dateDebut} ===`);
  console.log('Par type :'); console.table(typeData);
  console.log('Par utilisateur :'); console.table(userData);
  console.log(`Jours couverts : ${dayData.length}`);
  console.log(`TOTAL  téléchargées=${totTel}  envoyées=${totEnv}  non envoyées=${totNon}\n`);

  // ===============================================================
  // FEUILLE 1 — Synthèse
  // ===============================================================
  const s1 = makeRows();
  s1.put(1, 0, `Statistiques factures — depuis le ${dateDebut}`, 's', S.title);
  s1.put(3, 0, 'Répartition par TYPE de facture', 's', S.sub);
  const tHead = 4;
  ['Type', 'Téléchargées', 'Téléchargées + Envoyées', 'Téléchargées NON envoyées'].forEach((h, i) => s1.put(tHead, i, h, 's', S.head));
  typeData.forEach((d, i) => {
    const r = tHead + 1 + i;
    s1.put(r, 0, d.label, 's', S.data); s1.put(r, 1, d.tel, 'n', S.data); s1.put(r, 2, d.env, 'n', S.data); s1.put(r, 3, d.non, 'n', S.data);
  });
  const tTotalRow = tHead + 1 + typeData.length;
  s1.put(tTotalRow, 0, 'TOTAL', 's', S.total); s1.put(tTotalRow, 1, totTel, 'n', S.total); s1.put(tTotalRow, 2, totEnv, 'n', S.total); s1.put(tTotalRow, 3, totNon, 'n', S.total);
  const typeFirst = tHead + 1, typeLast = tHead + typeData.length;

  const uTitle = tTotalRow + 2;
  s1.put(uTitle, 0, 'Répartition par UTILISATEUR', 's', S.sub);
  const uHead = uTitle + 1;
  ['Utilisateur', 'Téléchargées', 'Téléchargées + Envoyées', 'Téléchargées NON envoyées'].forEach((h, i) => s1.put(uHead, i, h, 's', S.head));
  userData.forEach((d, i) => {
    const r = uHead + 1 + i;
    s1.put(r, 0, d.label, 's', S.data); s1.put(r, 1, d.tel, 'n', S.data); s1.put(r, 2, d.env, 'n', S.data); s1.put(r, 3, d.non, 'n', S.data);
  });
  const uTotalRow = uHead + 1 + userData.length;
  s1.put(uTotalRow, 0, 'TOTAL', 's', S.total); s1.put(uTotalRow, 1, totTel, 'n', S.total); s1.put(uTotalRow, 2, totEnv, 'n', S.total); s1.put(uTotalRow, 3, totNon, 'n', S.total);

  const SHEET1 = 'Synthèse';
  const rng1 = (r1, c1, r2, c2) => `'${SHEET1}'!$${colL(c1)}$${r1}:$${colL(c2)}$${r2}`;
  const ref1 = (r, c) => `'${SHEET1}'!$${colL(c)}$${r}`;
  const cats1 = typeData.map(d => d.label);
  const catRef1 = `<c:cat><c:strRef><c:f>${rng1(typeFirst, 0, typeLast, 0)}</c:f>${strCache(cats1)}</c:strRef></c:cat>`;
  const serieBar = (idx, col, name, vals, color) =>
`<c:ser><c:idx val="${idx}"/><c:order val="${idx}"/>
<c:tx><c:strRef><c:f>${ref1(tHead, col)}</c:f>${strCache([name])}</c:strRef></c:tx>
<c:spPr><a:solidFill><a:srgbClr val="${color}"/></a:solidFill></c:spPr>
${catRef1}
<c:val><c:numRef><c:f>${rng1(typeFirst, col, typeLast, col)}</c:f>${numCache(vals)}</c:numRef></c:val></c:ser>`;

  const chart1 = `${chartHead}<c:chart>${titleXml('Factures par type')}
<c:plotArea><c:layout/>
<c:barChart><c:barDir val="col"/><c:grouping val="clustered"/><c:varyColors val="0"/>
${serieBar(0, 1, 'Téléchargées', typeData.map(d => d.tel), '4472C4')}
${serieBar(1, 2, 'Téléchargées + Envoyées', typeData.map(d => d.env), '70AD47')}
${serieBar(2, 3, 'Téléchargées NON envoyées', typeData.map(d => d.non), 'ED7D31')}
<c:gapWidth val="150"/><c:axId val="11"/><c:axId val="12"/></c:barChart>
<c:catAx><c:axId val="11"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="b"/><c:crossAx val="12"/></c:catAx>
<c:valAx><c:axId val="12"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="l"/><c:crossAx val="11"/></c:valAx>
</c:plotArea><c:legend><c:legendPos val="b"/><c:overlay val="0"/></c:legend><c:plotVisOnly val="1"/><c:dispBlanksAs val="gap"/>
</c:chart></c:chartSpace>`;

  const chart2 = `${chartHead}<c:chart>${titleXml('Envoyées vs NON envoyées (total)')}
<c:plotArea><c:layout/>
<c:pieChart><c:varyColors val="1"/>
<c:ser><c:idx val="0"/><c:order val="0"/>
<c:cat><c:strRef><c:f>${rng1(tHead, 2, tHead, 3)}</c:f>${strCache(['Téléchargées + Envoyées', 'Téléchargées NON envoyées'])}</c:strRef></c:cat>
<c:val><c:numRef><c:f>${rng1(tTotalRow, 2, tTotalRow, 3)}</c:f>${numCache([totEnv, totNon])}</c:numRef></c:val>
<c:dPt><c:idx val="0"/><c:bubble3D val="0"/><c:spPr><a:solidFill><a:srgbClr val="70AD47"/></a:solidFill></c:spPr></c:dPt>
<c:dPt><c:idx val="1"/><c:bubble3D val="0"/><c:spPr><a:solidFill><a:srgbClr val="ED7D31"/></a:solidFill></c:spPr></c:dPt>
<c:dLbls><c:numFmt formatCode="#,##0" sourceLinked="0"/><c:showLegendKey val="0"/><c:showVal val="1"/><c:showCatName val="0"/><c:showSerName val="0"/><c:showPercent val="1"/><c:showBubbleSize val="0"/></c:dLbls>
</c:ser><c:firstSliceAng val="0"/></c:pieChart>
</c:plotArea><c:legend><c:legendPos val="b"/><c:overlay val="0"/></c:legend><c:plotVisOnly val="1"/>
</c:chart></c:chartSpace>`;

  // ===============================================================
  // FEUILLE 2 — Par jour
  // ===============================================================
  const s2 = makeRows();
  s2.put(1, 0, `Évolution par jour — depuis le ${dateDebut}`, 's', S.title);
  const dHead = 3;
  ['Date', 'Téléchargées', 'Téléchargées + Envoyées', 'Téléchargées NON envoyées'].forEach((h, i) => s2.put(dHead, i, h, 's', S.head));
  dayData.forEach((d, i) => {
    const r = dHead + 1 + i;
    s2.put(r, 0, d.label, 's', S.data); s2.put(r, 1, d.tel, 'n', S.data); s2.put(r, 2, d.env, 'n', S.data); s2.put(r, 3, d.non, 'n', S.data);
  });
  const dFirst = dHead + 1, dLast = dHead + dayData.length;

  // tableau détaillé par jour ET par utilisateur (sous le tableau global)
  const duTitle = dLast + 3;
  s2.put(duTitle, 0, 'Détail par jour ET par utilisateur', 's', S.sub);
  const duHead = duTitle + 1;
  ['Date', 'Utilisateur', 'Téléchargées', 'Téléchargées + Envoyées', 'Téléchargées NON envoyées'].forEach((h, i) => s2.put(duHead, i, h, 's', S.head));
  dayUserData.forEach((d, i) => {
    const r = duHead + 1 + i;
    s2.put(r, 0, d.day, 's', S.data); s2.put(r, 1, d.user, 's', S.data);
    s2.put(r, 2, d.tel, 'n', S.data); s2.put(r, 3, d.env, 'n', S.data); s2.put(r, 4, d.non, 'n', S.data);
  });

  const SHEET2 = 'Par jour';
  const rng2 = (r1, c1, r2, c2) => `'${SHEET2}'!$${colL(c1)}$${r1}:$${colL(c2)}$${r2}`;
  const ref2 = (r, c) => `'${SHEET2}'!$${colL(c)}$${r}`;
  const catRef2 = `<c:cat><c:strRef><c:f>${rng2(dFirst, 0, dLast, 0)}</c:f>${strCache(dayData.map(d => d.label))}</c:strRef></c:cat>`;
  const serieLine = (idx, col, name, vals, color) =>
`<c:ser><c:idx val="${idx}"/><c:order val="${idx}"/>
<c:tx><c:strRef><c:f>${ref2(dHead, col)}</c:f>${strCache([name])}</c:strRef></c:tx>
<c:spPr><a:ln w="28575"><a:solidFill><a:srgbClr val="${color}"/></a:solidFill></a:ln></c:spPr>
<c:marker><c:symbol val="circle"/><c:size val="5"/></c:marker>
${catRef2}
<c:val><c:numRef><c:f>${rng2(dFirst, col, dLast, col)}</c:f>${numCache(vals)}</c:numRef></c:val><c:smooth val="0"/></c:ser>`;

  const chart3 = `${chartHead}<c:chart>${titleXml('Téléchargées / Envoyées / Non envoyées par jour')}
<c:plotArea><c:layout/>
<c:lineChart><c:grouping val="standard"/><c:varyColors val="0"/>
${serieLine(0, 1, 'Téléchargées', dayData.map(d => d.tel), '4472C4')}
${serieLine(1, 2, 'Téléchargées + Envoyées', dayData.map(d => d.env), '70AD47')}
${serieLine(2, 3, 'Téléchargées NON envoyées', dayData.map(d => d.non), 'ED7D31')}
<c:marker val="1"/><c:axId val="21"/><c:axId val="22"/></c:lineChart>
<c:catAx><c:axId val="21"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="b"/><c:crossAx val="22"/></c:catAx>
<c:valAx><c:axId val="22"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="l"/><c:crossAx val="21"/></c:valAx>
</c:plotArea><c:legend><c:legendPos val="b"/><c:overlay val="0"/></c:legend><c:plotVisOnly val="1"/><c:dispBlanksAs val="gap"/>
</c:chart></c:chartSpace>`;

  // ===============================================================
  // FEUILLE 3 — Liste des factures
  // ===============================================================
  const s3 = makeRows();
  s3.put(1, 0, `Liste des factures téléchargées — depuis le ${dateDebut}`, 's', S.title);
  const lHead = 3;
  ['Numéro', 'Type', 'Utilisateur', 'Date téléchargement', 'Statut'].forEach((h, i) => s3.put(lHead, i, h, 's', S.head));
  // tri : non envoyées d'abord, puis par date
  const list = [...data].sort((a, b) => {
    const sa = Number(a.sent), sb = Number(b.sent);
    if (sa !== sb) return sa - sb;
    return new Date(a.download_date) - new Date(b.download_date);
  });
  list.forEach((row, i) => {
    const r = lHead + 1 + i;
    s3.put(r, 0, row.numero, 's', S.data);
    s3.put(r, 1, row.type, 's', S.data);
    s3.put(r, 2, row.user, 's', S.data);
    s3.put(r, 3, fmtDate(row.download_date), 's', S.data);
    s3.put(r, 4, Number(row.sent) === 1 ? 'Envoyée' : 'NON envoyée', 's', S.data);
  });

  // ===============================================================
  // Assemblage du paquet xlsx
  // ===============================================================
  const colsTable = `<col min="1" max="1" width="26" customWidth="1"/><col min="2" max="4" width="24" customWidth="1"/>`;
  const colsList = `<col min="1" max="1" width="18" customWidth="1"/><col min="2" max="2" width="14" customWidth="1"/><col min="3" max="3" width="18" customWidth="1"/><col min="4" max="4" width="20" customWidth="1"/><col min="5" max="5" width="16" customWidth="1"/>`;

  const sheet1Xml = serializeSheet(s1.rows, colsTable, 'rId1');
  const sheet2Xml = serializeSheet(s2.rows, colsTable, 'rId1');
  const sheet3Xml = serializeSheet(s3.rows, colsList, null);

  const drawing1 = drawingDoc(anchor('rId1', 5, 2, 13, 20, 2, 'Colonnes par type') + anchor('rId2', 5, 21, 13, 39, 3, 'Camembert'));
  const drawing2 = drawingDoc(anchor('rId1', 5, 2, 18, 26, 2, 'Courbe par jour'));

  const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<fonts count="4">
<font><sz val="11"/><name val="Calibri"/></font>
<font><b/><sz val="11"/><name val="Calibri"/></font>
<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>
<font><b/><sz val="14"/><color rgb="FF1F4E78"/><name val="Calibri"/></font>
</fonts>
<fills count="4">
<fill><patternFill patternType="none"/></fill>
<fill><patternFill patternType="gray125"/></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FF1F4E78"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFD9E1F2"/></patternFill></fill>
</fills>
<borders count="2">
<border><left/><right/><top/><bottom/><diagonal/></border>
<border><left style="thin"><color rgb="FFB0B0B0"/></left><right style="thin"><color rgb="FFB0B0B0"/></right><top style="thin"><color rgb="FFB0B0B0"/></top><bottom style="thin"><color rgb="FFB0B0B0"/></bottom><diagonal/></border>
</borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="7">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1"/>
<xf numFmtId="0" fontId="2" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
<xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="0" fontId="1" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>
<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1"/>
<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>
</cellXfs>
</styleSheet>`;

  const workbookXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets>
<sheet name="${SHEET1}" sheetId="1" r:id="rId1"/>
<sheet name="${SHEET2}" sheetId="2" r:id="rId2"/>
<sheet name="Liste factures" sheetId="3" r:id="rId3"/>
</sheets>
</workbook>`;

  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
<Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
<Override PartName="/xl/worksheets/sheet3.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
<Override PartName="/xl/drawings/drawing1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>
<Override PartName="/xl/drawings/drawing2.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>
<Override PartName="/xl/charts/chart1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/>
<Override PartName="/xl/charts/chart2.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/>
<Override PartName="/xl/charts/chart3.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/>
</Types>`;

  const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;

  const workbookRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/>
<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet3.xml"/>
<Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;

  const sheet1Rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing1.xml"/>
</Relationships>`;
  const sheet2Rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing2.xml"/>
</Relationships>`;

  const drawing1Rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart" Target="../charts/chart1.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart" Target="../charts/chart2.xml"/>
</Relationships>`;
  const drawing2Rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart" Target="../charts/chart3.xml"/>
</Relationships>`;

  const buf = zip([
    { name: '[Content_Types].xml', data: contentTypes },
    { name: '_rels/.rels', data: rootRels },
    { name: 'xl/workbook.xml', data: workbookXml },
    { name: 'xl/_rels/workbook.xml.rels', data: workbookRels },
    { name: 'xl/styles.xml', data: stylesXml },
    { name: 'xl/worksheets/sheet1.xml', data: sheet1Xml },
    { name: 'xl/worksheets/_rels/sheet1.xml.rels', data: sheet1Rels },
    { name: 'xl/worksheets/sheet2.xml', data: sheet2Xml },
    { name: 'xl/worksheets/_rels/sheet2.xml.rels', data: sheet2Rels },
    { name: 'xl/worksheets/sheet3.xml', data: sheet3Xml },
    { name: 'xl/drawings/drawing1.xml', data: drawing1 },
    { name: 'xl/drawings/_rels/drawing1.xml.rels', data: drawing1Rels },
    { name: 'xl/drawings/drawing2.xml', data: drawing2 },
    { name: 'xl/drawings/_rels/drawing2.xml.rels', data: drawing2Rels },
    { name: 'xl/charts/chart1.xml', data: chart1 },
    { name: 'xl/charts/chart2.xml', data: chart2 },
    { name: 'xl/charts/chart3.xml', data: chart3 },
  ]);

  fs.writeFileSync(outFile, buf);
  console.log(`✔ Fichier Excel généré : ${outFile}  (${buf.length} octets, ${list.length} factures listées)`);
  await sequelize.close();
})().catch(async e => { console.error('Erreur:', e); try { await sequelize.close(); } catch {} process.exitCode = 1; });
