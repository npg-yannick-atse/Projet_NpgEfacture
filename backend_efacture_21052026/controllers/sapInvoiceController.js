const { Client } = require('node-rfc');
const getSapConfig = require('../config/sapConfig');
const db = require('../models'); // This will load all models from the models directory
const { Op } = require('sequelize');
const { notifyAvoirBlocked } = require('../services/notifyAvoirBlocked');
const {
    SapInvoice,
    SapVbrkHeader,
    SapVbrpItem,
    SapKomvCondition,
    SapVbpaPartner,
    SapReferenceCmde,
    SapAdresseClient,
    InvoiceTotals,
    LogsAction,
    DownloadedInvoice,
    FneInvoice,
    FneInvoiceItem,
    FneMarkedInvoice,
    AutoDownloadFlagged
} = db;

const convertSapDate = (sapDate) => {
    if (!sapDate) return null;
    if (sapDate instanceof Date) return sapDate;
    const s = String(sapDate);
    if (s.length === 8 && /^\d{8}$/.test(s)) {
        const year = s.substring(0, 4);
        const month = s.substring(4, 6);
        const day = s.substring(6, 8);
        return new Date(`${year}-${month}-${day}`);
    }
    const d = new Date(sapDate);
    return Number.isNaN(d.getTime()) ? null : d;
};

const getArray = (value) => {
    if (!value) return [];
    if (Array.isArray(value)) return value;
    if (typeof value === 'object') return Object.values(value);
    return [];
};

// Convertir les chaînes vides en null pour les colonnes DECIMAL (MySQL strict mode)
const cleanEmptyDecimals = (obj, model) => {
    if (!model || !model.rawAttributes) return obj;
    for (const [field, attr] of Object.entries(model.rawAttributes)) {
        const typeName = attr.type?.key || attr.type?.constructor?.name || '';
        if ((typeName === 'DECIMAL' || typeName === 'INTEGER' || typeName === 'BIGINT' || typeName === 'FLOAT' || typeName === 'DOUBLE') &&
            obj[field] === '') {
            obj[field] = null;
        }
    }
    return obj;
};

/**
 * Récupère la référence de commande de vente depuis SAP via ZBAPI_REFERENCE_CMDE
 * @param {Object} client - Client SAP RFC connecté
 * @param {string} invoiceNumber - Numéro de facture
 * @returns {Promise<string>} - Référence de commande ou chaîne vide
 */
const getSalesOrderReference = async (client, invoiceNumber) => {
    try {
        console.log('=== Appel ZBAPI_REFERENCE_CMDE ===');
        console.log('Numéro de facture (ZFACTURE):', invoiceNumber);

        const result = await client.call('ZBAPI_REFERENCE_CMDE', {
            ZFACTURE: invoiceNumber
        });

        // Extraire ZREFERENCE depuis ZZSTRUCT_VBKD (qui est retournée comme un tableau par SAP)
        const vbkdArray = result.ZZSTRUCT_VBKD || [];
        const reference = (vbkdArray.length > 0 && vbkdArray[0].ZREFERENCE) ? vbkdArray[0].ZREFERENCE : '';

        console.log('Référence de commande extraite (ZREFERENCE):', reference);

        // Enregistrer en base de données
        try {
            await SapReferenceCmde.destroy({ where: { VBELN: invoiceNumber } });
            await SapReferenceCmde.create({
                VBELN: invoiceNumber,
                ZREFERENCE: reference.toString().trim(),
            });
            console.log('ZBAPI_REFERENCE_CMDE enregistré en base pour', invoiceNumber);
        } catch (dbErr) {
            console.error('Erreur enregistrement sap_reference_cmde:', dbErr.message);
        }

        return reference.toString().trim();
    } catch (error) {
        console.error('Erreur lors de l\'appel à ZBAPI_REFERENCE_CMDE:', error.message);
        // Retourner une chaîne vide en cas d'erreur pour ne pas bloquer le traitement
        return '';
    }
};


/**
 * Vérifie si une facture est déjà "marquée FNE" dans SAP via ZBAPI_INFO_FNE_FACTURES.
 * Retourne la valeur de TEXT1 (flag) — chaîne vide si non marquée.
 * @param {Object} client - Client SAP RFC connecté
 * @param {string} invoiceNumber
 * @returns {Promise<string>}
 */
const getFneMarkText = async (client, invoiceNumber) => {
    try {
        const result = await client.call('ZBAPI_INFO_FNE_FACTURES', { ZFACTURE: invoiceNumber });
        const s = result && result.ZZSTRUCT_FACT_FNE;
        let text1 = '';
        if (Array.isArray(s)) text1 = s.length > 0 ? (s[0].TEXT1 || '') : '';
        else if (s && typeof s === 'object') text1 = s.TEXT1 || '';
        return String(text1).trim();
    } catch (error) {
        console.error('Erreur ZBAPI_INFO_FNE_FACTURES:', error.message);
        return '';
    }
};

