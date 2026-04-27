/**
 * Probe : est-il possible de lister les factures déjà envoyées via l'API FNE ?
 *
 * La doc FNE officielle n'expose (à notre connaissance) que POST /invoices/sign
 * et POST /invoices/{id}/refund. Ce script teste un jeu de chemins REST usuels
 * pour vérifier si un endpoint de lecture/listing existe côté DGI.
 *
 * Pour chaque chemin il tente GET puis POST, avec auth Bearer, et affiche :
 *   - status HTTP
 *   - taille body
 *   - extrait du JSON (si c'en est) ou snippet texte
 *
 * Usage :
 *   node scripts/probe_fne_list.js
 *   node scripts/probe_fne_list.js --base=https://www.services.fne.dgi.gouv.ci --token=xxx
 *   node scripts/probe_fne_list.js --only=list,search   # filtrer certains tests
 *
 * Interprétation :
 *   200/206          → endpoint existe ET nous renvoie des données (jackpot)
 *   401/403          → endpoint existe mais droits insuffisants (endpoint caché)
 *   400/422          → endpoint existe mais attend d'autres paramètres
 *   404              → endpoint inexistant
 *   405              → chemin existe mais méthode non supportée (tester l'autre verbe)
 *   501/503          → serveur OK mais fonction absente
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const https = require('https');
const http = require('http');
const { URL } = require('url');

const args = Object.fromEntries(
    process.argv.slice(2).map(a => a.replace(/^--/, '').split('='))
);

const BASE = (args.base || 'https://www.services.fne.dgi.gouv.ci').replace(/\/$/, '');
const TOKEN = args.token || process.env.FNE_API_TOKEN || 'xOUe2t01VwGqGgA2VG6yStihUmmg30Jm';
const TIMEOUT_MS = parseInt(args.timeout || '10000', 10);
const ONLY = args.only ? args.only.split(',').map(s => s.trim()) : null;

// Chemins candidats. Chaque entrée = { tag, path, verbs, body?, query? }
const CANDIDATES = [
    // ── Listing générique ──
    { tag: 'list',         path: '/ws/external/invoices',               verbs: ['GET'] },
    { tag: 'list-trail',   path: '/ws/external/invoices/',              verbs: ['GET'] },
    { tag: 'list-paged',   path: '/ws/external/invoices?page=1&size=10', verbs: ['GET'] },
    { tag: 'list-all',     path: '/ws/external/invoices/all',           verbs: ['GET'] },
    { tag: 'list-find',    path: '/ws/external/invoices/find',          verbs: ['GET', 'POST'], body: {} },
    { tag: 'list-search',  path: '/ws/external/invoices/search',        verbs: ['GET', 'POST'], body: {} },
    { tag: 'list-history', path: '/ws/external/invoices/history',       verbs: ['GET'] },
    { tag: 'list-sent',    path: '/ws/external/invoices/sent',          verbs: ['GET'] },
    { tag: 'list-query',   path: '/ws/external/invoices/query',         verbs: ['GET', 'POST'], body: {} },

    // ── Identifiants connus ──
    { tag: 'by-ncc',       path: '/ws/external/invoices?ncc=9904279V',  verbs: ['GET'] },
    { tag: 'by-date',      path: '/ws/external/invoices?from=2025-01-01&to=2025-12-31', verbs: ['GET'] },

    // ── Variations de préfixe ──
    { tag: 'v1',           path: '/ws/external/v1/invoices',            verbs: ['GET'] },
    { tag: 'api-invoices', path: '/api/invoices',                       verbs: ['GET'] },
    { tag: 'api-v1',       path: '/api/v1/invoices',                    verbs: ['GET'] },
    { tag: 'ws-invoices',  path: '/ws/invoices',                        verbs: ['GET'] },

    // ── Méta / debug ──
    { tag: 'openapi',      path: '/openapi.json',                       verbs: ['GET'] },
    { tag: 'swagger',      path: '/swagger.json',                       verbs: ['GET'] },
    { tag: 'swagger-ui',   path: '/swagger-ui.html',                    verbs: ['GET'] },
    { tag: 'docs',         path: '/docs',                               verbs: ['GET'] },
    { tag: 'api-docs',     path: '/api-docs',                           verbs: ['GET'] },
    { tag: 'root-ext',     path: '/ws/external',                        verbs: ['GET'] },
    { tag: 'health',       path: '/ws/external/health',                 verbs: ['GET'] },
];

function colorStatus(code) {
    if (code >= 200 && code < 300) return `\x1b[32m${code}\x1b[0m`;
    if (code === 401 || code === 403) return `\x1b[33m${code}\x1b[0m`;
    if (code === 404) return `\x1b[90m${code}\x1b[0m`;
    if (code >= 400 && code < 500) return `\x1b[36m${code}\x1b[0m`;
    if (code >= 500) return `\x1b[31m${code}\x1b[0m`;
    return String(code);
}

function request(method, u, body) {
    return new Promise(resolve => {
        const lib = u.protocol === 'https:' ? https : http;
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

        const req = lib.request({
            protocol: u.protocol,
            host: u.hostname,
            port: u.port || (u.protocol === 'https:' ? 443 : 80),
            path: u.pathname + (u.search || ''),
            method,
            headers,
        }, res => {
            const chunks = [];
            res.on('data', c => chunks.push(c));
            res.on('end', () => {
                const raw = Buffer.concat(chunks).toString('utf8');
                let json = null;
                try { json = JSON.parse(raw); } catch { /* pas du JSON */ }
                resolve({
                    status: res.statusCode,
                    ms: Date.now() - t0,
                    length: raw.length,
                    contentType: res.headers['content-type'] || '',
                    json,
                    snippet: raw.replace(/\s+/g, ' ').slice(0, 220),
                });
            });
        });
        req.setTimeout(TIMEOUT_MS, () => req.destroy(new Error(`timeout ${TIMEOUT_MS}ms`)));
        req.on('error', err => resolve({ status: 0, error: err.message, ms: Date.now() - t0 }));
        if (bodyStr) req.write(bodyStr);
        req.end();
    });
}

