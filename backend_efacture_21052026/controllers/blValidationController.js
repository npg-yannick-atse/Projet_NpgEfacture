const db = require('../models');
const { Op, QueryTypes } = require('sequelize');

const { BlValidation, SapVbrpItem, SapVbrkHeader, DownloadedInvoice, InvoiceTotals, FneInvoice } = db;

/** Référence + token FNE (type facture) les plus récents pour une facture. */
async function getFne(numeroFacture) {
  // Pas de filtre sur le type : un avoir a son enregistrement FNE en type='refund'
  // (sous le numéro de l'avoir). On prend le plus récent pour ce numéro.
  const fne = await FneInvoice.findOne({
    where: { numero_facture: numeroFacture },
    attributes: ['fne_reference', 'fne_token', 'created_at'],
    order: [['created_at', 'DESC']],
    raw: true,
  });
  return {
    fne_reference: fne?.fne_reference || null,
    fne_token: fne?.fne_token || null,
    fne_send_date: fne?.created_at || null,
  };
}

/**
 * Récupère le(s) numéro(s) de BL (VGBEL) d'une facture depuis les lignes SAP
 * (sap_vbrp_item). VGBEL = document de référence = Bon de Livraison.
 * Retourne un tableau de BL distincts, hors valeurs vides / tout-à-zéro.
 */
async function getBlNumbers(numeroFacture) {
  const rows = await SapVbrpItem.findAll({
    where: { VBELN: numeroFacture },
    attributes: ['VGBEL'],
    raw: true,
  });
  const set = new Set();
  for (const r of rows) {
    const vgbel = (r.VGBEL || '').trim();
    if (vgbel && !/^0+$/.test(vgbel)) set.add(vgbel);
  }
  return [...set];
}

/** Infos d'affichage (client, date) depuis downloaded_invoices puis fallback SAP. */
async function getInvoiceInfo(numeroFacture) {
  let client = null;
  let date = null;
  let found = false;

  const dl = await DownloadedInvoice.findOne({
    where: { numero: numeroFacture },
    attributes: ['client', 'download_date'],
    raw: true,
  });
  if (dl) {
    found = true;
    client = dl.client || null;
    date = dl.download_date || null;
  }

  if (!client || !date) {
    const vbrk = await SapVbrkHeader.findOne({
      where: { VBELN: numeroFacture },
      attributes: ['NAMRG', 'FKDAT'],
      raw: true,
    });
    if (vbrk) {
      found = true;
      if (!client) client = vbrk.NAMRG || null;
      if (!date) date = vbrk.FKDAT || null;
    }
  }

  // Montant + point de vente depuis invoice_totals (valeurs déjà au format affiché).
  let total = null;
  let pointOfSale = null;
  const totals = await InvoiceTotals.findOne({
    where: { numero_facture: numeroFacture },
    attributes: ['total_a_payer', 'total_ttc', 'point_of_sale'],
    raw: true,
  });
  if (totals) {
    found = true;
    if (totals.total_a_payer != null) total = Number(totals.total_a_payer);
    else if (totals.total_ttc != null) total = Number(totals.total_ttc);
    pointOfSale = totals.point_of_sale || null;
  }

  return { client, date, total, point_of_sale: pointOfSale, found };
}

function serialize(v) {
  if (!v) return null;
  return {
    numero_facture: v.numero_facture,
    numero_bl: v.numero_bl,
    statut: v.statut,
    logistique_valide_by: v.logistique_valide_by,
    logistique_valide_on: v.logistique_valide_on,
    commercial_valide_by: v.commercial_valide_by,
    commercial_valide_on: v.commercial_valide_on,
    comptabilite_valide_by: v.comptabilite_valide_by,
    comptabilite_valide_on: v.comptabilite_valide_on,
    imprime_by: v.imprime_by,
    imprime_on: v.imprime_on,
    print_count: v.print_count || 0,
    created_on: v.created_on,
    updated_on: v.updated_on,
  };
}

/**
 * GET /api/bl-validations/invoice/:numero
 * Renvoie les infos de la facture (client, date, BL SAP) + l'état de validation courant.
 */