const getInvoiceDocument = async (req, res) => {
    let client;
    let fneMarkText = '';
    try {
        // On accepte désormais VBELN (prioritaire) ou l'ancien champ invoiceNumber
        const {
            VBELN,
            invoiceNumber: invoiceNumberBody,
            fiscalYear,
            MANDT,
            FKART,
            KONV_READ: konvReadFlag,
        } = req.body || {};
        const invoiceNumber = VBELN || invoiceNumberBody || null;
        const mandant = MANDT || req.body?.mandant || null;
        const invoiceType = FKART || req.body?.invoiceType || null;
        const konvRead = konvReadFlag ?? req.body?.konvRead ?? null;

        // --- Chronométrage par étape (grep "[PERF]" dans les logs serveur) ---
        // Affiche la durée de chaque phase + le cumul, pour isoler la lenteur :
        // connexion SAP vs BAPI vs sauvegarde DB vs requêtes conditions KOMV.
        const _perfStart = Date.now();
        let _perfLast = _perfStart;
        const perf = (label) => {
            const now = Date.now();
            console.log(`[PERF][${invoiceNumber || '?'}] ${label}: ${now - _perfLast}ms (cumul ${now - _perfStart}ms)`);
            _perfLast = now;
        };

        // Liste noire : facture marquée "à ne pas envoyer à la FNE" → on bloque le téléchargement
        // (contrôle prioritaire pour éviter le message trompeur "déjà téléchargée et envoyée").
        if (invoiceNumber) {
            const blacklisted = await AutoDownloadFlagged.findOne({
                where: { numero_facture: invoiceNumber, kind: 'non_fne' },
                attributes: ['id', 'detail']
            });
            if (blacklisted) {
                return res.status(409).json({
                    success: false,
                    error: 'BLACKLISTED',
                    blacklisted: true,
                    message: `La facture ${invoiceNumber} est en liste noire (Non FNE) — à ne pas envoyer à la FNE.`
                });
            }
        }

        // Vérifier si la facture a déjà été téléchargée
        if (invoiceNumber) {
            const existingInvoice = await DownloadedInvoice.findOne({
                where: { numero: invoiceNumber }
            });

            if (existingInvoice) {
                // Vérifier si elle a été envoyée
                const sentInvoice = await LogsAction.findOne({
                    where: {
                        numero_facture: invoiceNumber,
                        SendBy: { [Op.ne]: null }
                    }
                });

                if (sentInvoice) {
                    return res.status(409).json({
                        success: false,
                        message: `La facture ${invoiceNumber} a déjà été téléchargée et envoyée`
                    });
                } else {
                    return res.status(409).json({
                        success: false,
                        message: `La facture ${invoiceNumber} a déjà été téléchargée`
                    });
                }
            }
        }

        perf('vérif existence facture en DB');

        const sapConfig = await getSapConfig();
        client = new Client(sapConfig);

        await client.connect();

        perf('connexion SAP (getSapConfig + connect)');

        // Appel de RV_INVOICE_DOCUMENT_READ en passant la structure VBRK_I
        // avec le numéro de facture dans le champ VBELN (XVBRK-VBELN)
        const bapiParams = {};

        if (invoiceNumber) {
            bapiParams.VBRK_I = {
                VBELN: invoiceNumber,
            };
            if (mandant) bapiParams.VBRK_I.MANDT = mandant;
            if (invoiceType) bapiParams.VBRK_I.FKART = invoiceType;
        }

        // KONV_READ toujours à 'X' comme demandé
        bapiParams.KONV_READ = 'X';

        console.log('=== Appel BAPI ZRV_INVOICE_DOCUMENT_READ ===');
        console.log('Paramètres envoyés à SAP (VBRK_I):', JSON.stringify(bapiParams, null, 2));

        const result = await client.call('ZRV_INVOICE_DOCUMENT_READ', bapiParams);

        perf('BAPI lecture facture ZRV_INVOICE_DOCUMENT_READ');

        console.log('BAPI ZRV_INVOICE_DOCUMENT_READ appelée avec succès');

        // Filtrer les lignes avec une quantité nulle (FKIMG == 0)
        if (result && result.XVBRP) {
            const initialCount = result.XVBRP.length;
            const vbrpArray = getArray(result.XVBRP);
            result.XVBRP = vbrpArray.filter(item => {
                const qte = parseFloat(String(item.FKIMG).replace(',', '.'));
                return qte !== 0;
            });
            console.log(`Lignes filtrées (FKIMG != 0) : ${initialCount} -> ${result.XVBRP.length}`);
        }

        if (result && typeof result === 'object') {
            console.log('Clés du résultat BAPI:', Object.keys(result));
        } else {
            console.log('Résultat BAPI non structuré:', result);
        }

        if (!invoiceNumber) {
            if (client) {
                try {
                    await client.close();
                } catch (e) {
                    console.error('Erreur lors de la fermeture de la connexion SAP:', e);
                }
            }
            return res.json({
                success: true,
                message: 'BAPI appelée sans paramètre (aucune persistance effectuée)',
                data: result,
            });
        }

        await db.sequelize.authenticate();
        const tx = await db.sequelize.transaction();

        try {
            const xvbrkArray = getArray(result.XVBRK);
            const vbrkHeaderFromXvbrk = xvbrkArray.length > 0 ? xvbrkArray[0] : null;

            const vbrkHeader = result.VBRK_E || result.VBRK || vbrkHeaderFromXvbrk || {};
            const vbukHeader = result.VBUK_E || result.VBUK || {};

            // Validation des critères BZIRK et KDGRP
            const bzirk = (vbrkHeader.BZIRK || '').trim();
            const kdgrp = (vbrkHeader.KDGRP || '').trim();

            if (!bzirk.startsWith('LOC') || kdgrp === 'Z4') {
                await tx.rollback();
                if (client) await client.close();
                return res.status(403).json({
                    success: false,
                    error: 'Facture non autorisée',
                    message: `La facture ${invoiceNumber} ne respecte pas les critères : District=${bzirk}, Groupe Client=${kdgrp} (Attendu: District commence par LOC et Groupe != Z4)`
                });
            }

            // Nettoyage des DECIMAL vides pour MySQL strict mode
            cleanEmptyDecimals(vbrkHeader, SapVbrkHeader);

            // Nettoyage et enregistrement de l'entête VBRK dans sap_vbrk_header
            if (vbrkHeader && vbrkHeader.MANDT && vbrkHeader.VBELN) {
                await SapVbrkHeader.destroy({
                    where: { MANDT: vbrkHeader.MANDT, VBELN: vbrkHeader.VBELN },
                    transaction: tx,
                });

                await SapVbrkHeader.create(vbrkHeader, { transaction: tx });
            }

            // Supprimer une ancienne version éventuelle dans sap_invoice (métadonnées)
            await SapInvoice.destroy({
                where: { invoice_number: invoiceNumber, fiscal_year: fiscalYear || null },
                transaction: tx,
            });

            const invoice = await SapInvoice.create({
                invoice_number: invoiceNumber,
                fiscal_year: fiscalYear || null,
                company_code: vbrkHeader.BUKRS || null,
                currency: vbrkHeader.WAERK || null,
                net_value: vbrkHeader.NETWR ? parseFloat(vbrkHeader.NETWR) : null,
                gross_value: vbrkHeader.BRGEW ? parseFloat(vbrkHeader.BRGEW) : null,
                billing_date: vbrkHeader.FKDAT ? convertSapDate(vbrkHeader.FKDAT) : null,
                vbrk_e_json: vbrkHeader || null,
                vbuk_e_json: vbukHeader || null,
            }, { transaction: tx });

            // Enregistrement des lignes XVBRP dans sap_vbrp_item
            const vbrpRows = getArray(result.XVBRP);
            if (vbrpRows.length && vbrkHeader && vbrkHeader.MANDT && vbrkHeader.VBELN) {
                await SapVbrpItem.destroy({
                    where: { MANDT: vbrkHeader.MANDT, VBELN: vbrkHeader.VBELN },
                    transaction: tx,
                });

                const itemsPayload = vbrpRows.map((row) => {
                    const clone = { ...row };
                    // Conversion des buffers éventuels
                    if (clone.DISPUTE_CASE && clone.DISPUTE_CASE.type === 'Buffer') {
                        clone.DISPUTE_CASE = Buffer.from(clone.DISPUTE_CASE.data);
                    }
                    if (clone.FUND_USAGE_ITEM && clone.FUND_USAGE_ITEM.type === 'Buffer') {
                        clone.FUND_USAGE_ITEM = Buffer.from(clone.FUND_USAGE_ITEM.data);
                    }
                    if (clone.CAMPAIGN && clone.CAMPAIGN.type === 'Buffer') {
                        clone.CAMPAIGN = Buffer.from(clone.CAMPAIGN.data);
                    }
                    // Transformation de l'unité KAR en CRN si nécessaire
                    if (clone.MEINS && clone.MEINS.trim() === 'KAR') {
                        clone.MEINS = 'CRN';
                    }
                    cleanEmptyDecimals(clone, SapVbrpItem);
                    return clone;
                });

                await SapVbrpItem.bulkCreate(itemsPayload, { transaction: tx });
            }

            // Enregistrement des partenaires XVBPA dans sap_vbpa_partner
            const vbpaRows = getArray(result.XVBPA);
            if (vbpaRows.length && vbrkHeader && vbrkHeader.MANDT && vbrkHeader.VBELN) {
                await SapVbpaPartner.destroy({
                    where: { MANDT: vbrkHeader.MANDT, VBELN: vbrkHeader.VBELN },
                    transaction: tx,
                });

                await SapVbpaPartner.bulkCreate(vbpaRows, { transaction: tx });
            }

            // Enregistrement des conditions XKOMV dans sap_komv_condition
            const komvRows = getArray(result.XKOMV);
            if (komvRows.length && vbrkHeader && vbrkHeader.KNUMV) {
                await SapKomvCondition.destroy({
                    where: { KNUMV: vbrkHeader.KNUMV },
                    transaction: tx,
                });

                const komvPayload = komvRows.map((row) => {
                    const clone = { ...row };
                    if (clone.KBFLAG && clone.KBFLAG.type === 'Buffer') {
                        clone.KBFLAG = Buffer.from(clone.KBFLAG.data);
                    }
                    cleanEmptyDecimals(clone, SapKomvCondition);
                    return clone;
                });

                await SapKomvCondition.bulkCreate(komvPayload, { transaction: tx });
            }

            await tx.commit();
            perf('sauvegarde DB (transaction VBRK/VBRP/VBPA/KOMV)');
        } catch (dbErr) {
            await tx.rollback();
            console.error('Erreur lors de la sauvegarde de la facture SAP:', dbErr);
            return res.status(500).json({
                success: false,
                error: 'Erreur lors de l\'enregistrement de la facture en base',
                details: dbErr.message,
            });
        }

        // Récupération de la référence de commande de vente
        let salesOrderReference = '';
        try {
            salesOrderReference = await getSalesOrderReference(client, invoiceNumber);
        } catch (error) {
            console.error('Erreur lors de la récupération de la référence de commande:', error);
            // Continue même si la récupération échoue
        }

        perf('BAPI référence commande ZBAPI_REFERENCE_CMDE');

        // Vérifier si la facture est déjà "marquée FNE" dans SAP (ZBAPI_INFO_FNE_FACTURES).
        // Si TEXT1 est rempli → on enregistre la facture et on bloquera son envoi.
        try {
            fneMarkText = await getFneMarkText(client, invoiceNumber);
            if (fneMarkText) {
                await FneMarkedInvoice.upsert({
                    numero_facture: invoiceNumber,
                    text1: fneMarkText,
                    marked_at: new Date(),
                });
                console.log(`Facture ${invoiceNumber} déjà marquée FNE (TEXT1="${fneMarkText}") → envoi à bloquer.`);
            }
        } catch (e) {
            console.error('Erreur vérification marquage FNE:', e.message);
        }

        perf('BAPI marquage FNE ZBAPI_INFO_FNE_FACTURES');

        // Fermeture de la connexion SAP
        if (client) {
            try {
                await client.close();
            } catch (e) {
                console.error('Erreur lors de la fermeture de la connexion SAP:', e);
            }
        }

        perf('fermeture connexion SAP');


        // Récupération des informations client
        const clientInfo = result.XVBPA && result.XVBPA.length > 0 ?
            result.XVBPA.find(p => p.PARVW === 'AG') || result.XVBPA[0] : {};

        // Récupération du STCEG directement depuis la table sap_vbrk_header
        const vbrkHeader = await db.SapVbrkHeader.findOne({
            where: { VBELN: invoiceNumber }
        });

        const stcegValue = vbrkHeader ? vbrkHeader.STCEG : '';

        // Récupération de la TVA depuis sap_komv_condition
        console.log('=== RECHERCHE TVA DANS sap_komv_condition ===');
        console.log('VBELN:', invoiceNumber);

        let tvaValue = '';
        if (vbrkHeader) {
            try {
                console.log('=== RECHERCHE MWAS DANS BASE DE DONNÉES ===');
                console.log('vbrkHeader.KNUMV:', vbrkHeader.KNUMV);

                // Utiliser le KNUMV comme pour MWAL
                const knumvValue = vbrkHeader.KNUMV;

                // D'abord, voir toutes les conditions MWAS pour ce KNUMV
                const allMwasConditions = await db.SapKomvCondition.findAll({
                    where: {
                        KNUMV: knumvValue,
                        KSCHL: { [Op.like]: '%MWAS%' }
                    }
                });

                console.log('Toutes les conditions MWAS trouvées:', allMwasConditions.length);
                allMwasConditions.forEach(cond => {
                    console.log(`MWAS - KNUMV: ${cond.KNUMV}, KSCHL: ${cond.KSCHL}, KBETR: ${cond.KBETR}`);
                });

                // Chercher spécifiquement KBETR = '180,00' dans les lignes avec MWAS
                const mwasConditions = await db.SapKomvCondition.findAll({
                    where: {
                        KNUMV: knumvValue,
                        KSCHL: { [Op.like]: '%MWAS%' },
                        KBETR: '180,00'
                    }
                });

                console.log('mwasConditions avec KBETR=180,00 trouvées:', mwasConditions.length);

                if (mwasConditions.length > 0) {
                    tvaValue = '18'; // Afficher 18 si KBETR = 180,00
                    console.log('TVA trouvée: 18');
                } else {
                    console.log('Aucune condition MWAS avec KBETR=180,00 trouvée');
                }
            } catch (dbError) {
                console.error('Erreur lors de la recherche TVA dans DB:', dbError);
            }
        }

        console.log('Valeur TVA finale:', tvaValue);

        // Recherche des conditions MWAL dans la base de données sap_komv_condition
        let mwalValue = 0;
        console.log('=== VÉRIFICATION MWAL ===');
        console.log('vbrkHeader existe?', !!vbrkHeader);
        if (vbrkHeader) {
            console.log('vbrkHeader.KNUMV:', vbrkHeader.KNUMV);
            try {
                console.log('=== RECHERCHE MWAL DANS BASE DE DONNÉES ===');
                console.log('vbrkHeader.KNUMV:', vbrkHeader.KNUMV);
                console.log('invoiceNumber (VBELN):', invoiceNumber);

                // Le KNUMV est déjà dans vbrkHeader, utilisons-le directement
                const knumvValue = vbrkHeader.KNUMV;
                console.log('KNUMV à utiliser:', knumvValue);

                // D'abord, voir toutes les conditions MWAL pour ce KNUMV
                const allMwalConditions = await db.SapKomvCondition.findAll({
                    where: {
                        KNUMV: knumvValue,
                        KRECH: { [Op.like]: '%A%' },
                        KSCHL: { [Op.like]: '%MWAL%' }
                    }
                });

                console.log('Toutes les conditions MWAL trouvées:', allMwalConditions.length);
                allMwalConditions.forEach(cond => {
                    console.log(`MWAL - KNUMV: ${cond.KNUMV}, KSCHL: ${cond.KSCHL}, KBETR: ${cond.KBETR}, KRECH: ${cond.KRECH}`);
                });

                // Utiliser les conditions MWAL trouvées (toutes les valeurs KBETR)
                if (allMwalConditions.length > 0) {
                    const firstMwal = allMwalConditions[0];
                    const rawMwal = parseFloat(firstMwal.KBETR.replace(',', '.'));
                    // ESSAI D'ADAPTATION D'ECHELLE : on essaye /10, /100, /1000 et on choisit la valeur <= 100 si possible
                    const candidates = [rawMwal / 10, rawMwal / 100, rawMwal / 1000, rawMwal];
                    mwalValue = candidates.find(c => c > 0 && c <= 100) ?? (rawMwal / 10);
                    console.log('MWAL raw KBETR:', firstMwal.KBETR, '=> raw:', rawMwal, '=> selected mwalValue:', mwalValue);
                    console.log('KBETR original:', firstMwal.KBETR);
                } else {
                    console.log('Aucune condition MWAL trouvée');
                }
            } catch (dbError) {
                console.error('Erreur lors de la recherche MWAL dans DB:', dbError);
            }
        }

        // Récupération de la remise basée sur SAKN1
        console.log('\n' + '='.repeat(80));
        console.log('=== DÉMARRAGE DU CALCUL DE REMISE (NOUVELLE LOGIQUE SAKN1) ===');
        console.log('='.repeat(80));
        console.log(`\n📄 Numéro de document (KNUMV): ${vbrkHeader?.KNUMV || 'non trouvé'}`);
        let remiseZR01 = 0;
        if (vbrkHeader && vbrkHeader.KNUMV) {
            try {
                // Étape 1 : Chercher ZREM avec SAKN1 non vide
                console.log('\n' + '🔄'.repeat(20));
                console.log('ÉTAPE 1 : RECHERCHE DE LA CONDITION ZREM AVEC SAKN1 NON VIDE');
                console.log('🔄'.repeat(20));

                const zremCondition = await db.SapKomvCondition.findOne({
                    where: {
                        KNUMV: vbrkHeader.KNUMV,
                        KSCHL: 'ZREM',
                        KBETR: { [Op.ne]: null },
                        SAKN1: { [Op.ne]: null, [Op.ne]: '' }
                    },
                    raw: true
                });

                if (zremCondition) {
                    console.log('\n' + '✅'.repeat(40));
                    console.log('CONDITION ZREM AVEC SAKN1 NON VIDE TROUVÉE');
                    console.log('✅'.repeat(40));
                    console.log('� Détails de la condition ZREM :');
                    console.log(JSON.stringify(zremCondition, null, 2));
                    console.log('🔹 SAKN1:', zremCondition.SAKN1);

                    const kbstr = zremCondition.KBETR.toString().replace(',', '.');
                    remiseZR01 = Math.abs(parseFloat(kbstr)) / 10;
                    console.log(`\n✅ Remise ZREM appliquée: ${remiseZR01}% (valeur originale: ${kbstr})`);
                } else {
                    console.log('❌ Aucune condition ZREM avec SAKN1 non vide trouvée');

                    // Étape 2 : Chercher ZR01 avec SAKN1 non vide
                    console.log('\n' + '🔄'.repeat(20));
                    console.log('ÉTAPE 2 : RECHERCHE DE LA CONDITION ZR01 AVEC SAKN1 NON VIDE');
                    console.log('🔄'.repeat(20));

                    const zr01Condition = await db.SapKomvCondition.findOne({
                        where: {
                            KNUMV: vbrkHeader.KNUMV,
                            KSCHL: 'ZR01',
                            KBETR: { [Op.ne]: null },
                            SAKN1: { [Op.ne]: null, [Op.ne]: '' }
                        },
                        raw: true
                    });

                    if (zr01Condition) {
                        console.log('\n' + '✅'.repeat(40));
                        console.log('CONDITION ZR01 AVEC SAKN1 NON VIDE TROUVÉE');
                        console.log('✅'.repeat(40));
                        console.log('📊 Détails de la condition ZR01 :');
                        console.log(JSON.stringify(zr01Condition, null, 2));
                        console.log('🔹 SAKN1:', zr01Condition.SAKN1);

                        const kbstr = zr01Condition.KBETR.toString().replace(',', '.');
                        remiseZR01 = Math.abs(parseFloat(kbstr)) / 10;
                        console.log(`\n✅ Remise ZR01 appliquée: ${remiseZR01}% (valeur originale: ${kbstr})`);
                    } else {
                        console.log('❌ Aucune condition ZR01 avec SAKN1 non vide trouvée');
                        console.log('\n' + 'ℹ️'.repeat(20));
                        console.log('AUCUNE REMISE APPLIQUÉE (remise = 0%)');
                        console.log('ℹ️'.repeat(20));
                        remiseZR01 = 0;
                    }
                }

                console.log('\n' + '✅'.repeat(20));
                console.log(`REMISE FINALE APPLIQUÉE : ${remiseZR01}%`);
                console.log('✅'.repeat(20));
            } catch (error) {
                console.error('Erreur lors de la recherche de la remise ZR01/ZREM:', error);
            }
        }

        // Récupération des conditions ZPR0 depuis la base de données pour obtenir le KMEIN correct
        let zpr0ConditionsDB = [];
        if (vbrkHeader && vbrkHeader.KNUMV) {
            try {
                zpr0ConditionsDB = await db.SapKomvCondition.findAll({
                    where: {
                        KNUMV: vbrkHeader.KNUMV,
                        KSCHL: 'ZPR0'
                    }
                });
                console.log('=== CONDITIONS ZPR0 DEPUIS LA BASE DE DONNÉES ===');
                console.log('Nombre de conditions ZPR0 trouvées:', zpr0ConditionsDB.length);
                zpr0ConditionsDB.forEach(cond => {
                    console.log(`  KPOSN: ${cond.KPOSN}, KBETR: ${cond.KBETR}, KMEIN: ${cond.KMEIN}`);
                });
            } catch (error) {
                console.error('Erreur lors de la récupération des conditions ZPR0:', error);
            }
        }

        perf('requêtes conditions KOMV en DB (TVA/MWAL/ZREM/ZR01/ZPR0)');

        // Préparation des lignes de facture avec les champs demandés
        let lignesFacture = result.XVBRP ? result.XVBRP.map(item => {
            // Recherche de la condition ZPR0 pour cette ligne dans les résultats de la DB
            const conditionZPRO_DB = zpr0ConditionsDB.find(c => c.KPOSN === item.POSNR);

            // Fallback sur result.XKOMV si pas trouvé dans la DB
            const conditionZPRO = conditionZPRO_DB || (result.XKOMV ?
                result.XKOMV.find(k => k.KPOSN === item.POSNR && k.KSCHL === 'ZPR0') : null);

            // Calcul des montants — quantité exprimée en PIÈCES (FKLMG = quantité en unité de stock)
            const quantite = item.FKLMG ? parseFloat(item.FKLMG) : 0;

            // Vérification de la condition de remise basée sur SAKN1
            let remiseZR01 = 0;
            if (result.XKOMV) {
                // Étape 1 : Chercher ZREM avec SAKN1 non vide pour cette ligne
                const conditionZREM = result.XKOMV.find(k =>
                    k.KPOSN === item.POSNR &&
                    k.KSCHL === 'ZREM' &&
                    k.SAKN1 &&
                    k.SAKN1.toString().trim() !== ''
                );

                if (conditionZREM) {
                    remiseZR01 = Math.abs(parseFloat(conditionZREM.KBETR) || 0) / 10;
                    console.log(`=== CONDITION ZREM AVEC SAKN1 NON VIDE TROUVÉE POUR LIGNE ${item.POSNR} ===`);
                    console.log('SAKN1:', conditionZREM.SAKN1);
                    console.log('Valeur brute de ZREM.KBETR:', conditionZREM.KBETR);
                    console.log('Valeur ajustée de remiseZR01:', remiseZR01);
                } else {
                    // Étape 2 : Chercher ZR01 avec SAKN1 non vide pour cette ligne
                    const conditionZR01 = result.XKOMV.find(k =>
                        k.KPOSN === item.POSNR &&
                        k.KSCHL === 'ZR01' &&
                        k.SAKN1 &&
                        k.SAKN1.toString().trim() !== ''
                    );

                    if (conditionZR01) {
                        remiseZR01 = Math.abs(parseFloat(conditionZR01.KBETR) || 0) / 10;
                        console.log(`=== CONDITION ZR01 AVEC SAKN1 NON VIDE TROUVÉE POUR LIGNE ${item.POSNR} ===`);
                        console.log('SAKN1:', conditionZR01.SAKN1);
                        console.log('Valeur brute de ZR01.KBETR:', conditionZR01.KBETR);
                        console.log('Valeur ajustée de remiseZR01:', remiseZR01);
                    } else {
                        // Aucune condition avec SAKN1 non vide trouvée
                        console.log(`=== AUCUNE REMISE APPLIQUÉE POUR LIGNE ${item.POSNR} (pas de SAKN1) ===`);
                        remiseZR01 = 0;
                    }
                }
            }

            // Calcul du PU_HT : Conditionnel selon KMEIN de la condition ZPR0 (depuis la DB)
            const kbetr = conditionZPRO && conditionZPRO.KBETR ? parseFloat(conditionZPRO.KBETR) : 0;
            const umvkz = item.UMVKZ ? parseFloat(item.UMVKZ) : 0;
            const kmein = conditionZPRO && conditionZPRO.KMEIN ? conditionZPRO.KMEIN.trim() : '';

            // Logs de débogage
            const uniteArticle = (item.VRKME || item.MEINS || '').trim();
            if (uniteArticle === 'KAR' || uniteArticle === 'ST') {
                console.log(`=== LIGNE ${item.POSNR} - ${item.MATNR} ===`);
                console.log('Unité article (VRKME/MEINS):', uniteArticle);
                console.log('Condition ZPR0 depuis DB:', !!conditionZPRO_DB);
                console.log('KMEIN depuis condition:', kmein);
                if (conditionZPRO) {
                    console.log('  KBETR:', conditionZPRO.KBETR);
                    console.log('  KBETR parsé:', kbetr);
                    console.log('  UMVKZ:', umvkz);
                }
            }

            // Calcul du prix par CARTON (logique historique conservée), puis conversion en prix par PIÈCE
            let prixCartonHT = 0;
            if (kmein === 'KAR') {
                // KBETR est par carton → ×1000 pour la convention SAP (frontend ÷10)
                prixCartonHT = kbetr * 1000;
                console.log(`  Formule KAR (KMEIN=${kmein}): ${kbetr} * 1000 = ${prixCartonHT} (par carton)`);
            } else if (kmein === 'ST') {
                // KBETR est par pièce, on multiplie par UMVKZ pour avoir le prix carton, puis ×1000
                prixCartonHT = kbetr * umvkz * 1000;
                console.log(`  Formule ST (KMEIN=${kmein}): ${kbetr} × ${umvkz} * 1000 = ${prixCartonHT} (par carton)`);
            } else {
                // Formule défaut (équivalent KBETR * UMVKZ * 10)
                prixCartonHT = (kbetr * umvkz) * 10;
                console.log(`  Formule défaut (unité=${uniteArticle}): (${kbetr} × ${umvkz}) * 10 = ${prixCartonHT} (par carton)`);
            }

            // Conversion par pièce : prix_par_pièce = prix_par_carton / UMVKZ
            // (cohérent avec la quantité exprimée en pièces FKLMG)
            const prixUnitaireHT = umvkz > 0 ? prixCartonHT / umvkz : prixCartonHT;
            console.log(`  → prix par pièce: ${prixCartonHT} / ${umvkz || 1} = ${prixUnitaireHT}`);

            // Calcul du montant brut: quantité * prixUnitaireHT
            const montantBrut = quantite * prixUnitaireHT;
            console.log(`\n=== LIGNE ${item.POSNR} - ${item.MATNR} ===`);
            console.log(`Prix unitaire HT: ${prixUnitaireHT}, Quantité: ${quantite}`);
            console.log(`Montant brut: ${montantBrut}`);

            // Calcul de la remise basée sur le pourcentage ZR01
            console.log(`\n=== CALCUL REMISE POUR LIGNE ${item.POSNR} ===`);
            console.log('Valeur de remiseZR01:', remiseZR01);
            console.log('Type de remiseZR01:', typeof remiseZR01);

            // Calcul du montant de la remise
            const montantRemise = montantBrut * (remiseZR01 / 100);
            const montantNet = montantBrut - montantRemise;

            console.log('Taux de remise appliqué:', remiseZR01 + '%');
            console.log('Montant brut:', montantBrut);
            console.log('Calcul de la remise:', `${montantBrut} * (${remiseZR01} / 100) = ${montantRemise}`);
            console.log('Montant de la remise:', montantRemise);
            console.log('Montant net après remise:', montantNet.toFixed(3));

            // Récupération du partenaire WE (Réceptionnaire)
            const receptPartner = (result.XVBPA && Array.isArray(result.XVBPA)) ?
                result.XVBPA.find(p => p.PARVW === 'WE') || {} : {};

            return {
                numeroFacture: vbrkHeader ? vbrkHeader.VBELN : item.VBELN || '', // Direct depuis sap_vbrk_header
                nomClient: vbrkHeader ? vbrkHeader.NAMRG : clientInfo.NAME1 || '', // Direct depuis sap_vbrk_header (NAMRG)
                clientEmail: clientInfo.EMAIL || '',
                clientPhone: clientInfo.TELF1 ? clientInfo.TELF1.toString().trim().replace(/\s+/g, '') : '', // Remove spaces from phone
                clientNCC: stcegValue ? stcegValue.toString().trim().replace(/\s+/g, '') : '', // Remove spaces from NCC
                reference: item.MATNR || '',
                designation: item.ARKTX || '',
                quantite: quantite, // FKLMG — quantité totale en pièces (utilisée pour montantBrut + quantity FNE)
                cts: item.FKIMG ? parseFloat(item.FKIMG) : 0, // CTS = quantité en cartons (FKIMG) — affichage uniquement
                cls: item.UMVKZ ? parseFloat(item.UMVKZ) : 0, // CLS = pièces par carton (UMVKZ) — affichage uniquement
                unite: item.MEINS || item.VRKME || '', // MEINS (unité de stock = pièces) en priorité
                prixUnitaireHT: prixUnitaireHT, // Prix par PIÈCE (cohérent avec quantite=FKLMG)
                montantBrut: montantBrut,
                montantNet: montantNet,
                remise: montantRemise,
                tva: tvaValue, // Utiliser la TVA depuis sap_komv_condition
                otherTaxName: mwalValue > 0 ? mwalValue.toString() : (conditionZPRO ? conditionZPRO.KTEXT : ''),
                // otherTaxPct must represent a percentage (AIRSI), not the unit price — use mwalValue (could be 0)
                otherTaxPct: mwalValue > 0 ? mwalValue : 0,
                remisePct: remiseZR01, // Utilisation de la valeur de remiseZR01
                commercialMessage: `Code Client: ${clientInfo.KUNNR || ''}\nFacture N°: ${vbrkHeader?.VBELN || item.VBELN || ''}\nBL: ${item.VGBEL || ''}\nCde: ${salesOrderReference}\nRecept.: ${receptPartner.NAME1 || ''}`,
                sellerName: vbrkHeader ? vbrkHeader.ERNAM : '',
                kunnr: clientInfo.KUNNR || '',
                bzirk: vbrkHeader ? (vbrkHeader.BZIRK || '').trim() : '',
                kdgrp: vbrkHeader ? (vbrkHeader.KDGRP || '').trim() : '',
                fkart: vbrkHeader ? (vbrkHeader.FKART || '').trim() : ''
            };

            // Debug: log otherTaxPct for this line
            console.log(`Ligne ${item.POSNR} - otherTaxPct (AIRSI %) = ${mwalValue > 0 ? mwalValue : 0}`);
        }) : [];

        console.log('=== LIGNES DE FACTURE ENVOYÉES AU FRONTEND ===');
        console.log('Nombre de lignes:', lignesFacture.length);
        if (lignesFacture.length > 0) {
            console.log('Première ligne:', lignesFacture[0]);
        }

        // Calcul des totaux de la facture à partir des lignes
        let totalHT = 0;
        let totalNetHT = 0;
        let montantRemiseTotal = 0;

        // Calculer les totaux à partir des lignes de facture
        console.log('=== CALCUL DES TOTAUX À PARTIR DES LIGNES DE FACTURE ===');
        lignesFacture.forEach((ligne, index) => {
            totalHT += ligne.montantBrut;
            totalNetHT += ligne.montantNet;
            console.log(`Ligne ${index + 1}: Brut=${ligne.montantBrut}, Net=${ligne.montantNet}`);
        });

        // Calculer la remise totale
        montantRemiseTotal = totalHT - totalNetHT;

        console.log('=== TOTAUX CALCULÉS ===');
        console.log('Total HT (somme montants bruts):', totalHT);
        console.log('Total Net HT (somme montants nets):', totalNetHT);
        console.log('Remise totale:', montantRemiseTotal);

        // Calcul du montant TVA
        const tvaRate = tvaValue ? parseFloat(tvaValue) : 0;
        const montantTVA = totalNetHT * tvaRate / 100;

        // Calcul du TOTAL TTC
        const totalTTC = totalNetHT + montantTVA;

        // Calcul du TOTAL A PAYER (avec AIRSI si existe)
        let totalAPayer = totalTTC;
        let montantAIRSI = 0;

        if (mwalValue > 0) {
            montantAIRSI = totalTTC * mwalValue / 100;
            totalAPayer = totalTTC + montantAIRSI;
        }

        // Préparer les données de taxes pour le tableau
        const taxData = [
            {
                typeTaxe: "TVA",
                baseTaxe: totalNetHT,
                taux: tvaRate,
                montant: montantTVA
            }
        ];

        if (mwalValue > 0) {
            taxData.push({
                typeTaxe: "AIRSI",
                baseTaxe: totalTTC,
                taux: mwalValue,
                montant: montantAIRSI
            });
        }

        console.log('=== CALCULS DES TOTAUX ===');
        console.log('TOTAL HT:', totalHT);
        console.log('TOTAL NET HT:', totalNetHT);
        console.log('MONTANT TVA:', montantTVA);
        console.log('TOTAL TTC:', totalTTC);
        console.log('MONTANT AIRSI:', montantAIRSI);
        console.log('TOTAL A PAYER:', totalAPayer);

        // Enregistrer les totaux en base
        try {
            await InvoiceTotals.destroy({ where: { numero_facture: invoiceNumber } });

            // Récupérer le point de vente (modification ou défaut)
            let pointOfSale = 'NPG_SIEGE_FACTURATION';
            try {
                const posMod = await db.InvoiceFieldModification.findOne({
                    where: { invoice_number: invoiceNumber, field_name: 'PointOfSale' },
                    order: [['id', 'DESC']],
                });
                if (posMod) pointOfSale = posMod.new_value;
            } catch (e) {}

            // Diviser par 10 pour stocker les mêmes montants que ceux affichés
            // (le frontend divise par 10 via formatMontant pour les factures SAP)
            await InvoiceTotals.create({
                numero_facture: invoiceNumber,
                point_of_sale: pointOfSale,
                total_ht: Math.round(totalHT / 10),
                total_net_ht: Math.round(totalNetHT / 10),
                montant_remise: Math.round(montantRemiseTotal / 10),
                tva_rate: tvaRate,
                montant_tva: Math.round(montantTVA / 10),
                total_ttc: Math.round(totalTTC / 10),
                airsi_rate: mwalValue > 0 ? mwalValue : 0,
                montant_airsi: Math.round(montantAIRSI / 10),
                total_a_payer: Math.round(totalAPayer / 10),
                source: 'sap',
            });
            console.log('Totaux enregistrés en base pour', invoiceNumber);
        } catch (dbErr) {
            console.error('Erreur enregistrement invoice_totals:', dbErr.message);
        }

        perf('enregistrement totaux (invoice_totals) + fin');
        console.log(`[PERF][${invoiceNumber}] ===> TOTAL téléchargement facture: ${Date.now() - _perfStart}ms`);

        return res.json({
            success: true,
            message: 'Facture récupérée depuis SAP et enregistrée en base',
            fne_marked: !!fneMarkText,
            fne_mark_text: fneMarkText || null,
            data: lignesFacture,
            totaux: {
                totalHT,
                totalNetHT,
                montantRemiseTotal,
                montantTVA,
                totalTTC,
                montantAIRSI,
                totalAPayer,
                taxData
            }
        });
    } catch (error) {
        console.error('Erreur lors de l\'appel à la BAPI RV_INVOICE_DOCUMENT_READ:');
        console.error('Type d\'erreur:', error && error.name);
        console.error('Message:', error && error.message);
        if (error && error.name === 'ABAPError') {
            console.error('Détails ABAP:');
            console.error('  key:', error.key);
            console.error('  abapMsgClass:', error.abapMsgClass);
            console.error('  abapMsgType:', error.abapMsgType);
            console.error('  abapMsgNumber:', error.abapMsgNumber);
            console.error('  abapMsgV1:', error.abapMsgV1);
            console.error('  abapMsgV2:', error.abapMsgV2);
            console.error('  abapMsgV3:', error.abapMsgV3);
            console.error('  abapMsgV4:', error.abapMsgV4);
        } else {
            console.error(error);
        }
        if (client) {
            try {
                await client.close();
            } catch (e) {
                console.error('Erreur lors de la fermeture de la connexion SAP:', e);
            }
        }
        return res.status(500).json({
            success: false,
            error: error.message || 'Erreur lors de la récupération du document de facture',
            details: error,
        });
    }
};

