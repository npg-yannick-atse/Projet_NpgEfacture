/**
 * Envoie deux notifications (endpoint NPG) :
 *   1) Tableau des factures téléchargées NON envoyées
 *   2) Tableau des factures envoyées sans référence FNE
 *
 * Usage :
 *   node scripts/notify_factures_status.js
 */

require('dotenv').config();
const mysql = require('mysql2/promise');
const axios = require('axios');

const DATABASE_URL = process.env.DATABASE_URL
    || 'mysql://connectdb:c0n3%21%40%232030@10.10.2.17:3306/npg_efacture';

const parseDbUrl = (url) => {
    const u = new URL(url);
    return {
        host: u.hostname,
        user: decodeURIComponent(u.username),
        password: decodeURIComponent(u.password),
        database: u.pathname.replace(/^\//, ''),
        port: u.port ? parseInt(u.port) : 3306,
        dateStrings: true,
    };
};

const DB_CONFIG = parseDbUrl(DATABASE_URL);

const NOTIFICATION_URL = 'http://10.10.2.17:3030/notifications';
const NOTIFICATION_KEY = 'ec7d2fe2de8b41ee8f91';

const fmtDate = (d) => {
    if (!d) return 'N/A';
    try { return new Date(d).toLocaleString('fr-FR'); } catch { return String(d); }
};

const esc = (v) => {
    if (v === null || v === undefined) return 'N/A';
    return String(v)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
};

function buildDownloadedNotSentHtml(records) {
    const rows = records.map(r => `
        <tr>
            <td style="border:1px solid #ddd;padding:8px;">${esc(r.numero)}</td>
            <td style="border:1px solid #ddd;padding:8px;">${esc(r.client)}</td>
            <td style="border:1px solid #ddd;padding:8px;">${fmtDate(r.date)}</td>
            <td style="border:1px solid #ddd;padding:8px;">${esc(r.username)}</td>
            <td style="border:1px solid #ddd;padding:8px;">${fmtDate(r.download_date)}</td>
            <td style="border:1px solid #ddd;padding:8px;text-align:center;">${r.verified ? 'Oui' : 'Non'}</td>
        </tr>
    `).join('');

    return `
        <h2>Factures téléchargées non envoyées</h2>
        <p>Nombre de factures : <strong>${records.length}</strong></p>
        <table style="border-collapse:collapse;width:100%;border:1px solid #ddd;">
            <tr style="background-color:#f2f2f2">
                <th style="border:1px solid #ddd;padding:8px;text-align:left;">N° Facture</th>
                <th style="border:1px solid #ddd;padding:8px;text-align:left;">Client</th>
                <th style="border:1px solid #ddd;padding:8px;text-align:left;">Date Facture</th>
                <th style="border:1px solid #ddd;padding:8px;text-align:left;">Téléchargée par</th>
                <th style="border:1px solid #ddd;padding:8px;text-align:left;">Date Téléchargement</th>
                <th style="border:1px solid #ddd;padding:8px;text-align:center;">Vérifiée</th>
            </tr>
            ${rows || '<tr><td colspan="6" style="border:1px solid #ddd;padding:8px;text-align:center;">Aucune facture</td></tr>'}
        </table>
    `;
}

function buildSentWithoutFneRefHtml(records) {
    const rows = records.map(r => `
        <tr>
            <td style="border:1px solid #ddd;padding:8px;">${esc(r.numero_facture)}</td>
            <td style="border:1px solid #ddd;padding:8px;text-align:center;">${esc(r.invoice_type)}</td>
            <td style="border:1px solid #ddd;padding:8px;">${esc(r.SendBy)}</td>
            <td style="border:1px solid #ddd;padding:8px;">${fmtDate(r.SendOn)}</td>
            <td style="border:1px solid #ddd;padding:8px;">${esc(r.fne_invoice_id)}</td>
            <td style="border:1px solid #ddd;padding:8px;text-align:center;color:red;font-weight:bold;">${!r.fne_reference ? 'MANQUANTE' : esc(r.fne_reference)}</td>
        </tr>
    `).join('');

    return `
        <h2>Factures envoyées sans référence FNE</h2>
        <p>Nombre de factures : <strong>${records.length}</strong></p>
        <table style="border-collapse:collapse;width:100%;border:1px solid #ddd;">
            <tr style="background-color:#f2f2f2">
                <th style="border:1px solid #ddd;padding:8px;text-align:left;">N° Facture</th>
                <th style="border:1px solid #ddd;padding:8px;text-align:center;">Type</th>
                <th style="border:1px solid #ddd;padding:8px;text-align:left;">Envoyée par</th>
                <th style="border:1px solid #ddd;padding:8px;text-align:left;">Date Envoi</th>
                <th style="border:1px solid #ddd;padding:8px;text-align:left;">FNE Invoice ID</th>
                <th style="border:1px solid #ddd;padding:8px;text-align:center;">FNE Référence</th>
            </tr>
            ${rows || '<tr><td colspan="6" style="border:1px solid #ddd;padding:8px;text-align:center;">Aucune facture</td></tr>'}
        </table>
    `;
}

async function sendNotification(object, message) {
    const payload = { key: NOTIFICATION_KEY, object, message };
    const resp = await axios.post(NOTIFICATION_URL, payload, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 30000
    });
    return resp.data;
}

