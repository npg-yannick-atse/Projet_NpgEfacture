const express = require('express');
const router = express.Router();

// Fonction pour générer un UUID simple
function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = Math.random() * 16 | 0;
    const v = c == 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

const axios = require('axios');
const { InvoiceFieldModification } = require('../models');
const { NOTIFICATION_URL, NOTIFICATION_KEY } = require('../config/notificationConfig');

// Fonction pour envoyer une notification
async function sendNotification(invoiceNumber, invoiceData) {
  try {
    console.log(`[DEBUG] Début sendNotification pour facture: ${invoiceNumber}`);

    // Récupérer les modifications pour cette facture
    const modifications = await InvoiceFieldModification.findAll({
      where: { invoice_number: invoiceNumber },
      order: [['modification_date', 'ASC']]
    });

    console.log(`[DEBUG] Modifications trouvées: ${modifications.length}`);

    if (modifications.length === 0) {
      console.log(`[DEBUG] Aucune modification trouvée pour la facture ${invoiceNumber}, pas de notification envoyée.`);
      return;
    }

    // Préparer les données de modification
    const modificationsData = modifications.map(mod => ({
      field: mod.field_name,
      oldValue: mod.old_value,
      newValue: mod.new_value,
      modifiedAt: mod.modification_date
    }));

    // Récupérer les infos de l'utilisateur (le dernier à avoir modifié)
    const lastMod = modifications[modifications.length - 1];
    const userInfo = {
      id: lastMod.user_id,
      name: lastMod.user_name || 'Inconnu'
    };

    // Construire le payload
    const payload = {
      invoiceNumber: invoiceNumber,
      action: 'INVOICE_SENT_WITH_MODIFICATIONS',
      modifications: modificationsData,
      user: userInfo,
      sentAt: new Date().toISOString(),
      notificationKey: NOTIFICATION_KEY
    };

    console.log('[DEBUG] Envoi de la notification de modification...');
    console.log('[DEBUG] URL:', NOTIFICATION_URL);
    console.log('[DEBUG] Payload:', JSON.stringify(payload, null, 2));

    // Envoyer la notification
    const response = await axios.post(NOTIFICATION_URL, payload);

    console.log('[DEBUG] Notification envoyée avec succès. Status:', response.status);
    console.log('[DEBUG] Response data:', response.data);
  } catch (error) {
    console.error('[DEBUG] Erreur lors de l\'envoi de la notification:', error.message);
    if (error.response) {
      console.error('[DEBUG] Response status:', error.response.status);
      console.error('[DEBUG] Response data:', error.response.data);
    }
    // Ne pas bloquer le flux principal si la notification échoue
  }
}

const { logSendAction } = require('../services/actionLogger');
const { LogsAction, FneInvoice, Auth } = require('../models');
const { Op } = require('sequelize');

// Route pour envoyer une facture
router.post('/send-invoice/:invoiceNumber', async (req, res) => {
  const { invoiceNumber } = req.params;
  const invoiceData = req.body;
  const username = req.headers['username'] || 'system';
  const idUserHeader = req.headers['id_user'] || req.headers['id-user'];

  try {
    console.log('=== ENVOI FACTURE ===');
    console.log('Numéro de facture:', invoiceNumber);

    // ─── Anti double-envoi avec bypass ADMIN ───
    // Règle :
    //   - user_type = 'admin'        → autorisé même en doublon (responsabilité assumée)
    //   - user_type = 'utilisateur'  → bloqué si précédent envoi loggé OU FneInvoice déjà présente
    let isAdmin = false;
    try {
      const where = idUserHeader
        ? { id_user: parseInt(idUserHeader, 10) }
        : { username };
      const authRow = await Auth.findOne({ where });
      isAdmin = authRow?.user_type === 'admin';
    } catch (e) {
      console.warn('Lecture Auth pour bypass admin échouée:', e.message);
    }

    if (!isAdmin) {
      const alreadySent = await LogsAction.findOne({
        where: {
          numero_facture: invoiceNumber,
          SendBy: { [Op.ne]: null },
          invoice_type: 'invoice'
        },
        order: [['SendOn', 'DESC']],
      });

      if (alreadySent) {
        let previousStatus = 'succès';
        if (alreadySent.api_response) {
          try {
            const prev = JSON.parse(alreadySent.api_response);
            if (prev?.success === false) previousStatus = 'échec';
          } catch { /* ignore */ }
        }
        console.log(`[BLOCK DOUBLE SEND] ${invoiceNumber} par ${username} (non-admin) — tentative précédente ${previousStatus} le ${alreadySent.SendOn}`);
        return res.status(409).json({
          success: false,
          error: 'ALREADY_SENT',
          previous_status: previousStatus,
          previous_by: alreadySent.SendBy,
          previous_on: alreadySent.SendOn,
          message: `La facture ${invoiceNumber} a déjà fait l'objet d'un envoi (${previousStatus}) le ${new Date(alreadySent.SendOn).toLocaleString('fr-FR')} par ${alreadySent.SendBy}. Contactez un administrateur si un renvoi est nécessaire.`
        });
      }

      const existingFne = await FneInvoice.findOne({ where: { numero_facture: invoiceNumber } });
      if (existingFne) {
        console.log(`[BLOCK DOUBLE SEND] ${invoiceNumber} par ${username} (non-admin) — déjà certifiée FNE`);
        return res.status(409).json({
          success: false,
          error: 'ALREADY_CERTIFIED_FNE',
          fne_reference: existingFne.fne_reference,
          fne_invoice_id: existingFne.fne_invoice_id,
          message: `La facture ${invoiceNumber} a déjà été certifiée par la FNE (référence ${existingFne.fne_reference}). Contactez un administrateur si un renvoi est nécessaire.`
        });
      }
    } else {
      console.log(`[ADMIN BYPASS] ${username} renvoi autorisé pour ${invoiceNumber}`);
    }

    // Simuler un délai d'envoi
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Simuler une réponse avec les données demandées
    const simulatedResponse = {
      success: true,
      ncc: invoiceData.clientNcc || "9904279V",
      reference: invoiceData.reference || "9904279V25000000075",
      token: `${process.env.FNE_API_URL?.replace('/ws/external/invoices/sign', '') || 'https://www.services.fne.dgi.gouv.ci'}/fr/verification/${generateUUID()}`
    };

    // Enregistrer l'action d'envoi réussie
    await logSendAction(username, invoiceNumber, simulatedResponse);

    console.log('Facture envoyée avec succès:', invoiceNumber);

    // Envoyer la notification de modification en arrière-plan
    sendNotification(invoiceNumber, invoiceData).catch(err => console.error('Erreur background notification:', err));

    res.json({
      success: true,
      message: `Facture ${invoiceNumber} envoyée avec succès`,
      invoiceNumber: invoiceNumber,
      timestamp: new Date().toISOString(),
      response: simulatedResponse,
      receivedData: invoiceData
    });

  } catch (error) {
    console.error('Erreur lors de l\'envoi de la facture:', error);

    // Enregistrer l'échec de l'envoi
    await logSendAction(username, invoiceNumber, {
      success: false,
      error: error.message,
      is_retryable: true // Flag pour indiquer qu'on peut réessayer
    });

    res.status(500).json({
      success: false,
      error: 'Erreur lors de l\'envoi de la facture',
      message: error.message
    });
  }
});

module.exports = router;
