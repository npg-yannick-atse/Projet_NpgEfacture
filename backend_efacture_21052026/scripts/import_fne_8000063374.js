'use strict';
// Import de la facture FNE 8000063374 (certifiée à la FNE mais absente de fne_invoices)
// -> recrée fne_invoices + fne_invoice_items pour permettre la création de l'AVOIR.
// Idempotent : ne fait rien si le fne_invoice_id existe déjà.
// Usage: node scripts/import_fne_8000063374.js
//   (DEV par défaut ; pour la PROD, surcharger DB_HOST/DB_USER/DB_PASS en variables d'env)
require('dotenv').config();
const { sequelize, FneInvoice, FneInvoiceItem } = require('../models');

const NUMERO = '8000063374';
const FNE_ID = 'eee755cd-f293-4526-bd79-037e33ab6861';
const REFERENCE = '9904279V26000003445';
const NCC = '9904279V';
const TOKEN = '019cfd1a-b9c5-7001-af38-950f340ab23c';

const ITEMS = [
  ['548a00ab-4548-4bed-bfd9-ae896c49fcdc', '0OUCEDT0050', 'EDT. OUD CHARMANT 50ML', 24],
  ['7bd69297-0e2d-4cf5-bf5f-19a9dc493503', '0TSGEDT0050', 'EDT. THE SHY GUARDIAN 50ML', 24],
  ['897f549a-6057-4523-b1ec-42bb5396915a', '0DUMEDT0050', 'EDT. DUO MILLESIME 50ML', 24],
  ['ea7cb114-3b39-44f3-b39e-625a30b1c54a', '0ETSEDT0050', 'EDT. ET SI 50ML', 24],
  ['2e53cdb3-c833-44fb-b033-c85e6e2431ff', '0IPNEDT0050', 'EDT. IPNOLA 50ML', 24],
  ['6de59a68-c1cd-49af-b1e5-74db42c61bde', '0SPGEDT0050', 'EDT. SPACE GUEST 50ML', 24],
  ['89c89c40-815f-4375-89a5-187e9e87657e', '0MYMEDT0050', 'EDT. MY MAN 50ML', 24],
  ['9f7d8dba-cdd6-4de6-91f7-d2cf06514304', '0OLAEDT0050', 'EDT. OLADIVA 50ML', 24],
  ['bf26be87-5266-40a9-9089-e963628d98bf', '0NIWEDT0050', 'EDT. NIGHT WALK 50ML', 24],
  ['7f87eddf-8655-45ee-9496-8acbcff3bd2c', '0SIHEDT0050', 'EDT. SILVER HIMSELF 50ML', 24],
  ['08bdaa18-eec9-465d-ac5b-e4bf0d207397', '0FRAEDT0050', 'EDT. FRAGRANT SCENE 50ML', 24],
  ['43d52e7a-dc5c-4162-90bd-25ccdd88b1ee', '0PAAEDT0050', 'EDT. PASSION AERA 50ML', 24],
  ['cd08fede-b7b4-4a00-b5ab-6564d10af418', '0MPWEDT0050', 'EDT. MY PERFECT WOOD 50ML', 24],
  ['49095b2c-ab26-4360-bfbd-bfedf743f69e', '0MTAEDT0050', 'EDT. MY TABOU 50ML', 24],
  ['94599446-fd27-4b43-804e-d8f1f607680c', '0NIGEDT0050', 'EDT. NIGHT GIFT 50ML', 24],
  ['e8883abb-a9bc-4fa2-a95c-495419ffc907', '0PIHEDT0050', 'EDT. PINK HONOUR 50ML', 24],
];

(async () => {
  try {
    console.log(`Cible : ${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}`);
    const existing = await FneInvoice.findOne({ where: { fne_invoice_id: FNE_ID } });
    if (existing) {
      console.log('fne_invoices existe déjà pour ce fne_id — rien à faire (idempotent).');
      return;
    }

    // 1) fne_invoices (reconstruit la réponse minimale attendue)
    const apiResponse = {
      ncc: NCC,
      reference: REFERENCE,
      token: TOKEN,
      invoice: {
        id: FNE_ID,
        reference: REFERENCE,
        type: 'invoice',
        items: ITEMS.map(([id, reference, description, quantity]) => ({ id, reference, description, quantity })),
      },
      _imported_manually: true,
      _imported_reason: 'Certifiée FNE mais absente de fne_invoices (envoi enregistré en erreur)',
    };

    await FneInvoice.create({
      numero_facture: NUMERO,
      fne_invoice_id: FNE_ID,
      fne_reference: REFERENCE,
      fne_ncc: NCC,
      fne_token: TOKEN,
      api_response: apiResponse,
      type: 'invoice',
    });
    console.log(`✔ fne_invoices créé : ${NUMERO} / ${FNE_ID}`);

    // 2) fne_invoice_items
    const rows = ITEMS.map(([fne_item_id, reference, description, quantity]) => ({
      fne_invoice_id: FNE_ID, fne_item_id, reference, description, quantity,
      item_data: { id: fne_item_id, reference, description, quantity },
    }));
    await FneInvoiceItem.bulkCreate(rows);
    console.log(`✔ ${rows.length} items créés.`);

    console.log('\nTerminé. La facture peut maintenant être retrouvée par by-sap-number -> avoir possible.');
  } catch (e) {
    console.error('Erreur import:', e.message);
    process.exitCode = 1;
  } finally {
    await sequelize.close();
  }
})();
