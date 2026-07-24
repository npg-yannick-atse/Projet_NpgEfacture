const { Op } = require('sequelize');
const db = require('../models');
const { checkSapInvoiceExists } = require('../services/checkSapInvoice');
const { notifyNonFneBlocked } = require('../services/notifyNonFneBlocked');

const { AutoDownloadFlagged, LogsAction, DownloadedInvoice } = db;

// Liste des factures signalées (manuelles 'non_fne' + 'avoir'/'probleme' du job).
exports.list = async (req, res) => {
  try {
    const { search, kind, startDate, endDate } = req.query;
    const where = {};
    if (kind && ['avoir', 'probleme', 'non_fne'].includes(kind)) where.kind = kind;
    if (search && search.trim()) {
      where.numero_facture = { [Op.like]: `%${search.trim()}%` };
    }
    // Filtre par date d'enregistrement (created_at). Par défaut le frontend envoie le jour courant.
    if (startDate || endDate) {
      where.created_at = {};
      if (startDate) { const s = new Date(startDate); s.setHours(0, 0, 0, 0); where.created_at[Op.gte] = s; }
      if (endDate) { const e = new Date(endDate); e.setHours(23, 59, 59, 999); where.created_at[Op.lte] = e; }
    }
    const rows = await AutoDownloadFlagged.findAll({ where, order: [['created_at', 'DESC']], raw: true });
    res.json({ success: true, data: rows });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
};

// Vérifier une facture (avant enregistrement) : existence SAP + nom client + statut.
exports.check = async (req, res) => {
  try {
    const numero = (req.body && req.body.numero_facture || '').trim();
    if (!numero) return res.status(400).json({ success: false, error: 'Numéro de facture requis' });

    const sent = await LogsAction.findOne({
      where: { numero_facture: numero, SendBy: { [Op.ne]: null } }, attributes: ['id'],
    });
    const downloaded = await DownloadedInvoice.findOne({ where: { numero }, attributes: ['client'] });

    let sap;
    try {
      sap = await checkSapInvoiceExists(numero);
    } catch (e) {
      return res.status(502).json({ success: false, error: 'SAP_ERROR', message: `Vérification SAP impossible : ${e.message}` });
    }

    return res.json({
      success: true,
      exists: !!sap.exists,
      clientName: sap.clientName || downloaded?.client || null,
      fkart: sap.fkart || null,
      alreadySent: !!sent,
      alreadyDownloaded: !!downloaded,
    });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
};

// Ajouter une facture "à ne pas envoyer à la FNE" (kind = non_fne). Upsert par numéro.
exports.add = async (req, res) => {
  try {
    const numero = (req.body && req.body.numero_facture || '').trim();
    if (!numero) return res.status(400).json({ success: false, error: 'Numéro de facture requis' });
    const createdBy = req.auth?.username || req.headers['username'] || null;

    // 1) Déjà ENVOYÉE à la FNE ? → notifier (mail) + bloquer l'enregistrement.
    const sent = await LogsAction.findOne({
      where: { numero_facture: numero, SendBy: { [Op.ne]: null } },
      attributes: ['id'],
    });
    if (sent) {
      const dl = await DownloadedInvoice.findOne({ where: { numero }, attributes: ['client'] });
      notifyNonFneBlocked({ numero, reason: 'envoyee', user: createdBy, client: dl?.client }).catch(() => {});
      return res.status(409).json({
        success: false, error: 'ALREADY_SENT',
        message: `La facture ${numero} a déjà été ENVOYÉE à la FNE — enregistrement impossible. Une notification a été envoyée par mail.`,
      });
    }

    // 2) Déjà TÉLÉCHARGÉE ? → notifier (mail) + bloquer.
    const downloaded = await DownloadedInvoice.findOne({ where: { numero }, attributes: ['client'] });
    if (downloaded) {
      notifyNonFneBlocked({ numero, reason: 'telechargee', user: createdBy, client: downloaded.client }).catch(() => {});
      return res.status(409).json({
        success: false, error: 'ALREADY_DOWNLOADED',
        message: `La facture ${numero} a déjà été TÉLÉCHARGÉE — enregistrement impossible. Une notification a été envoyée par mail.`,
      });
    }

    // 3) Existe dans SAP ? (sinon on n'enregistre pas un numéro inconnu)
    let sap;
    try {
      sap = await checkSapInvoiceExists(numero);
    } catch (e) {
      console.error(`[non-fne] add: échec vérif SAP ${numero}:`, e.message);
      return res.status(502).json({
        success: false, error: 'SAP_ERROR',
        message: `Impossible de vérifier la facture ${numero} dans SAP : ${e.message}`,
      });
    }
    console.log(`[non-fne] add: vérif SAP ${numero} → exists=${sap.exists}, client=${sap.clientName || 'N/A'}`);
    if (!sap.exists) {
      return res.status(404).json({
        success: false, error: 'NOT_IN_SAP',
        message: `La facture ${numero} n'existe pas dans SAP.`,
      });
    }

    // 4) OK → enregistrement en liste noire (Non FNE). Nom client depuis SAP si non fourni.
    const client = (req.body.client || '').trim() || sap.clientName || null;
    const detail = (req.body.detail || '').trim() || 'Saisie manuelle — à ne pas envoyer à la FNE';

    const existing = await AutoDownloadFlagged.findOne({ where: { numero_facture: numero } });
    if (existing) {
      await existing.update({ kind: 'non_fne', client, detail, created_by: createdBy });
      return res.json({ success: true, data: existing, message: 'Facture mise à jour (non FNE).' });
    }
    const row = await AutoDownloadFlagged.create({
      numero_facture: numero, kind: 'non_fne', client, type: sap.fkart || null, detail,
      created_by: createdBy, created_at: new Date(),
    });
    res.json({ success: true, data: row, message: 'Facture enregistrée (ne sera pas envoyée à la FNE).' });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
};

// Retirer une facture de la liste.
exports.remove = async (req, res) => {
  try {
    const numero = (req.params.numero || '').trim();
    const n = await AutoDownloadFlagged.destroy({ where: { numero_facture: numero } });
    res.json({ success: true, deleted: n });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
};