(async () => {
    console.log('=== Probe endpoints FNE (lecture/listing) ===');
    console.log(`Base  : ${BASE}`);
    console.log(`Token : ${TOKEN ? TOKEN.slice(0, 6) + '…' + TOKEN.slice(-4) : '(absent)'}`);
    console.log(`Paths : ${CANDIDATES.length}  |  timeout ${TIMEOUT_MS}ms\n`);

    const results = [];

    for (const c of CANDIDATES) {
        if (ONLY && !ONLY.includes(c.tag)) continue;
        const u = new URL(BASE + c.path);

        for (const verb of c.verbs) {
            const r = await request(verb, u, verb === 'POST' ? (c.body || {}) : null);
            const statusStr = r.error ? `\x1b[31mERR\x1b[0m` : colorStatus(r.status);
            const sizeStr = r.length !== undefined ? `${r.length}b` : '-';
            console.log(
                `[${c.tag.padEnd(12)}] ${verb.padEnd(4)} ${c.path.padEnd(52)} ${statusStr}  ${sizeStr.padStart(7)}  ${r.ms}ms`
            );
            if (r.error) {
                console.log(`   err: ${r.error}`);
            } else if (r.status >= 200 && r.status < 500 && r.length > 0) {
                const preview = r.json
                    ? JSON.stringify(r.json).slice(0, 200)
                    : r.snippet;
                console.log(`   body: ${preview}`);
            }
            results.push({ tag: c.tag, verb, path: c.path, ...r });
        }
    }

    // ─── Synthèse ───
    const reachable = results.filter(r => r.status >= 200 && r.status < 500 && r.status !== 404);
    const listing   = reachable.filter(r => r.status >= 200 && r.status < 300 && r.json && (
        Array.isArray(r.json) ||
        Array.isArray(r.json.data) ||
        Array.isArray(r.json.items) ||
        Array.isArray(r.json.invoices)
    ));

    console.log('\n=== Synthèse ===');
    console.log(`Endpoints joignables (non 404) : ${reachable.length}/${results.length}`);
    console.log(`Listings exploitables (2xx + JSON tableau) : ${listing.length}`);

    if (listing.length > 0) {
        console.log('\nEndpoints qui renvoient une liste :');
        for (const l of listing) {
            console.log(`  ✓ ${l.verb} ${l.path}  (${l.length}b)`);
        }
    } else {
        console.log('\nAucun endpoint de listing 2xx. Analyse des 4xx/3xx :');
        for (const r of reachable) {
            console.log(`  · ${r.verb} ${r.path}  → ${r.status}  (indice : ${r.status === 401 || r.status === 403 ? 'droits insuffisants' : r.status === 400 || r.status === 422 ? 'paramètres manquants' : 'autre'})`);
        }
        console.log('\nConclusion probable : la FNE DGI-CI n\'expose pas de listing public sur ce token.');
        console.log('Vérifie la documentation officielle ou demande au support DGI un endpoint de consultation.');
    }
})();
