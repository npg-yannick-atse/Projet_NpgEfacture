/**
 * Audit des factures envoyées à la FNE avec informations incomplètes.
 *
 * Détecte, pour chaque facture envoyée à la FNE :
 *   - point_of_sale = NPG (valeur générique au lieu d'un vrai PDV)
 *   - point_of_sale manquant
 *   - NCC client manquant
 *   - Email client manquant
 *   - Téléphone client manquant
 *   - Nom/raison sociale client manquant
 *   - Référence FNE manquante
 *
 * Usage :
 *   node scripts/audit_fne_incomplets.js
 *   node scripts/audit_fne_incomplets.js --since=2025-01-01 --until=2025-12-31
 *   node scripts/audit_fne_incomplets.js --csv=./audit_fne.csv
 *   node scripts/audit_fne_incomplets.js --only=email,pos_npg
 *
 * Sortie :
 *   - Résumé console (compteurs par type de problème)
 *   - Fichier CSV détaillé (une ligne par facture problématique)
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
        else if (k === 'only') args.only = v.split(',').map(s => s.trim()).filter(Boolean);
    }
    if (!args.csv) {
        const ts = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
        args.csv = path.join(__dirname, `audit_fne_incomplets_${ts}.csv`);
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
    const s = String(v).trim();
    return s === '' || s.toLowerCase() === 'null' || s.toLowerCase() === 'n/a' || s === '-';
}

function firstNonBlank(...vals) {
    for (const v of vals) if (!isBlank(v)) return v;
    return null;
}

function extractPointOfSale(dlData, apiResponse, mods) {
    if (!isBlank(mods?.PointOfSale)) return String(mods.PointOfSale);
    const rows = Array.isArray(dlData) ? dlData : (dlData ? [dlData] : []);
    for (const r of rows) {
        const p = r?.point_of_sale || r?.PointOfSale || r?.pointOfSale || r?.POS || r?.pos;
        if (!isBlank(p)) return String(p);
    }
    const p2 = apiResponse?.point_of_sale || apiResponse?.pointOfSale || apiResponse?.pos;
    if (!isBlank(p2)) return String(p2);
    return null;
}

function extractClientFields(dlData, apiResponse, mods, sapAdr, dlClient, vbrkNamrg) {
    const rows = Array.isArray(dlData) ? dlData : (dlData ? [dlData] : []);
    const first = rows[0] || {};
    const email = firstNonBlank(
        mods?.ClientEmail,
        first.client_email, first.clientEmail,
        apiResponse?.clientEmail, apiResponse?.client_email,
        sapAdr?.SMTP_ADDR,
    );
    const phone = firstNonBlank(
        mods?.ClientPhone,
        first.client_phone, first.clientPhone,
        apiResponse?.clientPhone, apiResponse?.client_phone,
        sapAdr?.TELF1,
    );
    const ncc = firstNonBlank(
        first.client_ncc, first.clientNcc, first.clientNCC,
        apiResponse?.clientNcc, apiResponse?.ncc,
    );
    const name = firstNonBlank(
        first.client_name, first.clientName,
        apiResponse?.clientCompanyName, apiResponse?.nomClient,
        vbrkNamrg,
        dlClient && dlClient !== 'Client inconnu' ? dlClient : null,
    );
    return { email, phone, ncc, name };
}

function extractTemplate(dlData, apiResponse, mods) {
    const t = firstNonBlank(
        mods?.Template,
        apiResponse?.template,
    );
    if (!isBlank(t)) return String(t).toUpperCase();
    const rows = Array.isArray(dlData) ? dlData : (dlData ? [dlData] : []);
    for (const r of rows) {
        const v = r?.template || r?.Template;
        if (!isBlank(v)) return String(v).toUpperCase();
    }
    return null;
}

function analyzeInvoice(row, modsByInvoice, sapAdrByKunnr) {
    const apiResp = safeJsonParse(row.log_api_response) || safeJsonParse(row.fne_api_response) || {};
    const dlData = safeJsonParse(row.dl_data);
    const mods = modsByInvoice[row.numero_facture] || {};

    const rows = Array.isArray(dlData) ? dlData : (dlData ? [dlData] : []);
    const first = rows[0] || {};
    const kunnr = first.kunnr || first.KUNNR || row.vbrk_kunag || null;
    const sapAdr = kunnr ? sapAdrByKunnr[String(kunnr).replace(/^0+/, '')] || sapAdrByKunnr[kunnr] : null;

    const pos = extractPointOfSale(dlData, apiResp, mods);
    const { email, phone, ncc: ncc_src, name } = extractClientFields(
        dlData, apiResp, mods, sapAdr, row.dl_client, row.vbrk_namrg,
    );
    const ncc = row.fne_ncc || ncc_src;
    const template = extractTemplate(dlData, apiResp, mods);

    const issues = [];
    if (isBlank(pos)) {
        issues.push('pos_missing');
    } else if (pos.toUpperCase() === 'NPG') {
        issues.push('pos_npg');
    }
    // Règles FNE officielles : email, phone, name, POS toujours obligatoires (tous templates)
    if (isBlank(email)) issues.push('email_missing');
    if (isBlank(phone)) issues.push('phone_missing');
    if (isBlank(name)) issues.push('client_name_missing');
    // NCC obligatoire uniquement pour B2B
    if (template === 'B2B' && isBlank(ncc)) issues.push('ncc_missing_b2b');
    if (isBlank(row.fne_reference)) issues.push('fne_reference_missing');

    return {
        numero_facture: row.numero_facture,
        fne_reference: row.fne_reference || '',
        fne_invoice_id: row.fne_invoice_id || '',
        send_date: row.SendOn || '',
        sent_by: row.SendBy || '',
        invoice_type: row.invoice_type || 'invoice',
        template: template || '',
        point_of_sale: pos || '',
        client_name: name || '',
        client_email: email || '',
        client_phone: phone || '',
        client_ncc: ncc || '',
        issues,
    };
}

function toCsvRow(values) {
    return values.map(v => {
        const s = v === null || v === undefined ? '' : String(v);
        return /[",;\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    }).join(';');
}

async function main() {
    const args = parseArgs(process.argv);
    console.log('=== Audit FNE - factures avec informations incomplètes ===');
    console.log(`DB    : ${DB_CONFIG.user}@${DB_CONFIG.host}:${DB_CONFIG.port}/${DB_CONFIG.database}`);
    if (args.since) console.log(`Depuis: ${args.since}`);
    if (args.until) console.log(`Jusqu'à: ${args.until}`);
    if (args.only)  console.log(`Filtres: ${args.only.join(', ')}`);

    const conn = await mysql.createConnection(DB_CONFIG);

    const where = ['la.SendBy IS NOT NULL', "COALESCE(la.invoice_type, 'invoice') = 'invoice'"];
    const params = [];
    if (args.since) { where.push('la.SendOn >= ?'); params.push(args.since + ' 00:00:00'); }
    if (args.until) { where.push('la.SendOn <= ?'); params.push(args.until + ' 23:59:59'); }

    const sql = `
        SELECT
            la.id              AS log_id,
            la.numero_facture  AS numero_facture,
            la.SendBy          AS SendBy,
            la.SendOn          AS SendOn,
            la.invoice_type    AS invoice_type,
            la.api_response    AS log_api_response,
            fi.fne_invoice_id  AS fne_invoice_id,
            fi.fne_reference   AS fne_reference,
            fi.fne_ncc         AS fne_ncc,
            fi.api_response    AS fne_api_response,
            di.data            AS dl_data,
            di.client          AS dl_client,
            vh.NAMRG           AS vbrk_namrg,
            vh.KUNAG           AS vbrk_kunag
        FROM logs_actions la
        LEFT JOIN fne_invoices fi
               ON fi.numero_facture = la.numero_facture
        LEFT JOIN downloaded_invoices di
               ON di.numero = la.numero_facture
        LEFT JOIN sap_vbrk_header vh
               ON vh.VBELN = la.numero_facture
        WHERE ${where.join(' AND ')}
        ORDER BY la.SendOn DESC
    `;

    console.log('\nRequête principale...');
    const [rows] = await conn.query(sql, params);
    console.log(`${rows.length} factures envoyées trouvées.`);

    const invoiceNumbers = [...new Set(rows.map(r => r.numero_facture).filter(Boolean))];

    const modsByInvoice = {};
    if (invoiceNumbers.length > 0) {
        const [modRows] = await conn.query(
            `SELECT invoice_number, field_name, new_value, modification_date
             FROM InvoiceFieldModifications
             WHERE invoice_number IN (?)
             ORDER BY modification_date ASC`,
            [invoiceNumbers],
        );
        for (const m of modRows) {
            if (!modsByInvoice[m.invoice_number]) modsByInvoice[m.invoice_number] = {};
            modsByInvoice[m.invoice_number][m.field_name] = m.new_value;
        }
        console.log(`${modRows.length} modifications inline chargées.`);
    }

    const kunnrs = [...new Set(
        rows.map(r => r.vbrk_kunag).filter(Boolean).map(k => String(k).replace(/^0+/, ''))
    )];
    const sapAdrByKunnr = {};
    if (kunnrs.length > 0) {
        const [adrRows] = await conn.query(
            `SELECT KUNNR, SMTP_ADDR, TELF1 FROM sap_adresse_client WHERE KUNNR IN (?)`,
            [[...kunnrs, ...kunnrs.map(k => k.padStart(10, '0'))]],
        );
        for (const a of adrRows) {
            sapAdrByKunnr[String(a.KUNNR).replace(/^0+/, '')] = a;
            sapAdrByKunnr[a.KUNNR] = a;
        }
        console.log(`${adrRows.length} adresses SAP clients chargées.\n`);
    }

    const analyzed = [];
    const counts = {
        pos_npg: 0,
        pos_missing: 0,
        email_missing: 0,
        ncc_missing_b2b: 0,
        phone_missing: 0,
        client_name_missing: 0,
        fne_reference_missing: 0,
    };

    for (const r of rows) {
        const res = analyzeInvoice(r, modsByInvoice, sapAdrByKunnr);
        if (res.issues.length === 0) continue;
        if (args.only && !res.issues.some(i => args.only.includes(i))) continue;
        res.issues.forEach(i => { if (counts[i] !== undefined) counts[i]++; });
        analyzed.push(res);
    }

    console.log('=== Résumé ===');
    console.log(`Factures analysées          : ${rows.length}`);
    console.log(`Factures avec problème(s)   : ${analyzed.length}`);
    console.log('---');
    console.log(`  POS = "NPG" (générique)      : ${counts.pos_npg}`);
    console.log(`  POS manquant                 : ${counts.pos_missing}`);
    console.log(`  Email client manquant        : ${counts.email_missing}`);
    console.log(`  NCC manquant (B2B uniquement): ${counts.ncc_missing_b2b}`);
    console.log(`  Téléphone manquant           : ${counts.phone_missing}`);
    console.log(`  Nom client manquant          : ${counts.client_name_missing}`);
    console.log(`  Référence FNE manquante      : ${counts.fne_reference_missing}`);

    const header = [
        'numero_facture', 'fne_reference', 'fne_invoice_id',
        'send_date', 'sent_by', 'invoice_type', 'template',
        'point_of_sale', 'client_name', 'client_email', 'client_phone', 'client_ncc',
        'issues',
    ];
    const lines = [toCsvRow(header)];
    for (const r of analyzed) {
        lines.push(toCsvRow([
            r.numero_facture, r.fne_reference, r.fne_invoice_id,
            r.send_date, r.sent_by, r.invoice_type, r.template,
            r.point_of_sale, r.client_name, r.client_email, r.client_phone, r.client_ncc,
            r.issues.join('|'),
        ]));
    }
    fs.writeFileSync(args.csv, '\uFEFF' + lines.join('\r\n'), 'utf8');
    console.log(`\nCSV écrit : ${args.csv}`);

    await conn.end();
}

main().catch(err => {
    console.error('Erreur audit:', err);
    process.exit(1);
});
