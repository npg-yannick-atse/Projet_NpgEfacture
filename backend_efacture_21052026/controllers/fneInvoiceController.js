const { FneInvoice, FneInvoiceItem, LogsAction, DownloadedInvoice } = require('../models');
const axios = require('axios');
const { Op, QueryTypes } = require('sequelize');
const { computeInvoiceDisplay } = require('../services/computeInvoiceDisplay');

// Champs d'affichage précalculés à stocker en colonnes de logs_actions.
async function buildDisplayFields(numeroFacture, invoiceType, apiResponse) {
  try {
    const dl = await DownloadedInvoice.findOne({ where: { numero: numeroFacture } });
    const dlInfo = dl ? { data: dl.data, download_date: dl.download_date, id: dl.id, client: dl.client } : null;
    const d = computeInvoiceDisplay(dlInfo, apiResponse, { numero_facture: numeroFacture, invoice_type: invoiceType, sendOn: new Date() });
    return { total_ttc: d.total_ttc, point_of_sale: d.point_of_sale, client_name: d.client_name, is_manual: d.is_manual, is_cancellation: d.is_cancellation, fne_invoice_id: d.fne_invoice_id, reference: d.reference };
  } catch (e) {
    console.warn('buildDisplayFields échec (non bloquant):', e.message);
    return {};
  }
}

// Récupérer les détails d'une facture FNE par numéro de facture SAP
const getFneInvoiceBySapNumber = async (req, res) => {
  try {
    const { numeroFacture } = req.params;

    if (!numeroFacture) {
      return res.status(400).json({
        success: false,
        error: 'Numéro de facture requis'
      });
    }

    const fneInvoice = await FneInvoice.findOne({
      where: { numero_facture: numeroFacture },
      include: [{
        model: FneInvoiceItem,
        as: 'items',
        required: false
      }]
    });

    if (!fneInvoice) {
      return res.status(404).json({
        success: false,
        error: 'Facture FNE non trouvée pour ce numéro de facture'
      });
    }

    res.json({
      success: true,
      data: fneInvoice
    });
  } catch (error) {
    console.error('Erreur lors de la récupération de la facture FNE:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la récupération de la facture FNE',
      details: error.message
    });
  }
};

// Récupérer une facture FNE par son ID FNE (fne_invoice_id)
const getFneInvoiceById = async (req, res) => {
  try {
    const { fneInvoiceId } = req.params;

    if (!fneInvoiceId) {
      return res.status(400).json({
        success: false,
        error: 'ID facture FNE requis'
      });
    }

    const fneInvoice = await FneInvoice.findOne({
      where: { fne_invoice_id: fneInvoiceId },
      include: [{
        model: FneInvoiceItem,
        as: 'items',
        required: false
      }]
    });

    if (!fneInvoice) {
      console.log(`Aucune facture FNE trouvée pour ID ${fneInvoiceId}`);
      return res.status(404).json({
        success: false,
        error: 'Facture FNE non trouvée pour cet ID'
      });
    }

    console.log(`Facture FNE trouvée pour ID ${fneInvoiceId}, items: ${fneInvoice.items ? fneInvoice.items.length : 0}`);
    if (fneInvoice.items && fneInvoice.items.length > 0) {
      fneInvoice.items.forEach(it => {
        console.log(`  item fne_item_id=${it.fne_item_id}, reference=${it.reference}`);
      });
    }

    res.json({
      success: true,
      data: fneInvoice
    });
  } catch (error) {
    console.error('Erreur lors de la récupération de la facture FNE par ID:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la récupération de la facture FNE par ID',
      details: error.message
    });
  }
};



// Récupérer des items FNE par tableau d'IDs (fne_item_id)
const getFneItemsByIds = async (req, res) => {
  try {
    // Accepter soit body.ids (array) soit query.ids (comma separated)
    let ids = req.body?.ids || req.query?.ids;
    if (!ids) {
      return res.status(400).json({ success: false, error: 'Liste d\'ids requise' });
    }

    if (typeof ids === 'string') {
      // supporte "1,2,3" or JSON string
      try {
        ids = JSON.parse(ids);
      } catch (e) {
        ids = ids.split(',').map(x => x.trim()).filter(x => x !== '');
      }
    }

    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ success: false, error: 'Liste d\'ids invalide' });
    }

    // Chercher les items correspondants
    const items = await FneInvoiceItem.findAll({
      where: {
        fne_item_id: { [Op.in]: ids }
      }
    });

    return res.json({ success: true, data: items });
  } catch (error) {
    console.error('Erreur lors de la récupération des items FNE par IDs:', error);
    return res.status(500).json({ success: false, error: 'Erreur lors de la récupération des items FNE', details: error.message });
  }
};