// Fonction pour lister les BAPI disponibles
const getBapiStructure = async (req, res) => {
    let client;
    try {
        const sapConfig = await getSapConfig();
        client = new Client(sapConfig);

        await client.connect();

        // Recherche de BAPI liées aux factures
        const searchPatterns = [
            '%INVOICE%',
            'BAPI_INVOICE%',
            'RV_INVOICE%',
            'BAPI_BILLING%',
            'BAPI_DOCUMENT%'
        ];

        let allFunctions = [];

        // Rechercher avec chaque motif
        for (const pattern of searchPatterns) {
            try {
                const result = await client.call('RFC_FUNCTION_SEARCH', {
                    FUNCNAME: pattern,
                    GROUPNAME: ''
                });

                if (result && result.FUNCTAB) {
                    allFunctions = [...allFunctions, ...result.FUNCTAB];
                }
            } catch (e) {
                console.warn(`Recherche échouée pour le motif ${pattern}:`, e.message);
            }
        }

        // Filtrer les doublons
        const uniqueFunctions = [];
        const seen = new Set();

        for (const func of allFunctions) {
            if (!seen.has(func.FUNCNAME)) {
                seen.add(func.FUNCNAME);
                uniqueFunctions.push(func);
            }
        }

        // Trier par nom
        uniqueFunctions.sort((a, b) => a.FUNCNAME.localeCompare(b.FUNCNAME));

        // Essayer d'obtenir la description de la BAPI BAPI_BILLINGDOC_GETDETAIL
        let bapiDetail = null;
        try {
            bapiDetail = await client.call('RFC_GET_FUNCTION_INTERFACE', {
                FUNCNAME: 'BAPI_BILLINGDOC_GETDETAIL',
                LANGUAGE: 'FR'
            });
        } catch (e) {
            console.warn('Impossible de récupérer les détails de BAPI_BILLINGDOC_GETDETAIL:', e.message);
        }

        return res.json({
            success: true,
            availableBapis: uniqueFunctions,
            bapiDetail: bapiDetail
        });

    } catch (error) {
        console.error('Erreur lors de la recherche des BAPI:', error);
        return res.status(500).json({
            success: false,
            error: 'Erreur lors de la recherche des BAPI',
            details: error.message
        });
    } finally {
        if (client) {
            try {
                await client.close();
            } catch (e) {
                console.error('Erreur lors de la fermeture de la connexion:', e);
            }
        }
    }
};