async function fetchDownloadedNotSent(conn) {
    const [rows] = await conn.query(`
        SELECT di.numero, di.client, di.date, di.username, di.download_date, di.verified
        FROM downloaded_invoices di
        WHERE NOT EXISTS (
            SELECT 1 FROM logs_actions la
            WHERE la.numero_facture = di.numero
              AND la.SendBy IS NOT NULL
        )
        ORDER BY di.download_date DESC
    `);
    return rows;
}

async function fetchSentWithoutFneRef(conn) {
    const [rows] = await conn.query(`
        SELECT
            la.numero_facture,
            COALESCE(la.invoice_type, 'invoice') AS invoice_type,
            la.SendBy,
            la.SendOn,
            fi.fne_invoice_id,
            fi.fne_reference
        FROM logs_actions la
        LEFT JOIN fne_invoices fi ON fi.numero_facture = la.numero_facture
        WHERE la.SendBy IS NOT NULL
          AND (fi.fne_reference IS NULL OR TRIM(fi.fne_reference) = '')
        ORDER BY la.SendOn DESC
    `);
    return rows;
}

const CHUNK_SIZE = 50;

function chunk(arr, size) {
    const out = [];
    for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
    return out;
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const SEND_DELAY_MS = 10000;
const MAX_RETRIES = 5;

async function sendWithRetry(object, message) {
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            return await sendNotification(object, message);
        } catch (e) {
            const status = e.response?.status;
            if (attempt === MAX_RETRIES) throw e;
            const backoff = 30000;
            console.log(`     (tentative ${attempt} échouée status=${status}, retry dans ${backoff}ms)`);
            await sleep(backoff);
        }
    }
}

async function sendInChunks(object, records, buildHtml) {
    if (records.length === 0) {
        await sendWithRetry(`${object} - 0`, buildHtml([]));
        console.log('  -> OK (0)');
        return;
    }
    const chunks = chunk(records, CHUNK_SIZE);
    for (let i = 0; i < chunks.length; i++) {
        const suffix = chunks.length > 1 ? ` (partie ${i + 1}/${chunks.length})` : '';
        await sendWithRetry(
            `${object} - ${records.length}${suffix}`,
            buildHtml(chunks[i])
        );
        console.log(`  -> OK (${i + 1}/${chunks.length})`);
        if (i < chunks.length - 1) await sleep(SEND_DELAY_MS);
    }
}

async function main() {
    console.log('=== Notification statut factures ===');
    const conn = await mysql.createConnection(DB_CONFIG);

    try {
        console.log('Requête 1 : factures téléchargées non envoyées...');
        const downloadedNotSent = await fetchDownloadedNotSent(conn);
        console.log(`  -> ${downloadedNotSent.length} facture(s)`);

        console.log('Requête 2 : factures envoyées sans référence FNE...');
        const sentNoRef = await fetchSentWithoutFneRef(conn);
        console.log(`  -> ${sentNoRef.length} facture(s)`);

        console.log('Envoi notification 1...');
        await sendInChunks(
            'Factures téléchargées non envoyées',
            downloadedNotSent,
            buildDownloadedNotSentHtml
        );

        console.log('Envoi notification 2...');
        await sendInChunks(
            'Factures envoyées sans référence FNE',
            sentNoRef,
            buildSentWithoutFneRefHtml
        );

        console.log('Terminé.');
    } finally {
        await conn.end();
    }
}

main().catch(err => {
    console.error('Erreur:', err.response?.data || err.message || err);
    process.exit(1);
});