// Envoyer un avoir (refund) à l'API FNE
const sendRefund = async (req, res) => {
  try {
    console.log('=== REQUÊTE REFUND REÇUE ===');
    console.log('Body:', JSON.stringify(req.body, null, 2));

    const { invoiceId, items, username, numeroAvoir, clientName, montantAvoir, devise } = req.body;

    if (!invoiceId) {
      console.log('Validation échouée: invoiceId manquant');
      return res.status(400).json({
        success: false,
        error: 'ID de facture FNE requis'
      });
    }

    if (!items || !Array.isArray(items) || items.length === 0) {
      console.log('Validation échouée: items manquant ou vide');
      return res.status(400).json({
        success: false,
        error: 'Liste d\'articles requise'
      });
    }

    // Valider que chaque item a un id et une quantity
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (!item.id || item.quantity === undefined || item.quantity === null) {
        console.log(`Validation échouée pour l'item ${i}:`, item);
        return res.status(400).json({
          success: false,
          error: `L'article à l'index ${i} doit avoir un id et une quantity valide (id: ${item.id}, quantity: ${item.quantity})`
        });
      }
      // Vérifier que quantity est un nombre positif
      const quantity = parseInt(item.quantity, 10);
      if (isNaN(quantity) || quantity <= 0) {
        console.log(`Validation échouée pour l'item ${i}: quantity invalide (${item.quantity})`);
        return res.status(400).json({
          success: false,
          error: `L'article à l'index ${i} doit avoir une quantity positive (reçu: ${item.quantity})`
        });
      }
    }

    // ─── Garde-fous : la facture initiale DOIT être téléchargée ET envoyée à la FNE ───
    const initialFneInvoice = await FneInvoice.findOne({
      where: { fne_invoice_id: invoiceId }
    });

    if (!initialFneInvoice) {
      return res.status(409).json({
        success: false,
        error: 'INITIAL_NOT_SENT',
        message: `Impossible d'envoyer l'avoir : la facture initiale n'a pas été envoyée à la FNE (fne_invoice_id=${invoiceId} introuvable).`
      });
    }

    const initialNumero = initialFneInvoice.numero_facture;

    const downloadedInitial = await DownloadedInvoice.findOne({
      where: { numero: initialNumero }
    });

    if (!downloadedInitial) {
      return res.status(409).json({
        success: false,
        error: 'INITIAL_NOT_DOWNLOADED',
        message: `Impossible d'envoyer l'avoir : la facture initiale ${initialNumero} n'est pas présente dans les factures téléchargées.`
      });
    }

    const initialSendLog = await LogsAction.findOne({
      where: {
        numero_facture: initialNumero,
        SendBy: { [Op.ne]: null },
        invoice_type: 'invoice'
      }
    });

    if (!initialSendLog) {
      return res.status(409).json({
        success: false,
        error: 'INITIAL_NOT_SENT',
        message: `Impossible d'envoyer l'avoir : aucun log d'envoi FNE trouvé pour la facture initiale ${initialNumero}.`
      });
    }

    // Préparer le payload pour l'API FNE
    const refundPayload = {
      items: items.map(item => ({
        id: item.id,
        quantity: parseInt(item.quantity, 10)
      }))
    };

    // Envoyer la requête à l'API FNE
    const fneApiBaseUrl = process.env.FNE_API_URL || 'https://www.services.fne.dgi.gouv.ci/ws/external/invoices/sign';
    const fneApiToken = process.env.FNE_API_TOKEN || '';
    const fneApiUrl = fneApiBaseUrl.replace('/sign', `/${invoiceId}/refund`);

    console.log('Envoi de l\'avoir à FNE:', fneApiUrl);
    console.log('Payload:', JSON.stringify(refundPayload, null, 2));

    const fneStart = Date.now();
    const response = await axios.post(fneApiUrl, refundPayload, {
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': `Bearer ${fneApiToken}`
      }
    });
    const fneDurationMs = Date.now() - fneStart;

    console.log(`Réponse FNE pour l'avoir (${fneDurationMs}ms):`, response.data);

    // Enregistrer l'avoir dans logs_actions
    try {
      // Récupérer le numéro de facture SAP depuis la facture FNE
      const fneInvoice = await FneInvoice.findOne({
        where: { fne_invoice_id: invoiceId }
      });

      if (fneInvoice) {
        // Récupérer le username depuis les données de la requête ou utiliser une valeur par défaut
        const user = username || req.user?.username || 'system';

        // Si on a un numéro d'avoir SAP, on l'utilise comme numero_facture dans le log
        const logNumero = numeroAvoir || fneInvoice.numero_facture;

        const refundApiResponse = {
          ...response.data,
          refund_items: items,
          numero_avoir: numeroAvoir || null,
          facture_initiale: fneInvoice.numero_facture,
          clientCompanyName: clientName || '',
          nomClient: clientName || '',
          totalTTC: montantAvoir || 0,
          total_ttc: montantAvoir || 0,
          devise: devise || 'XOF'
        };
        const refundDisplay = await buildDisplayFields(logNumero, 'refund', refundApiResponse);
        await LogsAction.create({
          username: user,
          numero_facture: logNumero,
          SendBy: user,
          SendOn: new Date(),
          api_response: JSON.stringify(refundApiResponse),
          invoice_type: 'refund',
          created_by: user,
          fne_response_time_ms: fneDurationMs,
          ...refundDisplay
        });

        console.log(`Avoir enregistré dans logs_actions: avoir=${logNumero}, facture initiale=${fneInvoice.numero_facture}, durée FNE=${fneDurationMs}ms`);

        // Avoir envoyé avec succès -> poser is_sent sur le numéro d'avoir, sinon il reste
        // affiché dans "Factures téléchargées non envoyées" (SQL brut, best-effort, prod-safe).
        try { await FneInvoice.sequelize.query('UPDATE downloaded_invoices SET is_sent = 1 WHERE numero = :n', { replacements: { n: logNumero } }); }
        catch (e) { console.warn('is_sent avoir non mis à jour:', e.message); }

        // Enregistrer aussi l'avoir dans fne_invoices avec type='refund'.
        // L'API FNE renvoie un nouvel id et une nouvelle référence pour l'avoir
        // (différents de la facture initiale). Champs explorés selon les variantes
        // observées : response.data.invoice.id / response.data.id ; reference / credit_note_reference.
        try {
          const respData = response.data || {};
          const refundFneId =
            respData?.invoice?.id ||
            respData?.id ||
            respData?.refund_id ||
            respData?.credit_note_id ||
            null;
          const refundFneRef =
            respData?.reference ||
            respData?.credit_note_reference ||
            respData?.refund_reference ||
            respData?.invoice?.reference ||
            null;
          const refundNcc   = respData?.ncc || respData?.invoice?.ncc || null;
          const refundToken = respData?.token || respData?.invoice?.token || null;

          // L'API FNE refund ne renvoie pas toujours d'invoice.id — on génère
          // un ID synthétique basé sur la référence quand c'est le cas.
          let effectiveFneId = refundFneId;
          if (!effectiveFneId && refundFneRef) {
            effectiveFneId = `REFUND_${refundFneRef}`;
            console.log(`Pas d'invoice.id dans la réponse FNE — utilisation d'un ID synthétique: ${effectiveFneId}`);
          }

          if (effectiveFneId) {
            const exists = await FneInvoice.findOne({ where: { fne_invoice_id: effectiveFneId } });
            if (!exists) {
              await FneInvoice.create({
                numero_facture: logNumero,
                fne_invoice_id: effectiveFneId,
                fne_reference: refundFneRef,
                fne_ncc: refundNcc,
                fne_token: refundToken,
                api_response: respData,
                type: 'refund'
              });
              console.log(`Avoir enregistré dans fne_invoices: id=${effectiveFneId}, ref=${refundFneRef}`);
            } else {
              console.log(`fne_invoices contient déjà fne_invoice_id=${effectiveFneId}, pas de doublon créé`);
            }
          } else {
            console.warn('Impossible d\'extraire ni fne_invoice_id ni reference depuis la réponse FNE de l\'avoir — non enregistré dans fne_invoices');
          }
        } catch (fneSaveErr) {
          console.error('Erreur lors de l\'enregistrement de l\'avoir dans fne_invoices:', fneSaveErr);
        }
      } else {
        console.warn(`Facture FNE ${invoiceId} non trouvée, impossible d'enregistrer l'avoir dans logs_actions`);
      }
    } catch (logError) {
      console.error('Erreur lors de l\'enregistrement de l\'avoir dans logs:', logError);
      console.error('Stack trace:', logError.stack);
      // Ne pas bloquer la réponse si l'enregistrement échoue
    }

    res.json({
      success: true,
      message: 'Avoir envoyé avec succès',
      data: response.data
    });
  } catch (error) {
    console.error('Erreur lors de l\'envoi de l\'avoir:', error);

    if (error.response) {
      // Erreur de l'API FNE
      return res.status(error.response.status).json({
        success: false,
        error: 'Erreur lors de l\'envoi de l\'avoir à l\'API FNE',
        details: error.response.data || error.response.statusText
      });
    }

    res.status(500).json({
      success: false,
      error: 'Erreur lors de l\'envoi de l\'avoir',
      details: error.message
    });
  }
};

