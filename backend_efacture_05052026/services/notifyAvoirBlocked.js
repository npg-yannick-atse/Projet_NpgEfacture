/**
 * Service de notification : avoir bloqué pour incohérence avec la facture initiale.
 *
 * Déclenché lorsqu'un avoir SAP est résolu et que :
 *   - aucun de ses articles ne correspond à la facture initiale, OU
 *   - certains articles de l'avoir sont absents de la facture initiale.
 *
 * Format / pattern d'envoi calqués sur scripts/notify_factures_status.js
 * (POST JSON vers NOTIFICATION_URL avec { key, object, message }).
 */

const axios = require('axios');
const { NOTIFICATION_URL } = require('../config/notificationConfig');

const NOTIFICATION_KEY = '68989f6f859a465a9d46';
const TIMEOUT_MS = 30000;
const MAX_RETRIES = 3;
const RETRY_BACKOFF_MS = 5000;

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const fmtDate = (d) => {
    if (d === null || d === undefined || d === '') return 'N/A';
    // SAP format YYYYMMDD (ex: "20260508") → conversion manuelle car Date() ne le parse pas
    const s = String(d).trim();
    if (/^\d{8}$/.test(s)) {
        const y = s.slice(0, 4), m = s.slice(4, 6), day = s.slice(6, 8);
        return `${day}/${m}/${y}`;
    }
    const parsed = new Date(s);
    if (Number.isNaN(parsed.getTime())) return esc(s);
    return parsed.toLocaleString('fr-FR');
};

const esc = (v) => {
    if (v === null || v === undefined || v === '') return 'N/A';
    return String(v)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
};

const fmtNum = (n) => {
    if (n === null || n === undefined || n === '') return 'N/A';
    const x = parseFloat(n);
    if (Number.isNaN(x)) return esc(n);
    return x.toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 4 });
};

function buildItemsTable(title, items, includeMatched) {
    const rows = (items || []).map(it => `
        <tr>
            <td style="border:1px solid #ddd;padding:6px;">${esc(it.matnr || it.matnr_normalized)}</td>
            <td style="border:1px solid #ddd;padding:6px;">${esc(it.description)}</td>
            <td style="border:1px solid #ddd;padding:6px;text-align:right;">${fmtNum(it.quantity)}</td>
            <td style="border:1px solid #ddd;padding:6px;text-align:center;">${esc(it.unit)}</td>
            <td style="border:1px solid #ddd;padding:6px;text-align:right;">${fmtNum(it.netwr)}</td>
            ${includeMatched
                ? `<td style="border:1px solid #ddd;padding:6px;text-align:center;">${it.matched ? 'Oui' : '<strong style="color:#b00;">Non</strong>'}</td>`
                : ''}
        </tr>
    `).join('');

    const matchedHeader = includeMatched
        ? '<th style="border:1px solid #ddd;padding:6px;text-align:center;">Matché</th>'
        : '';
    const colCount = includeMatched ? 6 : 5;

    return `
        <h3 style="margin-top:18px;">${esc(title)}</h3>
        <table style="border-collapse:collapse;width:100%;border:1px solid #ddd;">
            <tr style="background-color:#f2f2f2;">
                <th style="border:1px solid #ddd;padding:6px;text-align:left;">Article</th>
                <th style="border:1px solid #ddd;padding:6px;text-align:left;">Description</th>
                <th style="border:1px solid #ddd;padding:6px;text-align:right;">Quantité</th>
                <th style="border:1px solid #ddd;padding:6px;text-align:center;">Unité</th>
                <th style="border:1px solid #ddd;padding:6px;text-align:right;">Montant</th>
                ${matchedHeader}
            </tr>
            ${rows || `<tr><td colspan="${colCount}" style="border:1px solid #ddd;padding:6px;text-align:center;">Aucun article</td></tr>`}
        </table>
    `;
}