const getClientAddress = async (req, res) => {
    let client;
    try {
        const { kunnr } = req.params;
        if (!kunnr) {
            return res.status(400).json({
                success: false,
                error: 'Numéro de client (kunnr) manquant'
            });
        }

        // Formater le KUNNR (SAP attend souvent 10 caractères avec des zéros non significatifs)
        const formattedKunnr = kunnr.padStart(10, '0');

        const sapConfig = await getSapConfig();
        client = new Client(sapConfig);
        await client.connect();

        console.log(`=== Appel BAPI ZBAPI_ADRESSE_CLIENT pour le client ${formattedKunnr} ===`);

        const result = await client.call('ZBAPI_ADRESSE_CLIENT', {
            ZKUNNR: formattedKunnr
        });

        console.log('Résultat BAPI ZBAPI_ADRESSE_CLIENT:', result);

        if (client) {
            await client.close();
        }

        // Extraire l'objet de l'adresse (peut être retourné sous forme de table/tableau par SAP)
        const addressData = Array.isArray(result.ZZSTRUCT_ADRESSE_CLT)
            ? result.ZZSTRUCT_ADRESSE_CLT[0]
            : (result.ZZSTRUCT_ADRESSE_CLT || {});

        // Nettoyer le numéro de téléphone en supprimant les espaces
        if (addressData.TELF1) {
            addressData.TELF1 = addressData.TELF1.toString().trim().replace(/\s+/g, '');
        }

        // Enregistrer en base de données
        try {
            await SapAdresseClient.destroy({ where: { KUNNR: formattedKunnr } });
            const allAddresses = Array.isArray(result.ZZSTRUCT_ADRESSE_CLT)
                ? result.ZZSTRUCT_ADRESSE_CLT
                : [addressData];
            await SapAdresseClient.bulkCreate(allAddresses.map(addr => ({
                KUNNR: addr.KUNNR || formattedKunnr,
                ADRNR: addr.ADRNR || null,
                TELF1: addr.TELF1 ? addr.TELF1.toString().trim().replace(/\s+/g, '') : null,
                SMTP_ADDR: addr.SMTP_ADDR || null,
                ORT01: addr.ORT01 || null,
            })));
            console.log('ZBAPI_ADRESSE_CLIENT enregistré en base pour', formattedKunnr);
        } catch (dbErr) {
            console.error('Erreur enregistrement sap_adresse_client:', dbErr.message);
        }

        return res.json({
            success: true,
            data: addressData
        });
    } catch (error) {
        console.error('Erreur lors de l\'appel à ZBAPI_ADRESSE_CLIENT:', error);
        if (client) {
            try { await client.close(); } catch (e) { }
        }
        return res.status(500).json({
            success: false,
            error: error.message || 'Erreur lors de la récupération de l\'adresse client',
            details: error
        });
    }
};

