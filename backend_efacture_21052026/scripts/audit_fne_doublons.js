/**
 * Audit : factures envoyées en DOUBLE à la FNE.
 *
 * Détecte toutes les factures dont le numero_facture SAP apparaît plusieurs fois
 * dans fne_invoices (= plusieurs signatures FNE distinctes, chacune avec son propre
 * fne_invoice_id) ou dans logs_actions (plusieurs envois réussis).
 *
 * Catégories :
 *   - SAME_REFERENCE       : la FNE a retourné exactement la même fne_reference
 *     pour les N envois  → doublon d'appel idempotent côté FNE (probablement bénin).
 *   - DIFFERENT_REFERENCE  : la FNE a retourné des fne_reference DIFFÉRENTES
 *     → deux stickers fiscaux consommés pour la même facture SAP (GRAVE).
 *   - MIXED                : un mélange (certains envois avec référence, d'autres sans).
 *
 * Sortie :
 *   - Résumé console
 *   - CSV détaillé (BOM UTF-8, séparateur ;) ouvrable direct dans Excel.
 *     Une ligne par envoi (plusieurs lignes par facture doublon).
 *
 * Usage :
 *   node scripts/audit_fne_doublons.js
 *   node scripts/audit_fne_doublons.js --since=2025-01-01 --until=2025-12-31
 *   node scripts/audit_fne_doublons.js --only=DIFFERENT_REFERENCE
 *   node scripts/audit_fne_doublons.js --csv=./doublons.csv
 */

const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

const DB_CONFIG = {
    host: '10.10.2.17',
    user: 'connectdb',
    password: 'c0n3!@#2030',
    database: 'npg_efacture',
    port: 3306,
    dateStrings: true,
};

function parseArgs(argv) {
    const args = { since: null, until: null, csv: null, only: null };
    for (const a of argv.slice(2)) {
        const [k, v] = a.replace(/^--/, '').split('=');
        if (k === 'since') args.since = v;
        else if (k === 'until') args.until = v;
        else if (k === 'csv') args.csv = v;
        else if (k === 'only') args.only = v.split(',').map(s => s.trim().toUpperCase()).filter(Boolean);
    }
    if (!args.csv) {
        const ts = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
        args.csv = path.join(__dirname, `audit_fne_doublons_${ts}.csv`);
    }
    return args;
}

function safeJsonParse(raw) {
    if (!raw) return null;
    if (typeof raw === 'object') return raw;
    try { return JSON.parse(raw); } catch { return null; }
}

function isBlank(v) {
    if (v === null || v === undefined) return true;
    return String(v).trim() === '';
}

