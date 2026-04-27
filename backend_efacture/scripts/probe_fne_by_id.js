/**
 * Probe : récupération d'une facture FNE par ID.
 *
 * Usage :
 *   node scripts/probe_fne_by_id.js <fne_invoice_id>
 *   node scripts/probe_fne_by_id.js ee7939b2-41a8-4780-b7a6-dec57e23aa4c
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const https = require('https');
const { URL } = require('url');

const ID = process.argv[2];
if (!ID) {
    console.error('Usage: node scripts/probe_fne_by_id.js <fne_invoice_id>');
    process.exit(1);
}

const BASE = 'https://www.services.fne.dgi.gouv.ci';
const TOKEN = process.env.FNE_API_TOKEN || 'xOUe2t01VwGqGgA2VG6yStihUmmg30Jm';

const PATHS = [
    `/ws/external/invoices/${ID}`,
    `/ws/external/invoices/${ID}/`,
    `/ws/external/invoices/${ID}/items`,
    `/ws/external/invoices/${ID}/refund`,
    `/ws/external/invoices/${ID}/status`,
    `/ws/external/invoices/${ID}/pdf`,
    `/ws/external/invoices/${ID}/download`,
    `/ws/external/invoices/${ID}/verify`,
    `/ws/invoices/${ID}`,
];

function request(method, u, body) {
    return new Promise(resolve => {
        const t0 = Date.now();
        const bodyStr = body ? JSON.stringify(body) : null;
        const headers = {
            'Accept': 'application/json',
            'Authorization': `Bearer ${TOKEN}`,
        };
        if (bodyStr) {
            headers['Content-Type'] = 'application/json';
            headers['Content-Length'] = Buffer.byteLength(bodyStr);
        }
        const req = https.request({
            host: u.hostname, port: 443, path: u.pathname + (u.search || ''), method, headers,
        }, res => {
            const chunks = [];
            res.on('data', c => chunks.push(c));
            res.on('end', () => {
                const raw = Buffer.concat(chunks).toString('utf8');
                let json = null;
                try { json = JSON.parse(raw); } catch { }
                resolve({ status: res.statusCode, ms: Date.now() - t0, length: raw.length, json, raw });
            });
        });
        req.setTimeout(10000, () => req.destroy(new Error('timeout')));
        req.on('error', e => resolve({ status: 0, error: e.message, ms: Date.now() - t0 }));
        if (bodyStr) req.write(bodyStr);
        req.end();
    });
}

function color(code) {
    if (code >= 200 && code < 300) return `\x1b[32m${code}\x1b[0m`;
    if (code === 401 || code === 403) return `\x1b[33m${code}\x1b[0m`;
    if (code === 404) return `\x1b[90m${code}\x1b[0m`;
    if (code >= 400) return `\x1b[31m${code}\x1b[0m`;
    return String(code);
}

(async () => {
    console.log(`=== Probe FNE by id: ${ID} ===`);
    console.log(`Base: ${BASE}  Token: ${TOKEN.slice(0, 6)}…${TOKEN.slice(-4)}\n`);

    for (const p of PATHS) {
        const u = new URL(BASE + p);
        for (const verb of ['GET']) {
            const r = await request(verb, u);
            const statusStr = r.error ? '\x1b[31mERR\x1b[0m' : color(r.status);
            console.log(`${verb.padEnd(4)} ${p.padEnd(80)} ${statusStr}  ${String(r.length || 0).padStart(6)}b  ${r.ms}ms`);
            if (r.error) {
                console.log(`   err: ${r.error}`);
            } else if (r.length > 0 && r.length < 2000) {
                console.log(`   body: ${(r.raw || '').replace(/\s+/g, ' ').slice(0, 400)}`);
            } else if (r.json) {
                console.log(`   keys: ${Object.keys(r.json).join(', ')}`);
            }
        }
    }
})();
