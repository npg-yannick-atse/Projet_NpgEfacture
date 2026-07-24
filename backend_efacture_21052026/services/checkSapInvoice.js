/**
 * Vérifie l'existence d'une facture dans SAP (table VBRK) via RFC_READ_TABLE.
 * Utilisé notamment avant d'enregistrer une facture en "liste noire" (Non FNE).
 */
const { Client } = require('node-rfc');
const getSapConfig = require('../config/sapConfig');

/**
 * @param {string} numero  numéro de facture (VBELN)
 * @returns {Promise<{exists:boolean, fkart?:string, kunrg?:string, clientName?:string}>}
 */
async function checkSapInvoiceExists(numero) {
  const raw = String(numero || '').trim();

  // VBELN est CHAR(10) : un numéro numérique de plus de 10 chiffres ne peut pas exister.
  if (/^\d+$/.test(raw) && raw.length > 10) {
    console.log(`[checkSapInvoiceExists] ${raw} : >10 chiffres → invalide (n'existe pas dans SAP)`);
    return { exists: false };
  }
  // Documents numériques stockés cadrés à droite (zéros à gauche).
  const vbeln = /^\d+$/.test(raw) ? raw.padStart(10, '0') : raw;

  let client;
  try {
    const sapConfig = await getSapConfig();
    client = new Client(sapConfig);
    await client.connect();

    const result = await client.call('RFC_READ_TABLE', {
      QUERY_TABLE: 'VBRK',
      DELIMITER: '|',
      OPTIONS: [{ TEXT: `VBELN = '${vbeln}'` }],
      FIELDS: [{ FIELDNAME: 'VBELN' }, { FIELDNAME: 'FKART' }, { FIELDNAME: 'KUNRG' }],
      ROWSKIPS: 0,
      ROWCOUNT: 1,
    });

    const rows = result.DATA || [];
    if (!rows.length) {
      console.log(`[checkSapInvoiceExists] VBELN=${vbeln} → introuvable dans SAP`);
      return { exists: false };
    }

    const parts = (rows[0].WA || '').split('|').map((s) => s.trim());
    const fkart = parts[1] || null;
    const kunrg = parts[2] || null;

    // Nom du client (KNA1.NAME1) à partir du payeur KUNRG.
    let clientName = null;
    if (kunrg) {
      try {
        const kunnr = /^\d+$/.test(kunrg) ? kunrg.padStart(10, '0') : kunrg;
        const kna = await client.call('RFC_READ_TABLE', {
          QUERY_TABLE: 'KNA1',
          DELIMITER: '|',
          OPTIONS: [{ TEXT: `KUNNR = '${kunnr}'` }],
          FIELDS: [{ FIELDNAME: 'NAME1' }],
          ROWSKIPS: 0,
          ROWCOUNT: 1,
        });
        const kr = kna.DATA || [];
        if (kr.length) clientName = (kr[0].WA || '').split('|')[0].trim() || null;
      } catch (e) { /* nom non critique : on continue sans */ }
    }

    return { exists: true, fkart, kunrg, clientName };
  } finally {
    if (client) { try { await client.close(); } catch (e) { /* ignore */ } }
  }
}

module.exports = { checkSapInvoiceExists };