const getInvoicesByDateRange = async (req, res) => {
    let client;
    try {
        const { startDate, endDate } = req.body;

        if (!startDate || !endDate) {
            return res.status(400).json({
                success: false,
                error: 'Plage de dates manquante (startDate et endDate requis)'
            });
        }

        // Formater les dates pour SAP (YYYYMMDD)
        const formatForSap = (dateStr) => dateStr.replace(/-/g, '');
        const sapStartDate = formatForSap(startDate);
        const sapEndDate = formatForSap(endDate);

        const sapConfig = await getSapConfig();
        client = new Client(sapConfig);
        await client.connect();

        console.log(`=== Recherche de factures SAP par plage de dates : ${sapStartDate} à ${sapEndDate} ===`);

        // Utilisation de RFC_READ_TABLE pour lire la table VBRK
        // On filtre par ERDAT (Date de création de l'enregistrement)
        const options = [
            { TEXT: `ERDAT GE '${sapStartDate}'` },
            { TEXT: ` AND ERDAT LE '${sapEndDate}'` }
        ];

        const result = await client.call('RFC_READ_TABLE', {
            QUERY_TABLE: 'VBRK',
            OPTIONS: options,
            FIELDS: [
                { FIELDNAME: 'VBELN' },
                { FIELDNAME: 'ERDAT' },
                { FIELDNAME: 'KUNRG' },
                { FIELDNAME: 'FKART' },
                { FIELDNAME: 'NETWR' },
                { FIELDNAME: 'WAERK' },
                { FIELDNAME: 'BZIRK' },
                { FIELDNAME: 'KDGRP' }
            ],
            ROWSKIPS: 0,
            ROWCOUNT: 500 // Limite à 500 résultats pour commencer
        });

        // Parser les résultats de RFC_READ_TABLE
        const data = result.DATA.map(row => {
            const values = row.WA.split('|'); // Le séparateur par défaut est souvent l'espace ou |, ici on suppose que node-rfc gère ça ou on demande un délimiteur
            // En fait RFC_READ_TABLE retourne souvent les champs collés si on ne précise pas DELIMITER
            return row.WA;
        });

        // Appel plus précis avec DELIMITER
        // ROWCOUNT augmenté à 5000 pour qu'une plage large retourne tous les types
        // (avec 500, les factures ZRE étaient parfois absentes si la période contenait beaucoup de ZF2)
        const resultWithDelimiter = await client.call('RFC_READ_TABLE', {
            QUERY_TABLE: 'VBRK',
            DELIMITER: '|',
            OPTIONS: options,
            FIELDS: [
                { FIELDNAME: 'VBELN' },
                { FIELDNAME: 'ERDAT' },
                { FIELDNAME: 'KUNRG' },
                { FIELDNAME: 'FKART' },
                { FIELDNAME: 'NETWR' },
                { FIELDNAME: 'WAERK' },
                { FIELDNAME: 'BZIRK' },
                { FIELDNAME: 'KDGRP' }
            ],
            ROWCOUNT: 5000
        });

        console.log(`RFC_READ_TABLE VBRK a retourné ${resultWithDelimiter.DATA.length} ligne(s). Si = ROWCOUNT, la période est peut-être tronquée.`);

        const parsedInvoices = resultWithDelimiter.DATA.map(row => {
            const fields = row.WA.split('|');
            return {
                numero: fields[0].trim(),
                date: fields[1].trim(),
                client: fields[2].trim(), // KUNRG
                type: fields[3].trim(),
                montant: (parseFloat(fields[4].trim()) * 100).toFixed(0),
                devise: fields[5].trim(),
                bzirk: fields[6] ? fields[6].trim() : '',
                kdgrp: fields[7] ? fields[7].trim() : ''
            };
        });

        console.log(`Nombre de factures trouvées : ${parsedInvoices.length}`);

        // Récupérer les noms des clients en vrac
        const uniqueClientIds = [...new Set(parsedInvoices.map(inv => inv.client))].filter(id => id.trim() !== '');

        if (uniqueClientIds.length > 0) {
            console.log(`Récupération des noms pour ${uniqueClientIds.length} clients...`);

            // Construire les options pour KNA1 (KUNNR IN (...))
            // RFC_READ_TABLE a des limites sur la longueur des options, on va les grouper si besoin
            // Mais pour une centaine de clients ça devrait passer
            const kna1Options = [{ TEXT: "KUNNR IN (" }];
            uniqueClientIds.forEach((id, index) => {
                const formattedId = id.padStart(10, '0'); // SAP numbers are often 10 chars
                kna1Options.push({ TEXT: `'${formattedId}'${index === uniqueClientIds.length - 1 ? "" : ","}` });
            });
            kna1Options.push({ TEXT: ")" });

            try {
                const clientNamesResult = await client.call('RFC_READ_TABLE', {
                    QUERY_TABLE: 'KNA1',
                    DELIMITER: '|',
                    OPTIONS: kna1Options,
                    FIELDS: [
                        { FIELDNAME: 'KUNNR' },
                        { FIELDNAME: 'NAME1' }
                    ]
                });

                const clientNamesMap = {};
                clientNamesResult.DATA.forEach(row => {
                    const fields = row.WA.split('|');
                    const knnr = fields[0].trim().replace(/^0+/, ''); // Enlever les zéros non significatifs
                    clientNamesMap[knnr] = fields[1].trim();
                });

                // Associer les noms aux factures
                parsedInvoices.forEach(inv => {
                    const cleanClientId = inv.client.replace(/^0+/, '');
                    inv.nomClient = clientNamesMap[cleanClientId] || 'N/A';
                });
            } catch (err) {
                console.error("Erreur lors de la récupération des noms clients:", err);
                // On continue même si les noms échouent
            }
        }

        return res.json({
            success: true,
            data: parsedInvoices
        });

    } catch (error) {
        console.error('Erreur lors de la recherche par plage de dates:', error);
        return res.status(500).json({
            success: false,
            error: error.message || 'Erreur lors de la recherche des factures SAP',
            details: error
        });
    } finally {
        if (client) {
            try { await client.close(); } catch (e) { }
        }
    }
};