exports.getInvoiceForValidation = async (req, res) => {
  try {
    const raw = (req.params.numero || '').trim();
    if (!raw) {
      return res.status(400).json({ success: false, error: 'Numéro de facture ou de BL requis' });
    }

    // 1) Essai direct comme NUMÉRO DE FACTURE.
    let numero = raw;
    let blNumbers = await getBlNumbers(numero);
    let info = await getInvoiceInfo(numero);

    // 2) Rien trouvé ? Tenter une résolution par NUMÉRO DE BL (VGBEL → VBELN dans SAP).
    let resolvedFromBl = null;
    if (!info.found && blNumbers.length === 0) {
      const byBl = await SapVbrpItem.findAll({
        where: { VGBEL: raw },
        attributes: ['VBELN'],
        raw: true,
      });
      const vbelns = [...new Set(byBl.map(r => (r.VBELN || '').trim()).filter(v => v && !/^0+$/.test(v)))];
      if (vbelns.length === 1) {
        numero = vbelns[0];
        resolvedFromBl = raw;
        blNumbers = await getBlNumbers(numero);
        info = await getInvoiceInfo(numero);
      } else if (vbelns.length > 1) {
        // Plusieurs factures pour ce BL → on renvoie la liste pour laisser l'utilisateur choisir.
        return res.json({
          success: true,
          data: { multiple: true, searched_bl: raw, matches: vbelns },
        });
      }
    }

    const [validation, fne] = await Promise.all([
      BlValidation.findOne({ where: { numero_facture: numero } }),
      getFne(numero),
    ]);

    return res.json({
      success: true,
      data: {
        numero_facture: numero,
        searched_bl: resolvedFromBl,
        client: info.client,
        date: info.date,
        total: info.total,
        point_of_sale: info.point_of_sale,
        fne_reference: fne.fne_reference,
        fne_token: fne.fne_token,
        fne_send_date: fne.fne_send_date,
        found: info.found || blNumbers.length > 0,
        bl: blNumbers,
        bl_text: blNumbers.join(', '),
        found_in_sap: blNumbers.length > 0,
        validation: serialize(validation),
      },
    });
  } catch (error) {
    console.error('getInvoiceForValidation:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * POST /api/bl-validations/invoice/:numero/logistique
 * 1ère étape : validation Logistique. Possible uniquement si statut = en_attente.
 */
exports.validateLogistique = async (req, res) => {
  try {
    const numero = (req.params.numero || '').trim();
    if (!numero) {
      return res.status(400).json({ success: false, error: 'Numéro de facture requis' });
    }
    const username = req.auth?.username || req.headers['username'] || 'inconnu';

    let validation = await BlValidation.findOne({ where: { numero_facture: numero } });

    if (validation && validation.statut !== 'en_attente') {
      return res.status(409).json({
        success: false,
        error: 'ALREADY_VALIDATED',
        message: 'La validation logistique a déjà été effectuée pour cette facture.',
        data: serialize(validation),
      });
    }

    // Snapshot des BL SAP au moment de la 1ère validation.
    const blNumbers = await getBlNumbers(numero);

    // Validation possible uniquement pour une facture connue localement (téléchargée).
    if (!validation) {
      const info = await getInvoiceInfo(numero);
      if (!(info.found || blNumbers.length > 0)) {
        return res.status(404).json({
          success: false,
          error: 'NOT_DOWNLOADED',
          message: 'Facture non téléchargée — validation impossible.',
        });
      }
    }

    const now = new Date();

    if (!validation) {
      validation = await BlValidation.create({
        numero_facture: numero,
        numero_bl: blNumbers.join(', ') || null,
        statut: 'valide_logistique',
        logistique_valide_by: username,
        logistique_valide_on: now,
        created_on: now,
        updated_on: now,
      });
    } else {
      validation.numero_bl = validation.numero_bl || (blNumbers.join(', ') || null);
      validation.statut = 'valide_logistique';
      validation.logistique_valide_by = username;
      validation.logistique_valide_on = now;
      validation.updated_on = now;
      await validation.save();
    }

    return res.json({
      success: true,
      message: 'Validation logistique enregistrée.',
      data: serialize(validation),
    });
  } catch (error) {
    console.error('validateLogistique:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * POST /api/bl-validations/invoice/:numero/commercial
 * 2ème étape : validation Commerciale. Possible uniquement si statut = valide_logistique.
 */
exports.validateCommercial = async (req, res) => {
  try {
    const numero = (req.params.numero || '').trim();
    if (!numero) {
      return res.status(400).json({ success: false, error: 'Numéro de facture requis' });
    }
    const username = req.auth?.username || req.headers['username'] || 'inconnu';

    const validation = await BlValidation.findOne({ where: { numero_facture: numero } });

    if (!validation || validation.statut === 'en_attente') {
      return res.status(409).json({
        success: false,
        error: 'LOGISTIQUE_REQUIRED',
        message: 'La validation logistique doit être effectuée avant la validation commerciale.',
        data: serialize(validation),
      });
    }

    if (validation.statut === 'valide_commercial' || validation.statut === 'valide') {
      return res.status(409).json({
        success: false,
        error: 'ALREADY_VALIDATED',
        message: 'La validation commerciale a déjà été effectuée pour cette facture.',
        data: serialize(validation),
      });
    }

    // Ici statut === 'valide_logistique'
    const now = new Date();
    validation.statut = 'valide_commercial';
    validation.commercial_valide_by = username;
    validation.commercial_valide_on = now;
    validation.updated_on = now;
    await validation.save();

    return res.json({
      success: true,
      message: 'Validation commerciale enregistrée.',
      data: serialize(validation),
    });
  } catch (error) {
    console.error('validateCommercial:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * POST /api/bl-validations/invoice/:numero/comptabilite
 * 3ème étape : validation Comptabilité. Possible uniquement si statut = valide_commercial.
 */
exports.validateComptabilite = async (req, res) => {
  try {
    const numero = (req.params.numero || '').trim();
    if (!numero) {
      return res.status(400).json({ success: false, error: 'Numéro de facture requis' });
    }
    const username = req.auth?.username || req.headers['username'] || 'inconnu';

    const validation = await BlValidation.findOne({ where: { numero_facture: numero } });

    if (!validation || validation.statut === 'en_attente' || validation.statut === 'valide_logistique') {
      return res.status(409).json({
        success: false,
        error: 'COMMERCIAL_REQUIRED',
        message: 'La validation commerciale doit être effectuée avant la validation comptabilité.',
        data: serialize(validation),
      });
    }

    if (validation.statut === 'valide') {
      return res.status(409).json({
        success: false,
        error: 'ALREADY_VALIDATED',
        message: 'La validation comptabilité a déjà été effectuée pour cette facture.',
        data: serialize(validation),
      });
    }

    // Ici statut === 'valide_commercial'
    const now = new Date();
    validation.statut = 'valide';
    validation.comptabilite_valide_by = username;
    validation.comptabilite_valide_on = now;
    validation.updated_on = now;
    await validation.save();

    return res.json({
      success: true,
      message: 'Validation comptabilité enregistrée.',
      data: serialize(validation),
    });
  } catch (error) {
    console.error('validateComptabilite:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * POST /api/bl-validations/invoice/:numero/print
 * Trace l'impression de la facture FNE (qui / quand) dans bl_validations.
 * Upsert : met à jour la ligne existante, ou en crée une (statut en_attente) si besoin.
 */
exports.recordPrint = async (req, res) => {
  try {
    const numero = (req.params.numero || '').trim();
    if (!numero) {
      return res.status(400).json({ success: false, error: 'Numéro de facture requis' });
    }
    const username = req.auth?.username || req.headers['username'] || 'inconnu';
    const now = new Date();

    let validation = await BlValidation.findOne({ where: { numero_facture: numero } });
    if (!validation) {
      const blNumbers = await getBlNumbers(numero);
      validation = await BlValidation.create({
        numero_facture: numero,
        numero_bl: blNumbers.join(', ') || null,
        statut: 'en_attente',
        imprime_by: username,
        imprime_on: now,
        print_count: 1,
        created_on: now,
        updated_on: now,
      });
    } else {
      validation.imprime_by = username;
      validation.imprime_on = now;
      validation.print_count = (validation.print_count || 0) + 1;
      validation.updated_on = now;
      await validation.save();
    }

    return res.json({ success: true, message: 'Impression enregistrée.', data: serialize(validation) });
  } catch (error) {
    console.error('recordPrint:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * GET /api/bl-validations
 * Historique des validations, avec filtres optionnels : statut, search (n° facture/BL), dates.
 */
exports.list = async (req, res) => {
  try {
    const { statut, search, startDate, endDate } = req.query;
    const where = {};

    // Logique inclusive :
    //   'valide_logistique' = la logistique A validé (qu'elle soit complète ou non)
    //   'valide'            = complètement validée (commercial fait)
    //   'en_attente'        = aucune validation (cas rare : une ligne existe dès la 1ère validation)
    if (statut === 'valide_logistique') {
      where.statut = { [Op.in]: ['valide_logistique', 'valide_commercial', 'valide'] };
    } else if (statut === 'valide_commercial') {
      where.statut = { [Op.in]: ['valide_commercial', 'valide'] };
    } else if (statut === 'valide') {
      where.statut = 'valide';
    } else if (statut === 'en_attente') {
      where.statut = 'en_attente';
    }
    if (search && search.trim()) {
      const term = `%${search.trim()}%`;
      where[Op.or] = [
        { numero_facture: { [Op.like]: term } },
        { numero_bl: { [Op.like]: term } },
      ];
    }
    if (startDate || endDate) {
      where.created_on = {};
      if (startDate) {
        const s = new Date(startDate); s.setHours(0, 0, 0, 0);
        where.created_on[Op.gte] = s;
      }
      if (endDate) {
        const e = new Date(endDate); e.setHours(23, 59, 59, 999);
        where.created_on[Op.lte] = e;
      }
    }

    const rows = await BlValidation.findAll({
      where,
      order: [['updated_on', 'DESC'], ['created_on', 'DESC']],
      raw: true,
    });

    // Enrichir avec la référence + le token FNE (type facture), en masse.
    const numeros = [...new Set(rows.map(r => r.numero_facture))];
    const fneMap = {};
    if (numeros.length > 0) {
      const fnes = await FneInvoice.findAll({
        where: { numero_facture: { [Op.in]: numeros }, type: 'invoice' },
        attributes: ['numero_facture', 'fne_reference', 'fne_token', 'created_at'],
        order: [['created_at', 'ASC']], // ASC + écrasement ⇒ on garde la plus récente
        raw: true,
      });
      for (const f of fnes) {
        fneMap[f.numero_facture] = { fne_reference: f.fne_reference, fne_token: f.fne_token };
      }
    }

    const data = rows.map(r => ({
      ...serialize(r),
      fne_reference: fneMap[r.numero_facture]?.fne_reference || null,
      fne_token: fneMap[r.numero_facture]?.fne_token || null,
    }));

    return res.json({ success: true, data, count: data.length });
  } catch (error) {
    console.error('list bl-validations:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * GET /api/bl-validations/exports
 * Liste des factures EXPORT certifiées (invoice_type_code='FACTURE_EXPORT' + certificat FNE),
 * pour affichage + impression sur "Statut Facture" — SANS validation BL (l'export n'a pas
 * de BL SAP). SQL BRUT (prod-safe : le modèle DownloadedInvoice sélectionne is_sent, absente
 * en prod). Filtres : search (n°/client), dates ; pagination limit/offset.
 */
exports.listExports = async (req, res) => {
  try {
    const seq = db.sequelize;
    const { search, startDate, endDate } = req.query;
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 100, 1), 500);
    const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);

    const repl = { limit, offset };
    let extra = '';
    if (search && String(search).trim()) { extra += ' AND (d.numero LIKE :s OR d.client LIKE :s)'; repl.s = `%${String(search).trim()}%`; }
    if (startDate) { extra += ' AND d.download_date >= :sd'; repl.sd = `${startDate} 00:00:00`; }
    if (endDate)   { extra += ' AND d.download_date <= :ed'; repl.ed = `${endDate} 23:59:59`; }

    const baseFrom = `
      FROM downloaded_invoices d
      WHERE d.invoice_type_code = 'FACTURE_EXPORT'
        AND EXISTS (SELECT 1 FROM fne_invoices f WHERE f.numero_facture = d.numero AND f.type = 'invoice')
        ${extra}`;

    const rows = await seq.query(
      `SELECT d.numero AS numero_facture, d.client, d.download_date AS date, d.invoice_type_code AS point_of_sale,
              (SELECT f.fne_reference FROM fne_invoices f WHERE f.numero_facture = d.numero AND f.type = 'invoice' ORDER BY f.created_at DESC LIMIT 1) AS fne_reference,
              (SELECT f.fne_token     FROM fne_invoices f WHERE f.numero_facture = d.numero AND f.type = 'invoice' ORDER BY f.created_at DESC LIMIT 1) AS fne_token,
              (SELECT l.total_ttc FROM logs_actions l WHERE l.numero_facture = d.numero AND l.SendBy IS NOT NULL AND l.invoice_type = 'invoice' ORDER BY l.id DESC LIMIT 1) AS total_ttc_raw
       ${baseFrom}
       ORDER BY d.id DESC
       LIMIT :limit OFFSET :offset`,
      { replacements: repl, type: QueryTypes.SELECT });

    const cnt = await seq.query(`SELECT COUNT(*) AS total ${baseFrom}`, { replacements: repl, type: QueryTypes.SELECT });
    const total = cnt[0] ? Number(cnt[0].total) : 0;

    const data = rows.map(r => ({
      numero_facture: r.numero_facture,
      client: r.client,
      date: r.date,
      point_of_sale: r.point_of_sale,
      fne_reference: r.fne_reference,
      fne_token: r.fne_token,
      // total_ttc est stocké ×10 (règle applicative) → on divise pour l'affichage.
      total: (r.total_ttc_raw != null) ? Number(r.total_ttc_raw) / 10 : null,
      found: true,
    }));
    return res.json({ success: true, data, count: data.length, total });
  } catch (error) {
    console.error('listExports bl-validations:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
};