// Enregistrer manuellement une facture envoyée à la FNE (sans passer par l'API de signature automatique)
const manualRegisterFne = async (req, res) => {
  const t = await FneInvoice.sequelize.transaction();
  try {
    const { numeroFacture, fneReference, username } = req.body;

    if (!numeroFacture || !fneReference || !username) {
      return res.status(400).json({
        success: false,
        error: 'Champs requis manquants: numeroFacture, fneReference, username'
      });
    }

    console.log(`=== ENREGISTREMENT MANUEL FNE ===`);
    console.log(`Facture: ${numeroFacture}, Référence FNE: ${fneReference}, Utilisateur: ${username}`);

    // Champs d'affichage précalculés (manuel => is_manual=true ; montant/pos/client depuis downloaded)
    const manualDisplay = await buildDisplayFields(numeroFacture, 'invoice', { is_manual: true, manual_reference: fneReference });

    // 1. Vérifier si la référence FNE est déjà utilisée par une AUTRE facture
    const duplicateRef = await FneInvoice.findOne({
      where: {
        fne_reference: fneReference,
        numero_facture: { [Op.ne]: numeroFacture }
      }
    }, { transaction: t });

    if (duplicateRef) {
      await t.rollback();
      return res.status(409).json({
        success: false,
        error: `La référence FNE ${fneReference} appartient déjà à la facture ${duplicateRef.numero_facture}.`
      });
    }

    // 2. Vérifier si la facture possède déjà une référence FNE
    const existingFne = await FneInvoice.findOne({
      where: { numero_facture: numeroFacture }
    }, { transaction: t });

    if (existingFne) {
      // MISE À JOUR d'une facture existante
      console.log(`Mise à jour de la référence FNE pour ${numeroFacture}: ${existingFne.fne_reference} -> ${fneReference}`);

      await existingFne.update({
        fne_reference: fneReference,
        api_response: {
          ...existingFne.api_response,
          last_modified_at: new Date(),
          last_modified_by: username,
          previous_reference: existingFne.fne_reference
        }
      }, { transaction: t });

      // Mettre à jour également le log d'action le plus récent pour cette facture
      const latestLog = await LogsAction.findOne({
        where: { numero_facture: numeroFacture, invoice_type: 'invoice' },
        order: [['id', 'DESC']]
      }, { transaction: t });

      if (latestLog) {
        let apiResp = {};
        try {
          apiResp = JSON.parse(latestLog.api_response);
        } catch (e) { }

        await latestLog.update({
          api_response: JSON.stringify({
            ...apiResp,
            success: true,
            is_manual: true,
            manual_reference: fneReference,
            modified_at: new Date(),
            modified_by: username
          }),
          erreur: false,
          ...manualDisplay
        }, { transaction: t });
      }

      // Enregistrement manuel = facture considérée envoyée -> flag is_sent
      await DownloadedInvoice.update({ is_sent: true }, { where: { numero: numeroFacture }, transaction: t });

      await t.commit();
      return res.json({
        success: true,
        message: 'Référence FNE mise à jour avec succès',
        data: existingFne
      });
    }

    // 3. CRÉATION (cas original — pas de FneInvoice existant)
    // Avant de créer un nouveau LogsAction, vérifier s'il existe déjà un log d'échec
    // pour cette facture (cas typique : envoi FNE a échoué → l'utilisateur saisit
    // la référence manuellement). Sans cette vérification, deux lignes apparaîtraient
    // dans "Factures envoyées" (l'échec original + le nouveau succès manuel).
    const existingFailedLog = await LogsAction.findOne({
      where: { numero_facture: numeroFacture, invoice_type: 'invoice' },
      order: [['id', 'DESC']]
    }, { transaction: t });

    let previousApiResp = null;
    if (existingFailedLog) {
      try { previousApiResp = JSON.parse(existingFailedLog.api_response); } catch (e) {}
    }
    const wasFailed = previousApiResp && previousApiResp.success === false;

    if (existingFailedLog && wasFailed) {
      // Recycler le log d'échec en log de succès manuel
      await existingFailedLog.update({
        username: username,
        SendBy: username,
        SendOn: new Date(),
        erreur: false,
        api_response: JSON.stringify({
          success: true,
          is_manual: true,
          manual_reference: fneReference,
          previous_error: previousApiResp,
          recovered_at: new Date(),
          recovered_by: username,
          message: "Enregistrement manuel effectué après échec d'envoi"
        }),
        ...manualDisplay
      }, { transaction: t });
    } else {
      // Cas véritablement nouveau (jamais envoyé) → créer un nouveau log
      await LogsAction.create({
        username: username,
        numero_facture: numeroFacture,
        SendBy: username,
        SendOn: new Date(),
        invoice_type: 'invoice',
        created_by: username,
        api_response: JSON.stringify({
          success: true,
          is_manual: true,
          manual_reference: fneReference,
          message: "Enregistrement manuel effectué par l'utilisateur"
        }),
        ...manualDisplay
      }, { transaction: t });
    }

    // Créer l'entrée dans FneInvoice (ce qui la fera apparaître dans "Factures Envoyées")
    const fneInvoiceId = `MANUAL_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

    const fneInvoice = await FneInvoice.create({
      numero_facture: numeroFacture,
      fne_invoice_id: fneInvoiceId,
      fne_reference: fneReference,
      api_response: {
        is_manual: true,
        registration_date: new Date(),
        registered_by: username
      },
      type: 'invoice'
    }, { transaction: t });

    // Enregistrement manuel = facture considérée envoyée -> flag is_sent
    await DownloadedInvoice.update({ is_sent: true }, { where: { numero: numeroFacture }, transaction: t });

    await t.commit();

    console.log(`Enregistrement manuel réussi pour ${numeroFacture}`);

    res.json({
      success: true,
      message: 'Facture enregistrée manuellement avec succès',
      data: fneInvoice
    });

  } catch (error) {
    if (t) await t.rollback();
    console.error('Erreur lors de l\'enregistrement manuel FNE:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de l\'enregistrement manuel de la facture',
      message: error.message
    });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// VÉRIFICATION AVANT RELANCE + RÉPARATION (facture certifiée à la FNE mais en
// erreur chez nous, ex. la FNE n'a pas répondu à l'envoi).
//
// ⚠ prod-safe : logs_actions (colonnes d'affichage absentes en prod) est manipulé
// en SQL BRUT ; downloaded_invoices.is_sent (absente en prod) en try/catch.
// ─────────────────────────────────────────────────────────────────────────────

const FNE_VERIFY_BASE = 'https://www.services.fne.dgi.gouv.ci/fr/verification/';

function toVerificationUrl(token) {
  if (!token) return null;
  const t = String(token).trim();
  if (!t) return null;
  if (/^https?:\/\//i.test(t)) return t;               // déjà une URL
  return FNE_VERIFY_BASE + t;                           // UUID nu -> URL de vérification
}

// Extrait la référence / le token d'un api_response de log (formes variées).
function extractRefFromApi(apiResponse) {
  let j = apiResponse;
  try { if (typeof j === 'string') j = JSON.parse(j); } catch { return {}; }
  if (!j || typeof j !== 'object') return {};
  const reference = j.reference || j.data?.reference || j.response?.reference || j.result?.reference
    || j.fne_response?.reference || j.invoice?.reference || null;
  const token = j.token || j.data?.token || j.response?.token || j.result?.token || null;
  return { reference, token };
}

// Décompose une référence FNE "9904279V26000003445" -> { prefix:"9904279V26", seq:3445, tailLen:9 }
function parseFneRef(ref) {
  if (!ref) return null;
  const m = String(ref).trim().match(/^(\d{7}[A-Z]\d{2})(\d+)$/);
  if (!m) return null;
  return { prefix: m[1], seq: parseInt(m[2], 10), tailLen: m[2].length };
}
function formatFneRef(prefix, seq, tailLen) {
  return prefix + String(seq).padStart(tailLen, '0');
}

// Calcule la référence FNE probable d'une facture (encadrée par les envois
// réussis juste avant/après dans le temps — la séquence FNE est consécutive).
async function computeProbableRef(seq, numero) {
  // Instant de référence = SendOn du dernier log de cette facture, sinon sa date de téléchargement.
  const own = await seq.query(
    `SELECT SendOn, download_date FROM logs_actions WHERE numero_facture = :n ORDER BY id DESC LIMIT 1`,
    { replacements: { n: numero }, type: QueryTypes.SELECT });
  let t = own[0]?.SendOn || own[0]?.download_date || null;
  if (!t) {
    const dl = await seq.query(`SELECT date, download_date FROM downloaded_invoices WHERE numero = :n LIMIT 1`,
      { replacements: { n: numero }, type: QueryTypes.SELECT });
    t = dl[0]?.date || dl[0]?.download_date || null;
  }
  if (!t) return null;

  const before = await seq.query(
    `SELECT api_response, SendOn FROM logs_actions
      WHERE invoice_type='invoice' AND erreur=0 AND SendOn IS NOT NULL AND SendOn < :t AND api_response IS NOT NULL
      ORDER BY SendOn DESC LIMIT 1`, { replacements: { t }, type: QueryTypes.SELECT });
  const after = await seq.query(
    `SELECT api_response, SendOn FROM logs_actions
      WHERE invoice_type='invoice' AND erreur=0 AND SendOn IS NOT NULL AND SendOn > :t AND api_response IS NOT NULL
      ORDER BY SendOn ASC LIMIT 1`, { replacements: { t }, type: QueryTypes.SELECT });

  const rb = before[0] ? parseFneRef(extractRefFromApi(before[0].api_response).reference) : null;
  const ra = after[0] ? parseFneRef(extractRefFromApi(after[0].api_response).reference) : null;
  const beforeRef = rb ? formatFneRef(rb.prefix, rb.seq, rb.tailLen) : null;
  const afterRef = ra ? formatFneRef(ra.prefix, ra.seq, ra.tailLen) : null;

  if (rb && ra && rb.prefix === ra.prefix) {
    const gap = ra.seq - rb.seq;
    if (gap === 2) {
      return { exact: true, reference: formatFneRef(rb.prefix, rb.seq + 1, rb.tailLen), before: beforeRef, after: afterRef };
    }
    if (gap > 2) {
      return {
        exact: false,
        range: [formatFneRef(rb.prefix, rb.seq + 1, rb.tailLen), formatFneRef(rb.prefix, ra.seq - 1, rb.tailLen)],
        before: beforeRef, after: afterRef,
      };
    }
    // gap <= 1 : pas de place entre les deux -> la facture n'a probablement PAS reçu de numéro.
    return { exact: false, reference: null, note: 'no_gap', before: beforeRef, after: afterRef };
  }
  if (rb) return { exact: false, reference: formatFneRef(rb.prefix, rb.seq + 1, rb.tailLen), approx: true, before: beforeRef, after: null };
  if (ra) return { exact: false, reference: formatFneRef(ra.prefix, ra.seq - 1, ra.tailLen), approx: true, before: null, after: afterRef };
  return null;
}

// GET /api/fne-invoices/check/*  — la facture est-elle déjà certifiée ? + repères portail + n° FNE probable.
const checkInvoiceStatus = async (req, res) => {
  try {
    const numero = (req.params.numeroFacture || req.params[0] || '').trim();
    if (!numero) return res.status(400).json({ success: false, error: 'Numéro de facture requis' });
    const seq = FneInvoice.sequelize;

    let certified = false, source = null, fne_reference = null, fne_invoice_id = null, fne_token = null, has_items = false;

    // 1) fne_invoices
    const fne = await FneInvoice.findOne({ where: { numero_facture: numero, type: 'invoice' }, order: [['created_at', 'DESC']] });
    if (fne && fne.fne_reference) {
      certified = true; source = 'fne_invoices';
      fne_reference = fne.fne_reference; fne_invoice_id = fne.fne_invoice_id; fne_token = fne.fne_token;
      has_items = (await FneInvoiceItem.count({ where: { fne_invoice_id: fne.fne_invoice_id } })) > 0;
    }

    // 2) sinon : une référence traîne peut-être dans un log (la FNE avait répondu)
    if (!certified) {
      const logs = await seq.query(
        `SELECT api_response FROM logs_actions WHERE numero_facture = :n AND invoice_type='invoice' AND api_response IS NOT NULL ORDER BY id DESC LIMIT 10`,
        { replacements: { n: numero }, type: QueryTypes.SELECT });
      for (const l of logs) {
        const r = extractRefFromApi(l.api_response);
        if (r.reference) { certified = true; source = 'log'; fne_reference = r.reference; fne_token = toVerificationUrl(r.token); break; }
      }
    }

    // 3) repères pour retrouver la facture sur le portail
    //    (SQL brut : le modèle DownloadedInvoice sélectionne is_sent, absente en prod)
    const dlRows = await seq.query(
      `SELECT client, date, download_date FROM downloaded_invoices WHERE numero = :n LIMIT 1`,
      { replacements: { n: numero }, type: QueryTypes.SELECT });
    const dl = dlRows[0] || {};
    const hints = { numero, client: dl.client || null, date: dl.date || dl.download_date || null };

    // 4) numéro FNE probable (seulement si non certifiée)
    let probable = null;
    if (!certified) { try { probable = await computeProbableRef(seq, numero); } catch (e) { console.warn('computeProbableRef:', e.message); } }

    return res.json({ success: true, certified, source, fne_reference, fne_invoice_id, fne_token, has_items, hints, probable });
  } catch (error) {
    console.error('checkInvoiceStatus:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// POST /api/fne-invoices/repair — importe une facture certifiée depuis l'export JSON du portail FNE.
// body: { numeroFacture, username, reference?, fneJson }
const repairInvoice = async (req, res) => {
  const seq = FneInvoice.sequelize;
  const t = await seq.transaction();
  try {
    const { numeroFacture, username } = req.body;
    let { reference, fneJson } = req.body;
    if (!numeroFacture || !username) { await t.rollback(); return res.status(400).json({ success: false, error: 'numeroFacture et username requis' }); }
    if (fneJson == null || fneJson === '') { await t.rollback(); return res.status(400).json({ success: false, error: 'Données FNE (fneJson) requises' }); }
    if (typeof fneJson === 'string') {
      try { fneJson = JSON.parse(fneJson); } catch { await t.rollback(); return res.status(400).json({ success: false, error: 'JSON FNE invalide' }); }
    }

    const list = Array.isArray(fneJson) ? fneJson : (Array.isArray(fneJson.data) ? fneJson.data : [fneJson]);
    const invoices = list.filter((x) => x && (x.reference || x.id));
    if (!invoices.length) { await t.rollback(); return res.status(400).json({ success: false, error: 'Aucune facture exploitable dans le JSON.' }); }

    // Sélection de l'entrée à lier
    let entry = null;
    if (reference) entry = invoices.find((x) => String(x.reference) === String(reference).trim());
    if (!entry && invoices.length === 1) entry = invoices[0];
    if (!entry) {
      await t.rollback();
      return res.status(409).json({
        success: false, error: 'AMBIGUOUS',
        message: 'Plusieurs factures dans le JSON — précisez la référence FNE à lier.',
        candidates: invoices.map((x) => ({ reference: x.reference, id: x.id, client: x.clientCompanyName || null, amount: x.totalDue ?? x.amount ?? null, items: (x.items || []).length })),
      });
    }

    const fneId = entry.id;
    const ref = entry.reference;
    const nccMatch = ref && String(ref).match(/^(\d{7}[A-Z])/);
    const ncc = nccMatch ? nccMatch[1] : (entry.company?.declarantNumber || null);
    const tokenUrl = toVerificationUrl(entry.token);

    // Garde : la référence appartient-elle déjà à une AUTRE facture ?
    const dupRef = await FneInvoice.findOne({ where: { fne_reference: ref, numero_facture: { [Op.ne]: numeroFacture } }, transaction: t });
    if (dupRef) { await t.rollback(); return res.status(409).json({ success: false, error: 'REF_TAKEN', message: `La référence ${ref} appartient déjà à la facture ${dupRef.numero_facture}.` }); }

    // Garde : l'ID FNE est-il déjà rattaché à une AUTRE facture ? (fne_invoice_id est unique en base)
    const dupId = await FneInvoice.findOne({ where: { fne_invoice_id: fneId, numero_facture: { [Op.ne]: numeroFacture } }, transaction: t });
    if (dupId) { await t.rollback(); return res.status(409).json({ success: false, error: 'ID_TAKEN', message: `Cette facture FNE (id ${fneId}) est déjà rattachée à la facture ${dupId.numero_facture}.` }); }

    // 1) D'ABORD garantir la ligne logs_actions (SQL BRUT, prod-safe). fne_invoices porte
    //    une contrainte FK numero_facture -> logs_actions : le log doit exister AVANT.
    const apiResp = JSON.stringify({
      success: true, reference: ref, ncc, token: entry.token,
      invoice: { id: fneId, reference: ref, type: entry.type || 'invoice' },
      _repaired_manually: true, _repaired_by: username, _repaired_at: new Date(),
    });
    const [, meta] = await seq.query(
      `UPDATE logs_actions SET erreur = 0, api_response = :api WHERE numero_facture = :num AND invoice_type = 'invoice'`,
      { replacements: { api: apiResp, num: numeroFacture }, transaction: t });
    const affected = (meta && meta.affectedRows != null) ? meta.affectedRows : 0;
    if (!affected) {
      await seq.query(
        `INSERT INTO logs_actions (username, numero_facture, SendBy, SendOn, invoice_type, created_by, api_response, erreur)
         VALUES (:u, :num, :u, NOW(), 'invoice', :u, :api, 0)`,
        { replacements: { u: username, num: numeroFacture, api: apiResp }, transaction: t });
    }

    // 2) PUIS créer/compléter fne_invoices + items (idempotent).
    let fneInvoice = await FneInvoice.findOne({ where: { numero_facture: numeroFacture, fne_invoice_id: fneId }, transaction: t });
    let itemsCount = 0;
    if (!fneInvoice) {
      fneInvoice = await FneInvoice.create({
        numero_facture: numeroFacture, fne_invoice_id: fneId, fne_reference: ref, fne_ncc: ncc, fne_token: tokenUrl,
        api_response: { ...entry, _repaired_manually: true, _repaired_by: username, _repaired_at: new Date() },
        type: entry.type || 'invoice',
      }, { transaction: t });

      const items = (entry.items || [])
        .filter((it) => it && it.id)
        .map((it) => ({ fne_invoice_id: fneId, fne_item_id: it.id, reference: it.reference, description: it.description, quantity: it.quantity, item_data: it }));
      if (items.length) await FneInvoiceItem.bulkCreate(items, { transaction: t });
      itemsCount = items.length;
    } else {
      itemsCount = await FneInvoiceItem.count({ where: { fne_invoice_id: fneId }, transaction: t });
    }

    await t.commit();

    // Facture considérée envoyée -> is_sent. HORS transaction et en SQL brut : la colonne
    // is_sent est absente en prod, l'échec ne doit pas annuler la réparation.
    try { await seq.query(`UPDATE downloaded_invoices SET is_sent = 1 WHERE numero = :n`, { replacements: { n: numeroFacture } }); }
    catch (e) { /* colonne absente en prod : non bloquant */ }

    console.log(`[REPAIR] ${username} a réparé ${numeroFacture} -> réf ${ref} (${itemsCount} items)`);
    return res.json({ success: true, message: `Facture ${numeroFacture} réparée (référence ${ref}).`, data: { numero_facture: numeroFacture, fne_reference: ref, fne_invoice_id: fneId, items: itemsCount } });
  } catch (error) {
    try { await t.rollback(); } catch {}
    console.error('repairInvoice:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

module.exports = {
  getFneInvoiceBySapNumber,
  sendRefund,
  getFneInvoiceById,
  getFneItemsByIds,
  manualRegisterFne,
  checkInvoiceStatus,
  repairInvoice
};
