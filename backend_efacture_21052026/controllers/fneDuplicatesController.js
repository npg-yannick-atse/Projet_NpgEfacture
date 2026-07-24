const { FneInvoice, FneInvoiceItem, LogsAction } = require('../models');
const { Op, fn, col, literal } = require('sequelize');
const axios = require('axios');

const FNE_API_BASE = process.env.FNE_API_URL || 'https://www.services.fne.dgi.gouv.ci/ws/external/invoices/sign';
const FNE_API_TOKEN = process.env.FNE_API_TOKEN || '';

// GET /api/fne/duplicates — liste les numero_facture ayant >1 signature FNE
exports.listDuplicates = async (req, res) => {
    try {
        // Étape 1 : numero_facture avec count >1 dans fne_invoices.
        // On exclut les avoirs (type='refund') du calcul de doublon — un doublon
        // d'avoir n'existe pas au sens "facture envoyée 2 fois à la FNE".
        const dupGroups = await FneInvoice.findAll({
            attributes: [
                'numero_facture',
                [fn('COUNT', col('fne_invoice_id')), 'nb'],
            ],
            where: { type: 'invoice' },
            group: ['numero_facture'],
            having: literal('COUNT(fne_invoice_id) > 1'),
            raw: true,
        });

        if (dupGroups.length === 0) {
            return res.json({ success: true, data: [] });
        }

        const numeros = dupGroups.map(g => g.numero_facture);

        // Étape 2 : charger toutes les entrées FNE (factures uniquement) + logs refund associés
        const fneRows = await FneInvoice.findAll({
            where: { numero_facture: { [Op.in]: numeros }, type: 'invoice' },
            order: [['numero_facture', 'ASC'], ['created_at', 'ASC']],
            raw: true,
        });

        const refundLogs = await LogsAction.findAll({
            where: {
                numero_facture: { [Op.in]: numeros },
                invoice_type: 'refund',
            },
            raw: true,
        });

        // Indexer refunds par fne_invoice_id annulé → détails de l'annulation
        const cancellationById = {};
        for (const log of refundLogs) {
            try {
                const resp = typeof log.api_response === 'string'
                    ? JSON.parse(log.api_response)
                    : log.api_response;
                if (resp?.cancelled_fne_invoice_id) {
                    cancellationById[resp.cancelled_fne_invoice_id] = {
                        cancellation_reference: resp.reference || resp.fne_response?.reference || null,
                        cancelled_at: log.SendOn,
                        cancelled_by: log.SendBy,
                        reason: resp.reason || null,
                    };
                }
            } catch { /* ignore */ }
        }

        // Regrouper par numero_facture
        const byNumero = {};
        for (const r of fneRows) {
            if (!byNumero[r.numero_facture]) byNumero[r.numero_facture] = [];
            const cancel = cancellationById[r.fne_invoice_id];

            // Extraire le montant TTC depuis la réponse FNE.
            // FNE renvoie totalDue / totalAfterTaxes au niveau invoice.
            let amount = null;
            try {
                const ar = typeof r.api_response === 'string'
                    ? JSON.parse(r.api_response)
                    : r.api_response;
                const inv = ar?.invoice || ar?.response?.invoice || null;
                if (inv) {
                    amount = inv.totalDue ?? inv.totalAfterTaxes ?? inv.amount ?? null;
                } else {
                    amount = ar?.totalDue ?? ar?.totalAfterTaxes ?? ar?.amount ?? null;
                }
            } catch { /* ignore */ }

            byNumero[r.numero_facture].push({
                fne_invoice_id: r.fne_invoice_id,
                fne_reference: r.fne_reference,
                fne_ncc: r.fne_ncc,
                amount: amount != null ? Number(amount) : null,
                created_at: r.created_at,
                cancelled: !!cancel,
                cancellation_reference: cancel?.cancellation_reference || null,
                cancelled_at: cancel?.cancelled_at || null,
                cancelled_by: cancel?.cancelled_by || null,
                cancellation_reason: cancel?.reason || null,
            });
        }

        const result = numeros.map(num => {
            const entries = byNumero[num] || [];
            const refs = entries.map(e => e.fne_reference).filter(Boolean);
            const distinctRefs = [...new Set(refs)];
            let category = 'NO_REFERENCE';
            if (refs.length === entries.length && distinctRefs.length === 1) category = 'SAME_REFERENCE';
            else if (distinctRefs.length > 1) category = 'DIFFERENT_REFERENCE';
            else if (refs.length > 0 && refs.length < entries.length) category = 'MIXED';

            // "Traité" = tous les doublons (index > 0) sont annulés.
            // La 1ère entrée (originale) n'a jamais à être annulée.
            const duplicateEntries = entries.slice(1);
            const treated = duplicateEntries.length > 0 && duplicateEntries.every(e => e.cancelled);
            const hasAnyCancelled = entries.some(e => e.cancelled);

            return {
                numero_facture: num,
                nb_entries: entries.length,
                category,
                entries,
                treated,
                has_any_cancelled: hasAnyCancelled,
                all_cancelled: entries.every(e => e.cancelled),
            };
        });

        res.json({ success: true, data: result });
    } catch (err) {
        console.error('listDuplicates error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
};

// POST /api/fne/cancel-duplicate
// body: { fne_invoice_id, reason }
exports.cancelDuplicate = async (req, res) => {
    try {
        const { fne_invoice_id, reason } = req.body;

        if (!fne_invoice_id) {
            return res.status(400).json({ success: false, error: 'MISSING_FNE_INVOICE_ID' });
        }

        const fne = await FneInvoice.findOne({ where: { fne_invoice_id } });
        if (!fne) {
            return res.status(404).json({
                success: false,
                error: 'FNE_INVOICE_NOT_FOUND',
                message: `Aucune facture FNE avec id=${fne_invoice_id}`,
            });
        }

        // Vérifier qu'il existe au moins UN AUTRE fne_invoice_id pour le même numero_facture
        // (évite d'annuler la seule signature par erreur)
        const siblings = await FneInvoice.count({
            where: {
                numero_facture: fne.numero_facture,
                fne_invoice_id: { [Op.ne]: fne_invoice_id },
            },
        });

        if (siblings === 0) {
            return res.status(409).json({
                success: false,
                error: 'NO_SIBLING',
                message: `Cette facture FNE est la seule signature existante pour ${fne.numero_facture}. Annulation bloquée.`,
            });
        }

        // Récupérer les items à refund (100% des quantités)
        const items = await FneInvoiceItem.findAll({
            where: { fne_invoice_id },
            raw: true,
        });

        if (items.length === 0) {
            return res.status(409).json({
                success: false,
                error: 'NO_ITEMS',
                message: 'Aucun item en base pour cette facture FNE — annulation impossible via /refund.',
            });
        }

        const refundPayload = {
            items: items
                .map(it => ({
                    id: it.fne_item_id,
                    quantity: Math.round(parseFloat(it.quantity || 0)),
                }))
                .filter(it => it.quantity > 0),
        };

        if (refundPayload.items.length === 0) {
            return res.status(409).json({
                success: false,
                error: 'ZERO_QUANTITIES',
                message: 'Toutes les quantités sont à 0 — impossible de refund.',
            });
        }

        // Appel FNE
        const refundUrl = FNE_API_BASE.replace(/\/sign\/?$/, '') + `/${fne_invoice_id}/refund`;

        let fneResponse;
        let fneDurationMs = null;
        const fneStart = Date.now();
        try {
            const resp = await axios.post(refundUrl, refundPayload, {
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                    'Authorization': `Bearer ${FNE_API_TOKEN}`,
                },
                timeout: 30000,
            });
            fneResponse = resp.data;
            fneDurationMs = Date.now() - fneStart;
        } catch (apiErr) {
            fneDurationMs = Date.now() - fneStart;
            console.error(`FNE refund error (${fneDurationMs}ms):`, apiErr.response?.data || apiErr.message);
            // On logge quand même l'échec pour trace
            await LogsAction.create({
                username: req.auth.username,
                numero_facture: fne.numero_facture,
                SendBy: req.auth.username,
                SendOn: new Date(),
                api_response: JSON.stringify({
                    success: false,
                    cancellation: true,
                    cancelled_fne_invoice_id: fne_invoice_id,
                    cancelled_fne_reference: fne.fne_reference,
                    reason: reason || null,
                    error: apiErr.response?.data || apiErr.message,
                    http_status: apiErr.response?.status || null,
                }),
                invoice_type: 'refund',
                created_by: req.auth.username,
                fne_response_time_ms: fneDurationMs,
            });

            return res.status(apiErr.response?.status || 502).json({
                success: false,
                error: 'FNE_API_ERROR',
                message: 'La FNE a refusé l\'annulation.',
                details: apiErr.response?.data || apiErr.message,
            });
        }

        // Succès — on extrait la référence de l'avoir au top-level pour que
        // l'affichage "Factures Envoyées" puisse la récupérer directement.
        await LogsAction.create({
            username: req.auth.username,
            numero_facture: fne.numero_facture,
            SendBy: req.auth.username,
            SendOn: new Date(),
            api_response: JSON.stringify({
                success: true,
                // Top-level pour compatibilité avec l'extraction reference/ncc/token
                reference: fneResponse?.reference || null,
                ncc: fneResponse?.ncc || null,
                token: fneResponse?.token || null,
                balance_sticker: fneResponse?.balance_sticker,
                // Métadonnées d'annulation
                cancellation: true,
                cancelled_fne_invoice_id: fne_invoice_id,
                cancelled_fne_reference: fne.fne_reference,
                facture_initiale: fne.numero_facture,
                reason: reason || null,
                fne_response: fneResponse,
                refund_items: refundPayload.items,
            }),
            invoice_type: 'refund',
            created_by: req.auth.username,
            fne_response_time_ms: fneDurationMs,
        });

        console.log(`[FNE_CANCEL] ${req.auth.username} a annulé ${fne_invoice_id} (ref=${fne.fne_reference}) pour ${fne.numero_facture} en ${fneDurationMs}ms`);

        res.json({
            success: true,
            message: `Annulation effectuée. Nouvelle référence avoir : ${fneResponse?.reference || '(voir réponse)'}`,
            data: {
                cancelled_fne_invoice_id: fne_invoice_id,
                cancelled_fne_reference: fne.fne_reference,
                fne_response: fneResponse,
            },
        });
    } catch (err) {
        console.error('cancelDuplicate error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
};
