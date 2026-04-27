/**
 * Test : Récupérer le N° de commande d'une facture d'avoir SAP
 *
 * Étape 1 : RFC_READ_TABLE sur VBRP (items facturation) pour trouver AUBEL (N° commande)
 * Étape 2 : BAPISDORDER_GETDETAILEDLIST avec le N° commande
 *
 * Usage : node TEST/test_bapi_avoir.js <NUMERO_AVOIR>
 * Exemple : node TEST/test_bapi_avoir.js 9000109314
 */

const { Client } = require('node-rfc');
const getSapConfig = require('../config/sapConfig');

async function testBapiAvoir() {
    const invoiceNumber = process.argv[2];

    if (!invoiceNumber) {
        console.error('Usage : node TEST/test_bapi_avoir.js <NUMERO_AVOIR>');
        process.exit(1);
    }

    const vbeln = invoiceNumber.padStart(10, '0');
    console.log(`\n=== Test : Facture d'avoir ${vbeln} ===\n`);

    let client;
    try {
        const sapConfig = await getSapConfig();
        client = new Client(sapConfig);
        await client.open();
        console.log('Connexion SAP établie.\n');

        // ============================================================
        // ÉTAPE 1 : RFC_READ_TABLE sur VBRP pour trouver le N° commande (AUBEL)
        // ============================================================
        console.log('=== ÉTAPE 1 : Lecture table VBRP (items facturation) ===');
        console.log(`Filtre : VBELN = ${vbeln}\n`);

        const vbrpResult = await client.call('RFC_READ_TABLE', {
            QUERY_TABLE: 'VBRP',
            DELIMITER: '|',
            OPTIONS: [
                { TEXT: `VBELN = '${vbeln}'` }
            ],
            FIELDS: [
                { FIELDNAME: 'VBELN' },   // N° facture/avoir
                { FIELDNAME: 'POSNR' },   // Poste
                { FIELDNAME: 'AUBEL' },   // N° commande de vente
                { FIELDNAME: 'VGBEL' },   // Doc. précédent (livraison)
                { FIELDNAME: 'MATNR' },   // N° article
                { FIELDNAME: 'NETWR' },   // Montant net
            ],
            ROWCOUNT: 100
        });

        const fields = vbrpResult.FIELDS.map(f => f.FIELDNAME);
        console.log('Champs :', fields.join(', '));

        let salesOrderNumber = '';

        if (vbrpResult.DATA && vbrpResult.DATA.length > 0) {
            console.log(`\n${vbrpResult.DATA.length} ligne(s) trouvée(s) :\n`);

            vbrpResult.DATA.forEach((row, index) => {
                const values = row.WA.split('|');
                const record = {};
                fields.forEach((f, i) => record[f] = (values[i] || '').trim());

                console.log(`  [${index}]:`);
                for (const [field, val] of Object.entries(record)) {
                    if (val !== '') console.log(`    ${field}: ${val}`);
                }
                console.log('');

                // Récupérer le N° commande (AUBEL)
                if (record.AUBEL && record.AUBEL.trim() !== '') {
                    salesOrderNumber = record.AUBEL.trim();
                }
            });

            console.log(`>>> N° Commande de vente (AUBEL) : ${salesOrderNumber || 'NON TROUVÉ'}`);
        } else {
            console.log('>>> Aucune ligne trouvée dans VBRP pour cet avoir.');
        }

        // ============================================================
        // ÉTAPE 1b : Lire aussi VBRK (header) pour info complémentaire
        // ============================================================
        console.log('\n=== INFO : Header VBRK ===');
        const vbrkResult = await client.call('RFC_READ_TABLE', {
            QUERY_TABLE: 'VBRK',
            DELIMITER: '|',
            OPTIONS: [
                { TEXT: `VBELN = '${vbeln}'` }
            ],
            FIELDS: [
                { FIELDNAME: 'VBELN' },   // N° document
                { FIELDNAME: 'FKART' },   // Type de facture
                { FIELDNAME: 'FKDAT' },   // Date facture
                { FIELDNAME: 'KUNRG' },   // Donneur d'ordre
                { FIELDNAME: 'NETWR' },   // Montant net
                { FIELDNAME: 'WAERK' },   // Devise
                { FIELDNAME: 'SFAKN' },   // Facture annulée (si avoir d'annulation)
            ],
            ROWCOUNT: 10
        });

        const hdrFields = vbrkResult.FIELDS.map(f => f.FIELDNAME);
        if (vbrkResult.DATA && vbrkResult.DATA.length > 0) {
            const values = vbrkResult.DATA[0].WA.split('|');
            const hdr = {};
            hdrFields.forEach((f, i) => hdr[f] = (values[i] || '').trim());

            for (const [field, val] of Object.entries(hdr)) {
                if (val !== '') console.log(`  ${field}: ${val}`);
            }

            if (hdr.SFAKN && hdr.SFAKN.trim() !== '') {
                console.log(`\n>>> C'est un avoir d'ANNULATION de la facture : ${hdr.SFAKN}`);
            }
        }

        // ============================================================
        // ÉTAPE 2 : BAPISDORDER_GETDETAILEDLIST avec le N° commande
        // ============================================================
        if (salesOrderNumber) {
            console.log(`\n=== ÉTAPE 2 : BAPISDORDER_GETDETAILEDLIST (commande ${salesOrderNumber}) ===\n`);

            const orderResult = await client.call('BAPISDORDER_GETDETAILEDLIST', {
                I_BAPI_VIEW: {
                    HEADER: 'X',
                },
                SALES_DOCUMENTS: [
                    { VBELN: salesOrderNumber.padStart(10, '0') }
                ]
            });

            // Afficher uniquement les tables non vides
            for (const key of Object.keys(orderResult)) {
                const value = orderResult[key];
                if (Array.isArray(value) && value.length > 0) {
                    console.log(`--- ${key} (${value.length} entrée(s)) ---`);
                    console.log('Champs :', Object.keys(value[0]).join(', '));
                    value.forEach((entry, index) => {
                        console.log(`\n  [${index}]:`);
                        for (const [field, val] of Object.entries(entry)) {
                            if (val !== '' && val !== '0' && val !== '0.000' && val !== '000' && val !== '0000000000') {
                                console.log(`    ${field}: ${val}`);
                            }
                        }
                    });
                    console.log('');
                }
            }

            // Focus ORDER_HEADERS_OUT
            if (orderResult.ORDER_HEADERS_OUT && orderResult.ORDER_HEADERS_OUT.length > 0) {
                console.log('\n=== RÉSULTAT : ORDER_HEADERS_OUT ===');
                orderResult.ORDER_HEADERS_OUT.forEach((header) => {
                    console.log(`  DOC_NUMBER : ${header.DOC_NUMBER}`);
                    console.log(`  REF_DOC    : ${header.REF_DOC}`);
                    console.log(`  DOC_TYPE   : ${header.DOC_TYPE}`);
                    console.log(`  PURCH_NO   : ${header.PURCH_NO}`);
                    console.log(`  SOLD_TO    : ${header.SOLD_TO}`);
                    console.log(`  NET_VALUE  : ${header.NET_VALUE}`);
                    console.log(`  CURRENCY   : ${header.CURRENCY}`);
                });
            } else {
                console.log('\n>>> ORDER_HEADERS_OUT est vide.');
            }
        } else {
            console.log('\n>>> Pas de N° commande trouvé, étape 2 ignorée.');
        }

    } catch (error) {
        console.error('\nErreur :', error.message);
        if (error.code) console.error('Code :', error.code);
        if (error.key) console.error('Key :', error.key);
    } finally {
        if (client) {
            await client.close();
            console.log('\nConnexion SAP fermée.');
        }
    }
}

testBapiAvoir();
