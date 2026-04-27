const { InvoiceType, DownloadedInvoice } = require('../models');

// GET /api/invoice-types — catalogue (liste publique pour l'Accueil)
exports.list = async (req, res) => {
    try {
        const { all } = req.query; // ?all=1 inclut les désactivés
        const where = all ? {} : { active: true };
        const types = await InvoiceType.findAll({
            where,
            order: [['display_order', 'ASC'], ['label', 'ASC']],
        });
        res.json({ success: true, data: types });
    } catch (err) {
        console.error('InvoiceType.list error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
};

// GET /api/invoice-types/stats — totaux par type avec fallback dynamique sur JSON data
//   - downloaded : nombre total de factures téléchargées (toutes périodes)
//   - errors     : nombre de factures avec au moins un envoi en erreur
//
// Pour les anciennes lignes sans invoice_type_code, on extrait dynamiquement le
// point_of_sale depuis le JSON data (même logique que les listes filtrées).
const sequelize = require('../models').sequelize;

// SQL d'extraction du type effectif (priorité : invoice_type_code, puis JSON, normalisé)
const TYPE_CODE_EXPR = `
  COALESCE(
    NULLIF(invoice_type_code, ''),
    CASE
      WHEN JSON_UNQUOTE(JSON_EXTRACT(data, '$[0].point_of_sale')) = 'NPG'
        THEN 'NPG_SIEGE_FACTURATION'
      WHEN JSON_UNQUOTE(JSON_EXTRACT(data, '$[0].point_of_sale')) IN ('NPG_SIEGE_FACTURATION','NPG_SALE','SURCCUSALE','FACTURE_EXPORT')
        THEN JSON_UNQUOTE(JSON_EXTRACT(data, '$[0].point_of_sale'))
      WHEN JSON_UNQUOTE(JSON_EXTRACT(data, '$[0].PointOfSale')) IS NOT NULL
        AND JSON_UNQUOTE(JSON_EXTRACT(data, '$[0].PointOfSale')) <> 'null'
        THEN JSON_UNQUOTE(JSON_EXTRACT(data, '$[0].PointOfSale'))
      ELSE 'NPG_SIEGE_FACTURATION'
    END
  )
`;

exports.stats = async (req, res) => {
    try {
        // 1) Téléchargements par type (avec fallback JSON)
        const [downloadedRows] = await sequelize.query(`
            SELECT ${TYPE_CODE_EXPR} AS type_code, COUNT(id) AS cnt
            FROM downloaded_invoices
            GROUP BY type_code
        `);
        const downloaded = {};
        for (const r of downloadedRows) {
            downloaded[r.type_code || 'UNKNOWN'] = parseInt(r.cnt, 10);
        }

        // 2) Factures en erreur par type — définition C :
        //    Facture JAMAIS certifiée par la FNE (pas d'entrée fne_invoices)
        //    ET ayant au moins une tentative d'envoi en erreur (logs_actions.erreur = 1)
        const [errorRows] = await sequelize.query(`
            SELECT ${TYPE_CODE_EXPR} AS type_code, COUNT(DISTINCT di.id) AS cnt
            FROM downloaded_invoices di
            WHERE EXISTS (
              SELECT 1 FROM logs_actions la
              WHERE la.numero_facture = di.numero
                AND la.SendBy IS NOT NULL
                AND la.erreur = 1
            )
            AND NOT EXISTS (
              SELECT 1 FROM fne_invoices fi
              WHERE fi.numero_facture = di.numero
            )
            GROUP BY type_code
        `);
        const errors = {};
        for (const r of errorRows) {
            errors[r.type_code || 'UNKNOWN'] = parseInt(r.cnt, 10);
        }

        res.json({ success: true, data: { downloaded, errors } });
    } catch (err) {
        console.error('InvoiceType.stats error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
};

// POST /api/invoice-types — création (admin)
exports.create = async (req, res) => {
    try {
        const { code, label, icon_name, color_hex, display_order, active } = req.body;
        if (!code || !label) {
            return res.status(400).json({ success: false, error: 'MISSING_FIELDS', message: 'code et label requis' });
        }

        const existing = await InvoiceType.findOne({ where: { code } });
        if (existing) {
            return res.status(409).json({ success: false, error: 'DUPLICATE_CODE', message: `Le code ${code} existe déjà.` });
        }

        const t = await InvoiceType.create({
            code, label,
            icon_name: icon_name || null,
            color_hex: color_hex || '#1976d2',
            display_order: display_order ?? 100,
            active: active !== false,
        });
        console.log(`[INVOICE_TYPE] ${req.auth.username} a créé ${code}`);
        res.status(201).json({ success: true, data: t });
    } catch (err) {
        console.error('InvoiceType.create error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
};

// PUT /api/invoice-types/:id — modification (admin)
exports.update = async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        const t = await InvoiceType.findByPk(id);
        if (!t) return res.status(404).json({ success: false, error: 'NOT_FOUND' });

        const { label, icon_name, color_hex, display_order, active } = req.body;
        const patch = {};
        if (label !== undefined)         patch.label = label;
        if (icon_name !== undefined)     patch.icon_name = icon_name;
        if (color_hex !== undefined)     patch.color_hex = color_hex;
        if (display_order !== undefined) patch.display_order = display_order;
        if (active !== undefined)        patch.active = !!active;

        await t.update(patch);
        console.log(`[INVOICE_TYPE] ${req.auth.username} a modifié ${t.code}`);
        res.json({ success: true, data: t });
    } catch (err) {
        console.error('InvoiceType.update error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
};

// DELETE /api/invoice-types/:id — soft delete via active=false si déjà référencé
exports.remove = async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        const t = await InvoiceType.findByPk(id);
        if (!t) return res.status(404).json({ success: false, error: 'NOT_FOUND' });

        // Vérifier si des factures utilisent ce type → soft delete (désactivation)
        const used = await DownloadedInvoice.count({ where: { invoice_type_code: t.code } });
        if (used > 0) {
            await t.update({ active: false });
            return res.json({
                success: true,
                softDeleted: true,
                message: `Type utilisé par ${used} facture(s) : désactivé plutôt que supprimé.`,
            });
        }

        await t.destroy();
        console.log(`[INVOICE_TYPE] ${req.auth.username} a supprimé ${t.code}`);
        res.json({ success: true, softDeleted: false });
    } catch (err) {
        console.error('InvoiceType.remove error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
};