function toCsvRow(values) {
    return values.map(v => {
        const s = v === null || v === undefined ? '' : String(v);
        return /[",;\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    }).join(';');
}

function categorize(attempts) {
    const refs = attempts.map(a => a.fne_reference).filter(r => !isBlank(r));
    const distinct = [...new Set(refs)];

    if (refs.length === 0) return 'NO_REFERENCE';
    if (refs.length < attempts.length) return 'MIXED';
    if (distinct.length === 1) return 'SAME_REFERENCE';
    return 'DIFFERENT_REFERENCE';
}

async function main() {
    const args = parseArgs(process.argv);
    console.log('=== Audit FNE — factures envoyées en DOUBLE ===');
    console.log(`DB    : ${DB_CONFIG.user}@${DB_CONFIG.host}:${DB_CONFIG.port}/${DB_CONFIG.database}`);
    if (args.since) console.log(`Depuis  : ${args.since}`);
    if (args.until) console.log(`Jusqu'à : ${args.until}`);
    if (args.only)  console.log(`Filtres : ${args.only.join(', ')}`);

    const conn = await mysql.createConnection(DB_CONFIG);

    // ─── Étape 1 : trouver les numero_facture présents >1 fois dans fne_invoices ───
    const dateFilter = [];
    const dateParams = [];
    if (args.since) { dateFilter.push('fi.created_at >= ?'); dateParams.push(args.since + ' 00:00:00'); }
    if (args.until) { dateFilter.push('fi.created_at <= ?'); dateParams.push(args.until + ' 23:59:59'); }
    const dateWhere = dateFilter.length > 0 ? 'WHERE ' + dateFilter.join(' AND ') : '';

    console.log('\nRecherche des doublons dans fne_invoices...');
    const [dupRows] = await conn.query(
        `SELECT numero_facture, COUNT(*) AS nb
         FROM fne_invoices fi
         ${dateWhere}
         GROUP BY numero_facture
         HAVING nb > 1
         ORDER BY nb DESC, numero_facture ASC`,
        dateParams,
    );
    console.log(`${dupRows.length} factures SAP avec >1 entrée dans fne_invoices.`);

    // ─── Étape 2 : aussi détecter les doublons via logs_actions (au cas où fne_invoices
    //     n'aurait enregistré qu'une seule version mais que les logs en montrent plusieurs) ───
    const [logDupRows] = await conn.query(
        `SELECT numero_facture, COUNT(*) AS nb
         FROM logs_actions
         WHERE SendBy IS NOT NULL
           AND COALESCE(invoice_type, 'invoice') = 'invoice'
           ${args.since ? `AND SendOn >= '${args.since} 00:00:00'` : ''}
           ${args.until ? `AND SendOn <= '${args.until} 23:59:59'` : ''}
         GROUP BY numero_facture
         HAVING nb > 1`,
    );
    console.log(`${logDupRows.length} factures SAP avec >1 envoi dans logs_actions.`);

    const dupNumbers = [...new Set([
        ...dupRows.map(r => r.numero_facture),
        ...logDupRows.map(r => r.numero_facture),
    ])];

    if (dupNumbers.length === 0) {
        console.log('\nAucun doublon détecté.');
        await conn.end();
        return;
    }

    // ─── Étape 3 : charger tous les détails (fne_invoices + logs_actions) ───
    const [fneRows] = await conn.query(
        `SELECT numero_facture, fne_invoice_id, fne_reference, fne_ncc, created_at, api_response
         FROM fne_invoices
         WHERE numero_facture IN (?)
         ORDER BY numero_facture, created_at ASC`,
        [dupNumbers],
    );

    const [logRows] = await conn.query(
        `SELECT id AS log_id, numero_facture, SendBy, SendOn, api_response, invoice_type
         FROM logs_actions
         WHERE numero_facture IN (?)
           AND SendBy IS NOT NULL
           AND COALESCE(invoice_type, 'invoice') = 'invoice'
         ORDER BY numero_facture, SendOn ASC`,
        [dupNumbers],
    );

    // Indexer par numero_facture
    const fneByNumero = {};
    for (const r of fneRows) {
        if (!fneByNumero[r.numero_facture]) fneByNumero[r.numero_facture] = [];
        fneByNumero[r.numero_facture].push(r);
    }
    const logsByNumero = {};
    for (const r of logRows) {
        if (!logsByNumero[r.numero_facture]) logsByNumero[r.numero_facture] = [];
        logsByNumero[r.numero_facture].push(r);
    }

    // ─── Étape 4 : fusionner en "tentatives" unifiées par numero_facture ───
    const groups = [];

    for (const numero of dupNumbers) {
        const fneEntries = fneByNumero[numero] || [];
        const logEntries = logsByNumero[numero] || [];

        // Une "tentative" = un envoi = un log SendBy ou, à défaut, une entrée fne_invoices
        const attempts = [];

        for (const log of logEntries) {
            const resp = safeJsonParse(log.api_response) || {};
            // Relier le log à l'entrée fne_invoices la plus proche par date
            const matchingFne = fneEntries.find(fi =>
                fi.fne_invoice_id && (
                    resp.invoice?.id === fi.fne_invoice_id ||
                    resp.id === fi.fne_invoice_id ||
                    resp.response?.invoice?.id === fi.fne_invoice_id
                )
            );

            attempts.push({
                log_id: log.log_id,
                send_date: log.SendOn,
                send_by: log.SendBy,
                success: resp.success !== false,
                fne_invoice_id: matchingFne?.fne_invoice_id || resp.invoice?.id || resp.id || null,
                fne_reference: matchingFne?.fne_reference || resp.reference || resp.invoice?.reference || null,
                fne_ncc: matchingFne?.fne_ncc || resp.ncc || null,
                is_manual: resp.is_manual === true || !!resp.manual_reference,
                error_message: resp.success === false ? (resp.error || resp.message || '') : '',
            });
        }

        // Si fne_invoices a plus d'entrées que les logs (désync), ajouter les orphelines
        const coveredFneIds = new Set(attempts.map(a => a.fne_invoice_id).filter(Boolean));
        for (const fi of fneEntries) {
            if (!coveredFneIds.has(fi.fne_invoice_id)) {
                attempts.push({
                    log_id: null,
                    send_date: fi.created_at,
                    send_by: '(pas de log)',
                    success: true,
                    fne_invoice_id: fi.fne_invoice_id,
                    fne_reference: fi.fne_reference,
                    fne_ncc: fi.fne_ncc,
                    is_manual: false,
                    error_message: '',
                });
            }
        }

        if (attempts.length < 2) continue;

        const category = categorize(attempts);
        groups.push({ numero_facture: numero, attempts, category });
    }

    // ─── Étape 5 : synthèse ───
    const counts = {
        SAME_REFERENCE: 0,
        DIFFERENT_REFERENCE: 0,
        MIXED: 0,
        NO_REFERENCE: 0,
    };
    for (const g of groups) counts[g.category]++;

    console.log('\n=== Résumé ===');
    console.log(`Factures en doublon analysées : ${groups.length}`);
    console.log('---');
    console.log(`  SAME_REFERENCE       (idempotent, bénin)      : ${counts.SAME_REFERENCE}`);
    console.log(`  DIFFERENT_REFERENCE  (DOUBLE CERTIFICATION)   : ${counts.DIFFERENT_REFERENCE}`);
    console.log(`  MIXED                (partiel)                : ${counts.MIXED}`);
    console.log(`  NO_REFERENCE         (tous envois sans réf)   : ${counts.NO_REFERENCE}`);

    // ─── Étape 6 : CSV ───
    const filtered = args.only
        ? groups.filter(g => args.only.includes(g.category))
        : groups;

    const header = [
        'numero_facture', 'categorie', 'nb_envois',
        'envoi_num', 'send_date', 'send_by',
        'success', 'fne_invoice_id', 'fne_reference', 'fne_ncc',
        'is_manual', 'error_message',
    ];
    const lines = [toCsvRow(header)];

    for (const g of filtered) {
        g.attempts.forEach((a, idx) => {
            lines.push(toCsvRow([
                g.numero_facture,
                g.category,
                g.attempts.length,
                idx + 1,
                a.send_date,
                a.send_by,
                a.success ? 'OK' : 'FAIL',
                a.fne_invoice_id || '',
                a.fne_reference || '',
                a.fne_ncc || '',
                a.is_manual ? 'oui' : 'non',
                a.error_message || '',
            ]));
        });
    }

    fs.writeFileSync(args.csv, '\uFEFF' + lines.join('\r\n'), 'utf8');
    console.log(`\nCSV écrit : ${args.csv}`);
    console.log(`Lignes exportées : ${lines.length - 1} (en-tête non comptée)`);

    if (counts.DIFFERENT_REFERENCE > 0) {
        console.log(`\n⚠  ${counts.DIFFERENT_REFERENCE} facture(s) ont CONSOMMÉ PLUSIEURS STICKERS FISCAUX.`);
        console.log('   À traiter en priorité — vérifier avec la DGI et annuler les doublons.');
    }

    await conn.end();
}

main().catch(err => {
    console.error('Erreur audit doublons:', err);
    process.exit(1);
});
