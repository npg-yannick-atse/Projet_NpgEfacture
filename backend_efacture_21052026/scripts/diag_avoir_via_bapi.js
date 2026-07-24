/**
 * Diagnostic complet d'un avoir SAP via les BAPIs.
 * Trace toutes les stratégies que le backend utilise pour retrouver la facture initiale.
 *
 * Stratégies testées (dans l'ordre) :
 *   1. ZRV_INVOICE_DOCUMENT_READ : lecture du header avoir → on regarde SFAKN (avoir d'annulation directe)
 *   2. AUBEL des items du document : extraction du n° de commande source
 *   3. BAPISDORDER_GETDETAILEDLIST : appel BAPI sur la commande pour récupérer REF_DOC (facture initiale)
 *   4. Recherche locale : sap_vbrp_item.AUBEL = même commande (autres factures sur la même commande)
 *   5. Présence éventuelle dans fne_invoices (pour confirmation)
 *
 * Usage : node scripts/diag_avoir_via_bapi.js [VBELN]
 *   Par défaut : 8700006861
 */
require('dotenv').config();
const { Client } = require('node-rfc');
const getSapConfig = require('../config/sapConfig');
const db = require('../models');
const { Op } = require('sequelize');

const AVOIR_VBELN = (process.argv[2] || '8700006861').trim();
const PADDED = AVOIR_VBELN.padStart(10, '0');