/**
 * Résoudre un avoir SAP : trouver la facture initiale FNE et préparer le refund
 *
 * Flux :
 *   1. Lire VBRP (items avoir) → récupérer AUBEL (N° commande) + items (MATNR, FKIMG, NETWR)
 *   2. Lire VBRK (header avoir) → type, date, client, SFAKN (facture annulée)
 *   3. Chercher dans VBRK les factures normales liées à la même commande (AUBEL)
 *      ou directement via SFAKN si c'est un avoir d'annulation
 *   4. Trouver le fne_invoice_id en base pour la facture initiale
 *   5. Matcher les items de l'avoir avec les items FNE (par reference/MATNR)
 *   6. Retourner le payload prêt pour POST /{invoiceId}/refund
 */
const resolveAvoirSap = async (req, res) => {
    let client;
    try {
        const { numeroAvoir } = req.body;

        if (!numeroAvoir) {
            return res.status(400).json({
                success: false,
                error: 'Numéro d\'avoir SAP requis (numeroAvoir)'
            });
        }

        const vbeln = numeroAvoir.padStart(10, '0');
        console.log(`=== Résolution avoir SAP ${vbeln} ===`);

        const sapConfig = await getSapConfig();
        client = new Client(sapConfig);
        await client.connect();

        // ─── ÉTAPE 1 : Lire les items de l'avoir (VBRP) ───
        // FKIMG : quantité en unité de vente (cartons) → exposé en CTS
        // FKLMG : quantité en unité de stock (pièces)   → utilisée pour les quantités traitées
        // UMVKZ : coefficient pièces par carton          → exposé en CLS
        const vbrpResult = await client.call('RFC_READ_TABLE', {
            QUERY_TABLE: 'VBRP',
            DELIMITER: '|',
            OPTIONS: [{ TEXT: `VBELN = '${vbeln}'` }],
            FIELDS: [
                { FIELDNAME: 'VBELN' },
                { FIELDNAME: 'POSNR' },
                { FIELDNAME: 'AUBEL' },
                { FIELDNAME: 'VGBEL' },
                { FIELDNAME: 'MATNR' },
                { FIELDNAME: 'ARKTX' },
                { FIELDNAME: 'FKIMG' },
                { FIELDNAME: 'FKLMG' },
                { FIELDNAME: 'UMVKZ' },
                { FIELDNAME: 'NETWR' },
                { FIELDNAME: 'VRKME' },
                { FIELDNAME: 'MEINS' },
            ],
            ROWCOUNT: 100
        });

        const vbrpFields = vbrpResult.FIELDS.map(f => f.FIELDNAME);
        const avoirItems = (vbrpResult.DATA || []).map(row => {
            const values = row.WA.split('|');
            const record = {};
            vbrpFields.forEach((f, i) => record[f] = (values[i] || '').trim());
            return record;
        });

        if (avoirItems.length === 0) {
            if (client) await client.close();
            return res.status(404).json({
                success: false,
                error: `Aucun item trouvé dans VBRP pour l'avoir ${vbeln}`
            });
        }

        // Récupérer le N° de commande (AUBEL) depuis le premier item
        const salesOrderNumber = avoirItems.find(it => it.AUBEL && it.AUBEL.trim())?.AUBEL?.trim() || '';

        console.log(`Items avoir: ${avoirItems.length}, Commande (AUBEL): ${salesOrderNumber}`);

        // ─── ÉTAPE 2 : Lire le header de l'avoir (VBRK) ───
        const vbrkAvoirResult = await client.call('RFC_READ_TABLE', {
            QUERY_TABLE: 'VBRK',
            DELIMITER: '|',
            OPTIONS: [{ TEXT: `VBELN = '${vbeln}'` }],
            FIELDS: [
                { FIELDNAME: 'VBELN' },
                { FIELDNAME: 'FKART' },
                { FIELDNAME: 'FKDAT' },
                { FIELDNAME: 'KUNRG' },
                { FIELDNAME: 'NETWR' },
                { FIELDNAME: 'WAERK' },
                { FIELDNAME: 'SFAKN' },
            ],
            ROWCOUNT: 1
        });

        const vbrkFields = vbrkAvoirResult.FIELDS.map(f => f.FIELDNAME);
        let avoirHeader = {};
        if (vbrkAvoirResult.DATA && vbrkAvoirResult.DATA.length > 0) {
            const values = vbrkAvoirResult.DATA[0].WA.split('|');
            vbrkFields.forEach((f, i) => avoirHeader[f] = (values[i] || '').trim());
        }

        console.log('Header avoir:', avoirHeader);

        // ─── ÉTAPE 3 : Trouver la facture initiale ───
        // Stratégie 1 : SFAKN (facture annulée directement)
        // Stratégie 2 : BAPISDORDER_GETDETAILEDLIST → REF_DOC (facture référencée par la commande)
        // Stratégie 3 : Chercher dans VBRP les factures normales avec le même AUBEL
        // Stratégie 4 : Fallback par KUNRG (même client)
        let initialInvoiceNumber = '';

        if (avoirHeader.SFAKN && avoirHeader.SFAKN.trim()) {
            // Avoir d'annulation → SFAKN contient directement le N° de la facture annulée
            initialInvoiceNumber = avoirHeader.SFAKN.trim();
            console.log(`Facture initiale via SFAKN: ${initialInvoiceNumber}`);
        } else {
            // Stratégie 2 : Utiliser BAPISDORDER_GETDETAILEDLIST pour trouver REF_DOC
            if (salesOrderNumber) {
                try {
                    console.log(`Recherche facture initiale via BAPISDORDER_GETDETAILEDLIST (commande ${salesOrderNumber})...`);
                    const orderResult = await client.call('BAPISDORDER_GETDETAILEDLIST', {
                        I_BAPI_VIEW: { HEADER: 'X' },
                        SALES_DOCUMENTS: [
                            { VBELN: salesOrderNumber.padStart(10, '0') }
                        ]
                    });

                    if (orderResult.ORDER_HEADERS_OUT && orderResult.ORDER_HEADERS_OUT.length > 0) {
                        const refDoc = orderResult.ORDER_HEADERS_OUT[0].REF_DOC;
                        if (refDoc && refDoc.trim()) {
                            const refDocTrimmed = refDoc.trim();
                            console.log(`REF_DOC trouvé via BAPI: ${refDocTrimmed}`);
                            // La BAPI est la source autoritative : on utilise REF_DOC quoi qu'il arrive
                            // Vérifier d'abord si elle existe en FNE avec ou sans padding pour normaliser
                            const fneCheck = await FneInvoice.findOne({
                                where: { numero_facture: refDocTrimmed }
                            });
                            if (fneCheck) {
                                initialInvoiceNumber = refDocTrimmed;
                                console.log(`Facture initiale via REF_DOC+FNE: ${initialInvoiceNumber}`);
                            } else {
                                // Essayer avec padding à 10 chiffres pour la normalisation FNE
                                const refDocPadded = refDocTrimmed.padStart(10, '0');
                                const fneCheckPadded = await FneInvoice.findOne({
                                    where: { numero_facture: refDocPadded }
                                });
                                if (fneCheckPadded) {
                                    initialInvoiceNumber = refDocPadded;
                                    console.log(`Facture initiale via REF_DOC padded+FNE: ${initialInvoiceNumber}`);
                                } else {
                                    // Pas en FNE, mais BAPI est autoritative : on utilise quand même le REF_DOC
                                    // Le frontend proposera de la télécharger
                                    initialInvoiceNumber = refDocTrimmed;
                                    console.log(`REF_DOC ${refDocTrimmed} non trouvé en FNE — utilisation de la valeur BAPI (le frontend proposera téléchargement)`);
                                }
                            }
                        }
                    }
                } catch (bapiErr) {
                    console.warn('Erreur BAPISDORDER_GETDETAILEDLIST (non bloquant):', bapiErr.message);
                }
            }

            // Stratégie 3 : Fallback via AUBEL dans sap_vbrp_item local
            if (!initialInvoiceNumber && salesOrderNumber) {
                console.log('Recherche facture initiale via base locale (sap_vbrp_item.AUBEL)...');
                const linkedItems = await SapVbrpItem.findAll({
                    where: {
                        AUBEL: salesOrderNumber.padStart(10, '0'),
                        VBELN: { [Op.ne]: vbeln }
                    },
                    attributes: ['VBELN'],
                    group: ['VBELN'],
                    raw: true
                });

                const candidateNumbers = linkedItems.map(it => it.VBELN).filter(Boolean);
                console.log(`Factures candidates (même AUBEL ${salesOrderNumber}):`, candidateNumbers);

                // Vérifier laquelle existe dans FNE
                for (const num of candidateNumbers) {
                    const fneCheck = await FneInvoice.findOne({
                        where: { numero_facture: num }
                    });
                    if (fneCheck) {
                        initialInvoiceNumber = num;
                        console.log(`Facture initiale trouvée en base FNE: ${initialInvoiceNumber}`);
                        break;
                    }
                }

                // Si aucune n'est en FNE, prendre la première candidate
                if (!initialInvoiceNumber && candidateNumbers.length > 0) {
                    initialInvoiceNumber = candidateNumbers[0];
                    console.log(`Facture initiale (première candidate): ${initialInvoiceNumber}`);
                }
            }

            // Stratégie 4 (KUNRG / même client) : SUPPRIMÉE car trop permissive.
            // Elle pouvait associer un avoir à une facture aléatoire du même client
            // (ex: bug constaté sur 8700001855). Désormais si les stratégies 1/2/3
            // (toutes basées sur le numéro de commande SAP) échouent, on renvoie 404.
        }

        // Fermer la connexion SAP
        if (client) {
            try { await client.close(); } catch (e) { }
            client = null;
        }

        if (!initialInvoiceNumber) {
            return res.status(404).json({
                success: false,
                error: 'Impossible de trouver la facture initiale liée à cet avoir',
                avoir: {
                    numero: vbeln,
                    type: avoirHeader.FKART,
                    commande: salesOrderNumber,
                    items: avoirItems
                }
            });
        }

        // ─── Garde-fou : la facture initiale DOIT être téléchargée ───
        const downloadedInitial = await DownloadedInvoice.findOne({
            where: { numero: initialInvoiceNumber }
        });

        if (!downloadedInitial) {
            return res.status(409).json({
                success: false,
                error: 'INITIAL_NOT_DOWNLOADED',
                message: `Impossible de traiter l'avoir : la facture initiale ${initialInvoiceNumber} n'a pas été téléchargée.`,
                avoir: {
                    numero: vbeln,
                    type: avoirHeader.FKART,
                    factureInitiale: initialInvoiceNumber,
                    commande: salesOrderNumber
                }
            });
        }

        // ─── ÉTAPE 4 : Trouver le fne_invoice_id en base ───
        const fneInvoice = await FneInvoice.findOne({
            where: { numero_facture: initialInvoiceNumber },
            include: [{
                model: FneInvoiceItem,
                as: 'items',
                required: false
            }]
        });

        if (!fneInvoice) {
            return res.status(409).json({
                success: false,
                error: 'INITIAL_NOT_SENT',
                message: `Impossible de traiter l'avoir : la facture initiale ${initialInvoiceNumber} n'a pas encore été envoyée à la FNE.`,
                avoir: {
                    numero: vbeln,
                    type: avoirHeader.FKART,
                    factureInitiale: initialInvoiceNumber,
                    commande: salesOrderNumber
                }
            });
        }

        // ─── Garde-fou : log d'envoi FNE présent (= envoi réel, pas juste création d'entrée FneInvoice) ───
        const initialSendLog = await LogsAction.findOne({
            where: {
                numero_facture: initialInvoiceNumber,
                SendBy: { [Op.ne]: null },
                invoice_type: 'invoice'
            }
        });

        if (!initialSendLog) {
            return res.status(409).json({
                success: false,
                error: 'INITIAL_NOT_SENT',
                message: `Impossible de traiter l'avoir : aucun log d'envoi FNE trouvé pour la facture initiale ${initialInvoiceNumber}.`,
                avoir: {
                    numero: vbeln,
                    type: avoirHeader.FKART,
                    factureInitiale: initialInvoiceNumber,
                    commande: salesOrderNumber
                }
            });
        }

        // ─── ÉTAPE 5 : Matcher les items avoir ↔ items FNE ───
        const fneItems = fneInvoice.items || [];
        const matchedItems = [];

        // Récupérer les items SAP de la facture initiale (toutes les colonnes utiles
        // pour l'affichage côté frontend en cas de blocage).
        const initialVbeln = initialInvoiceNumber.padStart(10, '0');
        const initialVbrpItems = await SapVbrpItem.findAll({
            where: { VBELN: initialVbeln },
            attributes: ['POSNR', 'MATNR', 'ARKTX', 'FKIMG', 'FKLMG', 'UMVKZ', 'VRKME', 'MEINS', 'NETWR'],
            order: [['POSNR', 'ASC']],
            raw: true
        });
        const initialUnitByMatnr = {};
        for (const it of initialVbrpItems) {
            const key = (it.MATNR || '').replace(/^0+/, '').trim();
            if (key && !initialUnitByMatnr[key]) {
                initialUnitByMatnr[key] = {
                    VRKME: (it.VRKME || '').trim(),
                    MEINS: (it.MEINS || '').trim()
                };
            }
        }
        // Normalisation d'une désignation pour comparaison (trim, majuscules, espaces réduits).
        const normDesig = (s) => (s || '').toString().trim().toUpperCase().replace(/\s+/g, ' ');
        // Unités de la facture initiale indexées AUSSI par désignation : sert au fallback
        // "même désignation même si code différent".
        const initialUnitByDesig = {};
        for (const it of initialVbrpItems) {
            const dkey = normDesig(it.ARKTX);
            if (dkey && !initialUnitByDesig[dkey]) {
                initialUnitByDesig[dkey] = { VRKME: (it.VRKME || '').trim(), MEINS: (it.MEINS || '').trim() };
            }
        }
        // Snapshot des lignes de la facture initiale SAP — quantités en CARTONS (FKIMG)
        // (l'affichage des avoirs est en cartons, donc on aligne la facture initiale aussi)
        const initialSapItems = initialVbrpItems.map(it => ({
            posnr: it.POSNR,
            matnr: (it.MATNR || '').replace(/^0+/, '').trim(),
            description: it.ARKTX || '',
            quantity: Math.abs(parseFloat(it.FKIMG) || 0), // FKIMG = cartons
            cts: Math.abs(parseFloat(it.FKIMG) || 0),      // CTS = cartons (FKIMG)
            cls: Math.abs(parseFloat(it.UMVKZ) || 0),      // CLS = pièces par carton (UMVKZ)
            unit: (it.VRKME || it.MEINS || '').trim(),     // VRKME (unité de vente) en priorité
            netwr: it.NETWR,
        }));

        const effectiveUnit = (u) => ((u && u.VRKME) || (u && u.MEINS) || '').toString().trim().toUpperCase();

        console.log('=== MATCHING ITEMS ===');
        console.log('Items avoir:', avoirItems.map(it => ({ MATNR: it.MATNR, FKIMG: it.FKIMG, FKLMG: it.FKLMG, UMVKZ: it.UMVKZ, NETWR: it.NETWR, VRKME: it.VRKME, MEINS: it.MEINS })));
        console.log('Items FNE:', fneItems.map(fi => ({ id: fi.fne_item_id, reference: fi.reference, description: fi.description, quantity: fi.quantity })));
        console.log('Unités facture initiale (par MATNR):', initialUnitByMatnr);

        let hasUnitMismatch = false;
        const unmatchedAvoirItems = []; // articles de l'avoir absents de la facture initiale
        const allAvoirSapItems = [];    // toutes les lignes SAP de l'avoir (avec flag matched)

        for (const avoirItem of avoirItems) {
            const matnr = (avoirItem.MATNR || '').replace(/^0+/, '').trim();
            const avoirDesig = normDesig(avoirItem.ARKTX);

            // Matcher l'item FNE : par CODE (MATNR/reference) d'abord ; sinon par
            // DÉSIGNATION identique (même article, code différent → on accepte quand même).
            let matchedBy = 'code';
            let fneItem = fneItems.find(fi => (fi.reference || '').replace(/^0+/, '').trim() === matnr);
            if (!fneItem && avoirDesig) {
                fneItem = fneItems.find(fi => normDesig(fi.description) === avoirDesig);
                if (fneItem) matchedBy = 'designation';
            }

            // Quantité en PIÈCES (FKLMG) — comme la facture initiale (qui utilise FKLMG).
            // CTS=FKIMG (cartons) et CLS=UMVKZ (pièces/carton) restent informatifs.
            const avoirQtyPieces = Math.abs(parseFloat(avoirItem.FKLMG) || 0);
            const avoirCts        = Math.abs(parseFloat(avoirItem.FKIMG) || 0);
            const avoirCls        = Math.abs(parseFloat(avoirItem.UMVKZ) || 0);

            allAvoirSapItems.push({
                posnr: avoirItem.POSNR,
                matnr: matnr,
                matnr_raw: avoirItem.MATNR,
                description: avoirItem.ARKTX || '',
                quantity: avoirQtyPieces,                            // pièces (FKLMG)
                cts: avoirCts,
                cls: avoirCls,
                unit: (avoirItem.VRKME || avoirItem.MEINS || '').trim(), // VRKME-first (unité de vente / cartons)
                netwr: avoirItem.NETWR,
                matched: !!fneItem,
            });

            if (fneItem) {
                // Quantité à rembourser dans l'UNITÉ DE VENTE (VRKME) = FKIMG, car c'est
                // l'unité que la FNE stocke (facture initiale envoyée en unité de vente).
                // Bug corrigé : avant on prenait FKLMG (pièces), ce qui envoyait p.ex. 24
                // avec l'étiquette « carton » → 24 cartons au lieu de 1 carton.
                // (Vente en pièces : FKIMG = FKLMG, donc inchangé.)
                const qty = avoirCts; // = FKIMG (unité de vente)
                const avoirUnit = { VRKME: avoirItem.VRKME, MEINS: avoirItem.MEINS };
                // Unité de la facture initiale : par code si match code, sinon par désignation.
                const initialUnit = (matchedBy === 'code' ? initialUnitByMatnr[matnr] : initialUnitByDesig[avoirDesig])
                    || initialUnitByMatnr[matnr] || initialUnitByDesig[avoirDesig] || null;
                const avoirUnitEff = effectiveUnit(avoirUnit);
                const initialUnitEff = initialUnit ? effectiveUnit(initialUnit) : '';
                const unitMatch = initialUnitEff !== '' && avoirUnitEff === initialUnitEff;
                if (!unitMatch) hasUnitMismatch = true;

                matchedItems.push({
                    fne_item_id: fneItem.fne_item_id,
                    reference: fneItem.reference,
                    description: fneItem.description,
                    quantity_available: fneItem.quantity,
                    quantity_to_refund: qty,
                    cts: avoirCts,
                    cls: avoirCls,
                    avoir_matnr: avoirItem.MATNR,
                    avoir_netwr: avoirItem.NETWR,
                    avoir_unit: avoirUnitEff,
                    initial_unit: initialUnitEff,
                    unitMatch,
                    matchedBy,
                    unitReason: initialUnit ? null : 'INITIAL_UNIT_NOT_FOUND'
                });
                console.log(`MATCH (${matchedBy}): avoir MATNR=${matnr} "${avoirItem.ARKTX || ''}" → FNE ref=${fneItem.reference} (qty_cartons=${qty}, cts=${avoirCts}, cls=${avoirCls}) unités avoir=${avoirUnitEff} initiale=${initialUnitEff} match=${unitMatch}`);
            } else {
                unmatchedAvoirItems.push({
                    matnr: avoirItem.MATNR,
                    matnr_normalized: matnr,
                    description: avoirItem.ARKTX || '',
                    quantity: avoirQtyPieces,                            // pièces (FKLMG)
                    cts: avoirCts,
                    cls: avoirCls,
                    unit: (avoirItem.VRKME || avoirItem.MEINS || '').trim(),
                    netwr: avoirItem.NETWR,
                });
                console.log(`NO MATCH: avoir MATNR=${matnr} — aucun item FNE correspondant`);
            }
        }

        // ─── ÉTAPE 6 : Construire la réponse ───
        const refundPayload = {
            invoiceId: fneInvoice.fne_invoice_id,
            items: matchedItems
                .filter(it => it.quantity_to_refund > 0)
                .map(it => ({
                    id: it.fne_item_id,
                    quantity: Math.min(
                        Math.round(it.quantity_to_refund),
                        Math.round(it.quantity_available || it.quantity_to_refund)
                    )
                }))
        };

        // ─── BLOCAGE : si aucun article de l'avoir ne correspond à la facture initiale,
        //              ou si certains articles de l'avoir sont absents de la facture initiale,
        //              l'avoir est incohérent côté SAP — on refuse le traitement. ───
        if (matchedItems.length === 0 || unmatchedAvoirItems.length > 0) {
            const initialItemsSummary = fneItems.map(fi => ({
                reference: fi.reference,
                description: fi.description,
                quantity: fi.quantity,
            }));
            // Les références non matchées restent disponibles dans unmatchedAvoirItems pour
            // l'affichage détaillé côté UI, mais on ne les énumère plus dans le motif
            // (potentiellement très long si beaucoup d'articles).
            const missingCount = unmatchedAvoirItems.length;
            const blockedReason = missingCount > 0
                ? `Les articles de l'avoir ${vbeln} (${missingCount} ligne${missingCount > 1 ? 's' : ''}) sont manquants dans la facture initiale ${initialInvoiceNumber}. L'avoir ne peut pas être traité tant que cette incohérence n'est pas corrigée côté SAP.`
                : `Aucun article de l'avoir ${vbeln} ne correspond aux articles de la facture initiale ${initialInvoiceNumber}. L'avoir ne peut pas être traité.`;
            console.warn(`[Avoir ${vbeln}] BLOCAGE — ${matchedItems.length}/${avoirItems.length} articles matchés, ${unmatchedAvoirItems.length} non matchés`);

            // Notification mail (fire-and-forget) — n'impacte pas la réponse API
            notifyAvoirBlocked({
                avoir: {
                    numero: vbeln,
                    type: avoirHeader.FKART,
                    date: avoirHeader.FKDAT,
                    client: avoirHeader.KUNRG,
                    montant: avoirHeader.NETWR,
                    devise: avoirHeader.WAERK,
                    commande: salesOrderNumber,
                    factureAnnulee: avoirHeader.SFAKN || null
                },
                factureInitiale: {
                    numero: initialInvoiceNumber,
                    fne_invoice_id: fneInvoice.fne_invoice_id,
                    fne_reference: fneInvoice.fne_reference,
                },
                unmatchedAvoirItems,
                avoirSapItems: allAvoirSapItems,
                initialSapItems: initialSapItems,
                matchedItemsCount: matchedItems.length,
                totalAvoirItemsCount: avoirItems.length,
                blockedReason,
                triggeredBy: req.body?.username || req.user?.username || ''
            }).catch(err => {
                console.error(`[Avoir ${vbeln}] Erreur notification blocage (ignorée) :`, err?.message || err);
            });

            return res.status(409).json({
                success: false,
                error: 'NO_MATCHING_ITEMS',
                message: blockedReason,
                avoir: {
                    numero: vbeln,
                    type: avoirHeader.FKART,
                    date: avoirHeader.FKDAT,
                    client: avoirHeader.KUNRG,
                    montant: avoirHeader.NETWR,
                    devise: avoirHeader.WAERK,
                    commande: salesOrderNumber,
                    factureInitiale: initialInvoiceNumber,
                    factureAnnulee: avoirHeader.SFAKN || null
                },
                factureInitiale: {
                    numero: initialInvoiceNumber,
                    fne_invoice_id: fneInvoice.fne_invoice_id,
                    fne_reference: fneInvoice.fne_reference,
                },
                unmatchedAvoirItems,
                initialItems: initialItemsSummary,
                // Tableaux complets prêts à afficher côté frontend
                avoirSapItems: allAvoirSapItems,        // toutes les lignes de l'avoir SAP
                initialSapItems: initialSapItems,       // toutes les lignes de la facture initiale SAP
                matchedItemsCount: matchedItems.length,
                totalAvoirItemsCount: avoirItems.length,
            });
        }

        // ─── BLOCAGE UNIT_MISMATCH : l'avoir et la facture initiale doivent partager la même unité
        //     sur chaque article (sinon les quantités refundées ne sont pas comparables). ───
        if (hasUnitMismatch) {
            const unitMismatchItems = matchedItems
                .filter(it => !it.unitMatch)
                .map(it => ({
                    matnr: it.avoir_matnr,
                    matnr_normalized: (it.reference || '').toString().replace(/^0+/, '').trim(),
                    description: it.description || '',
                    quantity: it.quantity_to_refund,
                    avoir_unit: it.avoir_unit || '',
                    initial_unit: it.initial_unit || '',
                    reason: it.unitReason || 'UNIT_DIFFERS',
                }));

            const blockedReason = `L'avoir ${vbeln} et la facture initiale ${initialInvoiceNumber} ont des unités différentes sur ${unitMismatchItems.length} article(s). L'avoir ne peut pas être traité tant que cette incohérence n'est pas corrigée côté SAP.`;
            console.warn(`[Avoir ${vbeln}] BLOCAGE UNIT_MISMATCH — ${unitMismatchItems.length} article(s) avec unités divergentes`);

            // Notification mail (fire-and-forget)
            notifyAvoirBlocked({
                avoir: {
                    numero: vbeln,
                    type: avoirHeader.FKART,
                    date: avoirHeader.FKDAT,
                    client: avoirHeader.KUNRG,
                    montant: avoirHeader.NETWR,
                    devise: avoirHeader.WAERK,
                    commande: salesOrderNumber,
                    factureAnnulee: avoirHeader.SFAKN || null
                },
                factureInitiale: {
                    numero: initialInvoiceNumber,
                    fne_invoice_id: fneInvoice.fne_invoice_id,
                    fne_reference: fneInvoice.fne_reference,
                },
                unitMismatchItems,
                avoirSapItems: allAvoirSapItems,
                initialSapItems,
                matchedItemsCount: matchedItems.length,
                totalAvoirItemsCount: avoirItems.length,
                blockedReason,
                blockedKind: 'UNIT_MISMATCH',
                triggeredBy: req.body?.username || req.user?.username || ''
            }).catch(err => {
                console.error(`[Avoir ${vbeln}] Erreur notification UNIT_MISMATCH (ignorée) :`, err?.message || err);
            });

            return res.status(409).json({
                success: false,
                error: 'UNIT_MISMATCH',
                message: blockedReason,
                avoir: {
                    numero: vbeln,
                    type: avoirHeader.FKART,
                    date: avoirHeader.FKDAT,
                    client: avoirHeader.KUNRG,
                    montant: avoirHeader.NETWR,
                    devise: avoirHeader.WAERK,
                    commande: salesOrderNumber,
                    factureInitiale: initialInvoiceNumber,
                    factureAnnulee: avoirHeader.SFAKN || null
                },
                factureInitiale: {
                    numero: initialInvoiceNumber,
                    fne_invoice_id: fneInvoice.fne_invoice_id,
                    fne_reference: fneInvoice.fne_reference,
                },
                unitMismatchItems,
                avoirSapItems: allAvoirSapItems,
                initialSapItems,
                matchedItemsCount: matchedItems.length,
                totalAvoirItemsCount: avoirItems.length,
            });
        }

        console.log('=== Résolution avoir terminée ===');
        console.log('Payload refund:', JSON.stringify(refundPayload, null, 2));

        return res.json({
            success: true,
            message: `Avoir ${vbeln} résolu → facture initiale ${initialInvoiceNumber}`,
            avoir: {
                numero: vbeln,
                type: avoirHeader.FKART,
                date: avoirHeader.FKDAT,
                client: avoirHeader.KUNRG,
                montant: avoirHeader.NETWR,
                devise: avoirHeader.WAERK,
                commande: salesOrderNumber,
                factureAnnulee: avoirHeader.SFAKN || null
            },
            factureInitiale: {
                numero: initialInvoiceNumber,
                fne_invoice_id: fneInvoice.fne_invoice_id,
                fne_reference: fneInvoice.fne_reference,
            },
            matchedItems,
            refundPayload,
            hasUnitMismatch
        });

    } catch (error) {
        console.error('Erreur lors de la résolution de l\'avoir SAP:', error);
        return res.status(500).json({
            success: false,
            error: error.message || 'Erreur lors de la résolution de l\'avoir SAP',
            details: error
        });
    } finally {
        if (client) {
            try { await client.close(); } catch (e) { }
        }
    }
};

module.exports = {
    getInvoiceDocument,
    getBapiStructure,
    getClientAddress,
    getInvoicesByDateRange,
    resolveAvoirSap
};
