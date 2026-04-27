/**
 * Annulation d'une facture FNE envoyée en double.
 *
 * Principe : pour neutraliser un des deux fne_invoice_id dupliqués, on envoie un
 * avoir (refund) couvrant 100% des items de cette facture FNE. La FNE a déjà tous
 * les items en base (fne_invoice_items) — on ne "recrée" rien, on refund.
 *
 * Usage (dry-run par défaut — rien n'est envoyé sans --confirm) :
 *   node scripts/cancel_fne_duplicate.js --id=<FNE_INVOICE_ID>
 *   node scripts/cancel_fne_duplicate.js --id=<FNE_INVOICE_ID> --confirm
 *   node scripts/cancel_fne_duplicate.js --numero=<NUM_FACTURE> --which=<FNE_INVOICE_ID>
 *
 * Options :
 *   --id=<uuid>        fne_invoice_id à annuler (prioritaire)
 *   --numero=<x>       numero_facture SAP (affiche les candidats)
 *   --which=<uuid>     fne_invoice_id précis parmi les candidats (requis si --numero)
 *   --confirm          exécute réellement l'appel FNE (sinon dry-run)
 *   --url=<url>        override FNE_API_URL
 *   --token=<tok>      override FNE_API_TOKEN
 *   --username=<user>  username inscrit dans logs_actions (défaut: "script_cancel")
 *   --reason=<txt>     raison (inscrite dans api_response du log)
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const mysql = require('mysql2/promise');
const https = require('https');
const http = require('http');
const { URL } = require('url');

const DB_CONFIG = {
    host: '10.10.2.17',
    user: 'connectdb',
    password: 'c0n3!@#2030',
    database: 'npg_efacture',
    port: 3306,
    dateStrings: true,
};

function parseArgs(argv) {
    const out = { confirm: false, username: 'script_cancel' };
    for (const a of argv.slice(2)) {
        const clean = a.replace(/^--/, '');
        if (clean === 'confirm') { out.confirm = true; continue; }
        const eq = clean.indexOf('=');
        if (eq === -1) continue;
        out[clean.slice(0, eq)] = clean.slice(eq + 1);
    }
    return out;
}

function safeJsonParse(raw) {
    if (!raw) return null;
    if (typeof raw === 'object') return raw;
    try { return JSON.parse(raw); } catch { return null; }
}

function httpRequest(method, u, body, token) {
    return new Promise((resolve, reject) => {
        const lib = u.protocol === 'https:' ? https : http;
        const bodyStr = body ? JSON.stringify(body) : null;
        const headers = {
            'Accept': 'application/json',
            'Authorization': `Bearer ${token}`,
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
            method, headers,
        }, res => {
            const chunks = [];
            res.on('data', c => chunks.push(c));
            res.on('end', () => {
                const raw = Buffer.concat(chunks).toString('utf8');
                let json = null;
                try { json = JSON.parse(raw); } catch { }
                resolve({ status: res.statusCode, raw, json });
            });
        });
        req.setTimeout(30000, () => req.destroy(new Error('timeout 30s')));
        req.on('error', reject);
        if (bodyStr) req.write(bodyStr);
        req.end();
    });
}

async function main() {
    const args = parseArgs(process.argv);
    let fneInvoiceId = args.id;

    const baseUrl = args.url || process.env.FNE_API_URL || 'http://54.247.95.108/ws/external/invoices/sign';
    const token = args.token || process.env.FNE_API_TOKEN || '';

    if (!token) {
        console.error('FNE_API_TOKEN absent. Passe --token=<valeur> ou définis-le dans .env.');
        process.exit(2);
    }

    const conn = await mysql.createConnection(DB_CONFIG);

    // ─── Résolution du fne_invoice_id cible ───
    if (!fneInvoiceId && args.numero) {
        const [candidates] = await conn.query(
            `SELECT fne_invoice_id, fne_reference, fne_ncc, created_at
             FROM fne_invoices WHERE numero_facture = ?
             ORDER BY created_at ASC`,
            [args.numero],
        );
        console.log(`\nCandidats pour numero_facture=${args.numero} :`);
        if (candidates.length === 0) {
            console.log('  (aucun — vérifier le numéro)');
            await conn.end();
            process.exit(1);
        }
        candidates.forEach((c, i) => {
            console.log(`  [${i + 1}] fne_invoice_id=${c.fne_invoice_id}`);
            console.log(`      fne_reference=${c.fne_reference}  ncc=${c.fne_ncc}  created=${c.created_at}`);
        });
        if (!args.which) {
            console.log('\nRelancer avec --which=<fne_invoice_id> pour choisir celui à annuler.');
            await conn.end();
            return;
        }
        fneInvoiceId = args.which;
        if (!candidates.some(c => c.fne_invoice_id === fneInvoiceId)) {
            console.error(`\nErreur : ${fneInvoiceId} ne fait pas partie des candidats.`);
            await conn.end();
            process.exit(1);
        }
    }

    if (!fneInvoiceId) {
        console.error('Il faut --id=<fne_invoice_id> (ou --numero=<...> puis --which=<...>).');
        await conn.end();
        process.exit(2);
    }

    // ─── Charger la facture FNE et ses items ───
    const [fneRows] = await conn.query(
        `SELECT numero_facture, fne_invoice_id, fne_reference, fne_ncc, created_at
         FROM fne_invoices WHERE fne_invoice_id = ?`,
        [fneInvoiceId],
    );
    if (fneRows.length === 0) {
        console.error(`Aucune facture FNE trouvée pour fne_invoice_id=${fneInvoiceId}`);
        await conn.end();
        process.exit(1);
    }
    const fne = fneRows[0];

    const [itemRows] = await conn.query(
        `SELECT fne_item_id, reference, description, quantity, item_data
         FROM fne_invoice_items WHERE fne_invoice_id = ?`,
        [fneInvoiceId],
    );

    if (itemRows.length === 0) {
        console.error('Aucun item en base pour cette facture FNE. Annulation impossible via /refund.');
        await conn.end();
        process.exit(1);
    }

    // ─── Construire le payload refund (100% des quantités) ───
    const items = itemRows.map(it => ({
        id: it.fne_item_id,
        quantity: Math.round(parseFloat(it.quantity || 0)),
    })).filter(it => it.quantity > 0);

    if (items.length === 0) {
        console.error('Toutes les quantités sont à 0 après arrondi. Annulation impossible.');
        await conn.end();
        process.exit(1);
    }

    console.log('\n=== Cible ===');
    console.log(`numero_facture     : ${fne.numero_facture}`);
    console.log(`fne_invoice_id     : ${fne.fne_invoice_id}`);
    console.log(`fne_reference      : ${fne.fne_reference}`);
    console.log(`ncc                : ${fne.fne_ncc}`);
    console.log(`créée le           : ${fne.created_at}`);
    console.log(`items à rembourser : ${items.length}`);
    itemRows.forEach((it, i) => {
        console.log(`  [${i + 1}] ${it.fne_item_id}  ref=${it.reference}  qty=${it.quantity}  "${(it.description || '').slice(0, 50)}"`);
    });

    // ─── Vérifier qu'il existe un autre fne_invoice_id pour le même numero_facture ───
    const [siblings] = await conn.query(
        `SELECT fne_invoice_id, fne_reference FROM fne_invoices
         WHERE numero_facture = ? AND fne_invoice_id != ?`,
        [fne.numero_facture, fne.fne_invoice_id],
    );
    if (siblings.length === 0) {
        console.warn('\n⚠  Aucune autre entrée fne_invoices pour cette facture SAP.');
        console.warn('   Tu es sur le point d\'annuler la SEULE signature FNE — confirme que c\'est voulu.');
    } else {
        console.log('\nAutres signatures existantes pour la même facture SAP (resteront valides) :');
        siblings.forEach(s => console.log(`  - ${s.fne_invoice_id}  ref=${s.fne_reference}`));
    }

    // ─── URL refund ───
    const refundUrl = baseUrl.replace(/\/sign\/?$/, '') + `/${fneInvoiceId}/refund`;
    console.log(`\nEndpoint : POST ${refundUrl}`);
    console.log('Payload  :', JSON.stringify({ items }, null, 2));

    if (!args.confirm) {
        console.log('\n[DRY-RUN] Rien n\'a été envoyé à la FNE.');
        console.log('Pour exécuter réellement : relancer avec --confirm');
        await conn.end();
        return;
    }

    // ─── Appel FNE ───
    console.log('\nEnvoi à la FNE...');
    const u = new URL(refundUrl);
    let response;
    try {
        response = await httpRequest('POST', u, { items }, token);
    } catch (e) {
        console.error('Erreur réseau :', e.message);
        await conn.end();
        process.exit(1);
    }

    console.log(`HTTP ${response.status}`);
    console.log('Body :', response.raw.slice(0, 600));

    const ok = response.status >= 200 && response.status < 300;

    // ─── Log dans logs_actions (même format que sendRefund du controller) ───
    const logPayload = {
        success: ok,
        ...(response.json || {}),
        cancellation: true,
        reason: args.reason || 'Annulation doublon FNE (script cancel_fne_duplicate)',
        cancelled_fne_invoice_id: fneInvoiceId,
        cancelled_fne_reference: fne.fne_reference,
        facture_initiale: fne.numero_facture,
        refund_items: items,
        http_status: response.status,
    };

    await conn.query(
        `INSERT INTO logs_actions (username, numero_facture, SendBy, SendOn, api_response, invoice_type, created_by, created_on)
         VALUES (?, ?, ?, NOW(), ?, 'refund', ?, NOW())`,
        [args.username, fne.numero_facture, args.username, JSON.stringify(logPayload), args.username],
    );

    console.log('\nLog inséré dans logs_actions (invoice_type=refund).');

    if (ok) {
        console.log(`✓ Annulation réussie. Référence avoir : ${response.json?.reference || '(voir body)'}`);
    } else {
        console.log('✗ La FNE a refusé l\'appel. Le log est conservé pour trace.');
    }

    await conn.end();
}

main().catch(err => {
    console.error('Erreur script :', err);
    process.exit(1);
});