const c = {
  reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m',
  red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m', cyan: '\x1b[36m',
};
const heading = (label) => console.log(`\n${c.bold}${c.cyan}━━━ ${label} ━━━${c.reset}`);
const ok      = (msg)   => console.log(`  ${c.green}✓${c.reset} ${msg}`);
const warn    = (msg)   => console.log(`  ${c.yellow}⚠${c.reset} ${msg}`);
const bad     = (msg)   => console.log(`  ${c.red}✗${c.reset} ${msg}`);
const info    = (msg)   => console.log(`  ${c.dim}${msg}${c.reset}`);

const getArray = (v) => Array.isArray(v) ? v : (v ? [v] : []);
const norm = (v) => (v == null ? '' : String(v).replace(/^0+/, '').trim());

(async () => {
  console.log(`${c.bold}Diagnostic BAPI — avoir ${AVOIR_VBELN} (padded: ${PADDED})${c.reset}`);

  let client;
  try {
    await db.sequelize.authenticate();
    info('Connexion DB OK');
  } catch (e) {
    bad(`Connexion DB impossible : ${e.message}`);
    process.exit(1);
  }

  try {
    const sapConfig = await getSapConfig();
    client = new Client(sapConfig);
    await client.connect();
    info(`Connexion SAP OK (host=${sapConfig.ashost}, client=${sapConfig.client})`);
  } catch (e) {
    bad(`Connexion SAP impossible : ${e.message}`);
    await db.sequelize.close();
    process.exit(1);
  }

  // ─── 1. Header avoir via ZRV_INVOICE_DOCUMENT_READ ────────────
  heading('1. ZRV_INVOICE_DOCUMENT_READ — header & lignes de l\'avoir');
  let avoirHeader = null;
  let avoirItems = [];
  let salesOrderNumber = '';
  try {
    const result = await client.call('ZRV_INVOICE_DOCUMENT_READ', {
      VBRK_I: { VBELN: PADDED },
      KONV_READ: 'X',
    });
    avoirHeader = getArray(result.XVBRK)[0] || result.VBRK_I || null;
    avoirItems = getArray(result.XVBRP).filter(it => parseFloat(String(it.FKIMG).replace(',', '.')) !== 0);

    if (!avoirHeader) {
      bad(`Aucun header retourné par la BAPI pour ${PADDED}.`);
    } else {
      ok(`Header trouvé. FKART=${avoirHeader.FKART} FKDAT=${avoirHeader.FKDAT} KUNRG=${avoirHeader.KUNRG} NETWR=${avoirHeader.NETWR} ${avoirHeader.WAERK || ''}`);
      console.log(`  ${c.dim}NAMRG=${avoirHeader.NAMRG || '?'} | BSTNK_VF=${avoirHeader.BSTNK_VF || '(vide)'} | SFAKN=${avoirHeader.SFAKN || '(vide)'}${c.reset}`);
    }
    info(`${avoirItems.length} ligne(s) avec FKIMG != 0`);
    avoirItems.forEach((it, i) => {
      console.log(`    #${i + 1}  POSNR=${it.POSNR}  MATNR=${norm(it.MATNR)}  FKIMG=${it.FKIMG} ${it.VRKME}  AUBEL=${it.AUBEL || '—'}  AUPOS=${it.AUPOS || '—'}  VGBEL=${it.VGBEL || '—'}`);
    });

    // AUBEL = n° de commande source (peut être sur le header ou sur les lignes)
    const aubelFromItems = avoirItems.map(it => (it.AUBEL || '').trim()).filter(Boolean);
    const aubelUnique = [...new Set(aubelFromItems)];
    if (aubelUnique.length === 1) {
      salesOrderNumber = aubelUnique[0];
      ok(`Sales order (AUBEL) unique trouvé : ${salesOrderNumber}`);
    } else if (aubelUnique.length > 1) {
      warn(`Plusieurs AUBEL différents : ${aubelUnique.join(', ')} — utilisation du 1er pour la suite`);
      salesOrderNumber = aubelUnique[0];
    } else {
      bad('Aucun AUBEL trouvé sur les lignes de l\'avoir → la stratégie BAPISDORDER ne pourra pas être tentée.');
    }
  } catch (e) {
    bad(`Erreur ZRV_INVOICE_DOCUMENT_READ : ${e.message}`);
  }

  // ─── 2. SFAKN : avoir d'annulation directe ────────────────────
  heading('2. Stratégie SFAKN (avoir d\'annulation)');
  if (avoirHeader?.SFAKN && avoirHeader.SFAKN.trim()) {
    ok(`Facture initiale via SFAKN = ${avoirHeader.SFAKN.trim()}`);
    console.log(`     ${c.dim}→ C'est un avoir d'annulation, le backend utiliserait directement ce numéro.${c.reset}`);
  } else {
    info('SFAKN vide → ce n\'est pas un avoir d\'annulation. On passe à BAPISDORDER.');
  }

  // ─── 3. BAPISDORDER_GETDETAILEDLIST sur la commande ───────────
  heading('3. BAPISDORDER_GETDETAILEDLIST (commande → REF_DOC)');
  let refDocFromBapi = '';
  if (salesOrderNumber) {
    try {
      const orderResult = await client.call('BAPISDORDER_GETDETAILEDLIST', {
        I_BAPI_VIEW: { HEADER: 'X' },
        SALES_DOCUMENTS: [{ VBELN: salesOrderNumber.padStart(10, '0') }],
      });
      const headers = getArray(orderResult.ORDER_HEADERS_OUT);
      if (headers.length === 0) {
        warn(`Aucun ORDER_HEADERS_OUT pour la commande ${salesOrderNumber}`);
      } else {
        headers.forEach((h, i) => {
          console.log(`    Header #${i + 1}  SALES_DOC=${h.SALES_DOC}  DOC_TYPE=${h.DOC_TYPE}  REF_DOC=${h.REF_DOC || '(vide)'}  REF_DOC_CA=${h.REF_DOC_CA || '(vide)'}  PURCH_NO=${h.PURCH_NO || '(vide)'}`);
        });
        refDocFromBapi = (headers[0].REF_DOC || '').trim();
        if (refDocFromBapi) ok(`REF_DOC = ${refDocFromBapi} → c'est la facture initiale d'après SAP.`);
        else bad('REF_DOC vide sur ORDER_HEADERS_OUT — la BAPI ne donne pas la facture initiale.');
      }
    } catch (e) {
      bad(`Erreur BAPISDORDER_GETDETAILEDLIST : ${e.message}`);
    }
  } else {
    warn('Pas de salesOrderNumber → stratégie sautée.');
  }

  // ─── 4. Recherche locale : factures sur la même commande ─────
  heading('4. Recherche locale — factures partageant le même AUBEL');
  if (salesOrderNumber) {
    try {
      const aubelPadded = salesOrderNumber.padStart(10, '0');
      const localItems = await db.SapVbrpItem.findAll({
        where: { AUBEL: { [Op.in]: [salesOrderNumber, aubelPadded] } },
        attributes: ['VBELN', 'POSNR', 'MATNR', 'FKIMG', 'VRKME'],
        raw: true,
      });
      if (localItems.length === 0) {
        info('Aucune ligne sap_vbrp_item locale avec ce AUBEL.');
      } else {
        const byVbeln = {};
        localItems.forEach(it => {
          if (!byVbeln[it.VBELN]) byVbeln[it.VBELN] = 0;
          byVbeln[it.VBELN]++;
        });
        Object.entries(byVbeln).forEach(([vbeln, count]) => {
          const isAvoir = vbeln.startsWith('87') || vbeln.startsWith('087');
          const tag = isAvoir ? '[AVOIR]' : '[FACTURE]';
          console.log(`    ${vbeln}  ${tag}  ${count} ligne(s)`);
        });
      }
    } catch (e) {
      bad(`Erreur recherche locale : ${e.message}`);
    }
  }

  // ─── 5. Présence éventuelle dans fne_invoices ────────────────
  heading('5. Vérification dans fne_invoices');
  const candidates = [refDocFromBapi, refDocFromBapi.padStart(10, '0'), avoirHeader?.SFAKN?.trim()].filter(Boolean);
  const uniqueCandidates = [...new Set(candidates)];
  if (uniqueCandidates.length === 0) {
    info('Aucun candidat de facture initiale → rien à chercher dans fne_invoices.');
  } else {
    for (const cand of uniqueCandidates) {
      const fne = await db.FneInvoice.findOne({ where: { numero_facture: cand }, raw: true });
      if (fne) {
        ok(`fne_invoices : ${cand} → fne_invoice_id=${fne.fne_invoice_id} ref=${fne.fne_reference} type=${fne.type}`);
      } else {
        warn(`fne_invoices : ${cand} → ABSENT (facture initiale non envoyée à la FNE)`);
      }
    }
  }

  // ─── Verdict ──────────────────────────────────────────────────
  heading('VERDICT');
  let factureInitialeIdentifiee = '';
  if (avoirHeader?.SFAKN?.trim()) {
    factureInitialeIdentifiee = avoirHeader.SFAKN.trim();
    console.log(`  → Facture initiale (via SFAKN) : ${c.bold}${factureInitialeIdentifiee}${c.reset}`);
  } else if (refDocFromBapi) {
    factureInitialeIdentifiee = refDocFromBapi;
    console.log(`  → Facture initiale (via REF_DOC BAPI) : ${c.bold}${factureInitialeIdentifiee}${c.reset}`);
  } else {
    console.log(`  ${c.red}→ AUCUNE facture initiale identifiable automatiquement.${c.reset}`);
    console.log(`  ${c.dim}    Stratégie SFAKN : ${avoirHeader?.SFAKN ? 'oui' : 'vide'}${c.reset}`);
    console.log(`  ${c.dim}    Stratégie BAPISDORDER : ${refDocFromBapi ? 'oui' : 'vide'}${c.reset}`);
    console.log(`  ${c.dim}    → Solution : saisir manuellement le n° de facture initiale dans le modal frontend.${c.reset}`);
  }

  await client.close();
  await db.sequelize.close();
})().catch(err => {
  console.error('Erreur fatale :', err);
  process.exit(1);
});