function buildBlockedAvoirHtml(payload) {
    const {
        avoir = {},
        factureInitiale = {},
        unmatchedAvoirItems = [],
        unitMismatchItems = [],
        avoirSapItems = [],
        matchedItemsCount = 0,
        totalAvoirItemsCount = 0,
        blockedReason = '',
        blockedKind = '',
        triggeredBy = ''
    } = payload || {};

    const headerBlock = `
        <h2 style="color:#b00;margin-bottom:6px;">Avoir bloqué — incohérence avec la facture initiale</h2>
        <p style="margin-top:0;"><strong>Motif :</strong> ${esc(blockedReason)}</p>
        <table style="border-collapse:collapse;border:1px solid #ddd;margin-top:8px;">
            <tr><td style="border:1px solid #ddd;padding:6px;background:#f7f7f7;">N° avoir SAP</td><td style="border:1px solid #ddd;padding:6px;"><strong>${esc(avoir.numero)}</strong></td></tr>
            <tr><td style="border:1px solid #ddd;padding:6px;background:#f7f7f7;">Date</td><td style="border:1px solid #ddd;padding:6px;">${fmtDate(avoir.date)}</td></tr>
            <tr><td style="border:1px solid #ddd;padding:6px;background:#f7f7f7;">Client (KUNRG)</td><td style="border:1px solid #ddd;padding:6px;">${esc(avoir.client)}</td></tr>
            <tr><td style="border:1px solid #ddd;padding:6px;background:#f7f7f7;">Montant</td><td style="border:1px solid #ddd;padding:6px;">${fmtNum(parseFloat(avoir.montant) * 100)} ${esc(avoir.devise)}</td></tr>
            <tr><td style="border:1px solid #ddd;padding:6px;background:#f7f7f7;">Commande SAP</td><td style="border:1px solid #ddd;padding:6px;">${esc(avoir.commande)}</td></tr>
            <tr><td style="border:1px solid #ddd;padding:6px;background:#f7f7f7;">Facture initiale</td><td style="border:1px solid #ddd;padding:6px;">${esc(factureInitiale.numero)} ${factureInitiale.fne_reference ? `(FNE: ${esc(factureInitiale.fne_reference)})` : ''}</td></tr>
            <tr><td style="border:1px solid #ddd;padding:6px;background:#f7f7f7;">Articles matchés</td><td style="border:1px solid #ddd;padding:6px;">${matchedItemsCount} / ${totalAvoirItemsCount}</td></tr>
            ${triggeredBy ? `<tr><td style="border:1px solid #ddd;padding:6px;background:#f7f7f7;">Détecté par</td><td style="border:1px solid #ddd;padding:6px;">${esc(triggeredBy)}</td></tr>` : ''}
            <tr><td style="border:1px solid #ddd;padding:6px;background:#f7f7f7;">Date détection</td><td style="border:1px solid #ddd;padding:6px;">${fmtDate(new Date())}</td></tr>
        </table>
    `;

    // Selon le type de blocage, on construit la section de détails différemment :
    //   - UNIT_MISMATCH → tableau des articles avec unités divergentes (avoir vs facture initiale)
    //   - sinon (NO_MATCHING_ITEMS) → tableau des articles non présents dans la facture initiale
    let detailSection = '';

    if (blockedKind === 'UNIT_MISMATCH' && unitMismatchItems.length > 0) {
        const rows = unitMismatchItems.map(it => `
            <tr>
                <td style="border:1px solid #ddd;padding:6px;">${esc(it.matnr_normalized || it.matnr)}</td>
                <td style="border:1px solid #ddd;padding:6px;">${esc(it.description)}</td>
                <td style="border:1px solid #ddd;padding:6px;text-align:right;">${fmtNum(it.quantity)}</td>
                <td style="border:1px solid #ddd;padding:6px;text-align:center;color:#b00;font-weight:bold;">${esc(it.avoir_unit) || 'N/A'}</td>
                <td style="border:1px solid #ddd;padding:6px;text-align:center;">${esc(it.initial_unit) || 'N/A'}</td>
            </tr>
        `).join('');
        detailSection = `
            <h3 style="margin-top:18px;">Articles avec unités divergentes (avoir vs facture initiale)</h3>
            <table style="border-collapse:collapse;width:100%;border:1px solid #ddd;">
                <tr style="background-color:#f2f2f2;">
                    <th style="border:1px solid #ddd;padding:6px;text-align:left;">Article</th>
                    <th style="border:1px solid #ddd;padding:6px;text-align:left;">Description</th>
                    <th style="border:1px solid #ddd;padding:6px;text-align:right;">Quantité avoir</th>
                    <th style="border:1px solid #ddd;padding:6px;text-align:center;">Unité avoir</th>
                    <th style="border:1px solid #ddd;padding:6px;text-align:center;">Unité facture initiale</th>
                </tr>
                ${rows}
            </table>
        `;
    } else {
        // Cas NO_MATCHING_ITEMS (par défaut) : articles non présents dans la facture initiale
        const unmatchedItems = unmatchedAvoirItems.length
            ? unmatchedAvoirItems
            : (avoirSapItems || []).filter(it => it && it.matched === false);
        detailSection = buildItemsTable('Articles de l\'avoir non présents dans la facture initiale', unmatchedItems, false);
    }

    return `
        ${headerBlock}
        ${detailSection}
        <p style="margin-top:14px;font-style:italic;color:#555;">Notification automatique générée par l'application E-Facture lors du blocage d'un avoir incohérent côté SAP.</p>
    `;
}

async function sendWithRetry(payload) {
    let lastErr;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            const resp = await axios.post(NOTIFICATION_URL, payload, {
                headers: { 'Content-Type': 'application/json' },
                timeout: TIMEOUT_MS
            });
            return { ok: true, status: resp.status, data: resp.data };
        } catch (e) {
            lastErr = e;
            const status = e.response?.status;
            if (attempt === MAX_RETRIES) break;
            console.warn(`[notifyAvoirBlocked] tentative ${attempt}/${MAX_RETRIES} échouée (status=${status || e.code || 'n/a'}), retry dans ${RETRY_BACKOFF_MS}ms`);
            await sleep(RETRY_BACKOFF_MS);
        }
    }
    return { ok: false, error: lastErr?.response?.data || lastErr?.message || 'erreur inconnue' };
}

async function notifyAvoirBlocked(payload) {
    const numero = payload?.avoir?.numero || 'inconnu';
    const html = buildBlockedAvoirHtml(payload);
    const subjectLabel = payload?.blockedKind === 'UNIT_MISMATCH'
        ? 'Avoir bloqué (unités divergentes)'
        : 'Avoir bloqué (incohérence FNE)';
    const result = await sendWithRetry({
        key: NOTIFICATION_KEY,
        object: `${subjectLabel} — ${numero}`,
        message: html
    });
    if (result.ok) {
        console.log(`[notifyAvoirBlocked] OK avoir=${numero} status=${result.status}`);
    } else {
        console.error(`[notifyAvoirBlocked] échec avoir=${numero} après ${MAX_RETRIES} tentatives :`, result.error);
    }
    return result;
}

module.exports = {
    notifyAvoirBlocked,
    buildBlockedAvoirHtml,
    NOTIFICATION_KEY
};
