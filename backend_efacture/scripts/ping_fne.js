/**
 * Diagnostic de connectivité vers l'API FNE.
 *
 * Teste successivement :
 *   1. Résolution DNS + connexion TCP (port 80/443)
 *   2. Requête HTTP HEAD sur la racine du serveur
 *   3. Appel POST authentifié (avec un payload volontairement vide) :
 *      une réponse 4xx prouve que le serveur répond ET que le token est accepté.
 *
 * Usage :
 *   node scripts/ping_fne.js
 *   node scripts/ping_fne.js --url=http://54.247.95.108/ws/external/invoices/sign
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const http = require('http');
const https = require('https');
const net = require('net');
const dns = require('dns').promises;
const { URL } = require('url');

const args = Object.fromEntries(
    process.argv.slice(2).map(a => a.replace(/^--/, '').split('='))
);

const FNE_URL = args.url || process.env.FNE_API_URL || 'http://54.247.95.108/ws/external/invoices/sign';
const FNE_TOKEN = args.token || process.env.FNE_API_TOKEN || '';
const TIMEOUT_MS = parseInt(args.timeout || '5000', 10);

function ok(msg)    { console.log(`  \x1b[32mOK\x1b[0m   ${msg}`); }
function ko(msg)    { console.log(`  \x1b[31mKO\x1b[0m   ${msg}`); }
function warn(msg)  { console.log(`  \x1b[33mWARN\x1b[0m ${msg}`); }
function info(msg)  { console.log(`       ${msg}`); }

async function testDnsAndTcp(target) {
    console.log(`\n[1] DNS + TCP  ${target.host}:${target.port}`);
    const start = Date.now();
    try {
        const addrs = await dns.lookup(target.host, { all: true });
        ok(`DNS : ${addrs.map(a => a.address).join(', ')}  (${Date.now() - start}ms)`);
    } catch (e) {
        ko(`DNS : ${e.message}`);
        return false;
    }

    return await new Promise(resolve => {
        const sock = new net.Socket();
        const t0 = Date.now();
        sock.setTimeout(TIMEOUT_MS);
        sock.once('connect', () => {
            ok(`TCP : connecté en ${Date.now() - t0}ms`);
            sock.destroy();
            resolve(true);
        });
        sock.once('timeout', () => {
            ko(`TCP : timeout après ${TIMEOUT_MS}ms (firewall/réseau ?)`);
            sock.destroy();
            resolve(false);
        });
        sock.once('error', err => {
            ko(`TCP : ${err.code || err.message}`);
            resolve(false);
        });
        sock.connect(target.port, target.host);
    });
}

function httpRequest(options, body) {
    return new Promise((resolve, reject) => {
        const lib = options.protocol === 'https:' ? https : http;
        const t0 = Date.now();
        const req = lib.request(options, res => {
            const chunks = [];
            res.on('data', c => chunks.push(c));
            res.on('end', () => resolve({
                status: res.statusCode,
                headers: res.headers,
                body: Buffer.concat(chunks).toString('utf8'),
                ms: Date.now() - t0,
            }));
        });
        req.setTimeout(TIMEOUT_MS, () => req.destroy(new Error(`timeout ${TIMEOUT_MS}ms`)));
        req.on('error', reject);
        if (body) req.write(body);
        req.end();
    });
}

async function testHttpReachable(u) {
    console.log(`\n[2] HTTP HEAD  ${u.protocol}//${u.host}/`);
    try {
        const res = await httpRequest({
            protocol: u.protocol, host: u.hostname, port: u.port || (u.protocol === 'https:' ? 443 : 80),
            path: '/', method: 'HEAD',
        });
        ok(`status=${res.status}  server=${res.headers.server || 'n/a'}  (${res.ms}ms)`);
        return true;
    } catch (e) {
        ko(`HTTP HEAD : ${e.message}`);
        return false;
    }
}

async function testAuth(u, token) {
    console.log(`\n[3] POST signé  ${u.href}`);
    if (!token) { warn('Pas de FNE_API_TOKEN — étape sautée.'); return null; }
    const body = JSON.stringify({ __ping: true });
    try {
        const res = await httpRequest({
            protocol: u.protocol, host: u.hostname, port: u.port || (u.protocol === 'https:' ? 443 : 80),
            path: u.pathname + u.search, method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'Authorization': `Bearer ${token}`,
                'Content-Length': Buffer.byteLength(body),
            },
        }, body);

        const snippet = res.body.replace(/\s+/g, ' ').slice(0, 180);
        if (res.status === 401 || res.status === 403) {
            ko(`status=${res.status} → token refusé. Body: ${snippet}`);
        } else if (res.status >= 400 && res.status < 500) {
            ok(`status=${res.status} → API joignable & token accepté (payload invalide attendu). Body: ${snippet}  (${res.ms}ms)`);
        } else if (res.status >= 200 && res.status < 300) {
            ok(`status=${res.status} → API joignable (200 inattendu sur payload vide). Body: ${snippet}  (${res.ms}ms)`);
        } else if (res.status >= 500) {
            warn(`status=${res.status} → API en erreur côté serveur. Body: ${snippet}  (${res.ms}ms)`);
        }
        return res.status;
    } catch (e) {
        ko(`POST : ${e.message}`);
        return null;
    }
}

(async () => {
    console.log('=== Ping API FNE ===');
    console.log(`URL     : ${FNE_URL}`);
    console.log(`Token   : ${FNE_TOKEN ? FNE_TOKEN.slice(0, 6) + '…' + FNE_TOKEN.slice(-4) : '(non défini)'}`);
    console.log(`Timeout : ${TIMEOUT_MS}ms`);

    let u;
    try { u = new URL(FNE_URL); }
    catch (e) { console.error('URL invalide:', e.message); process.exit(2); }

    const target = {
        host: u.hostname,
        port: parseInt(u.port || (u.protocol === 'https:' ? 443 : 80), 10),
    };

    const tcpOk = await testDnsAndTcp(target);
    if (!tcpOk) {
        console.log('\n=> Réseau/firewall bloqué. Arrêt.');
        process.exit(1);
    }
    await testHttpReachable(u);
    await testAuth(u, FNE_TOKEN);
    console.log('\n=== Fin ===');
})();
