const { LogsAction } = require('../models');
const { Op } = require('sequelize');
const { logDownloadAction, logDeleteAction, logSendAction } = require('../services/actionLogger');

// Enregistrer le téléchargement d'une facture
const logInvoiceDownload = async (req, res) => {
  try {
    const { username, numeroFacture } = req.body;

    if (!username || !numeroFacture) {
      return res.status(400).json({
        success: false,
        error: 'Username et numéro de facture sont requis'
      });
    }

    await logDownloadAction(username, numeroFacture);

    res.json({
      success: true,
      message: 'Action de téléchargement enregistrée'
    });
  } catch (error) {
    console.error('Erreur lors de l\'enregistrement du téléchargement:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de l\'enregistrement du téléchargement'
    });
  }
};

// Enregistrer la suppression d'une facture
const logInvoiceDelete = async (req, res) => {
  try {
    const { username, numeroFacture } = req.body;

    if (!username || !numeroFacture) {
      return res.status(400).json({
        success: false,
        error: 'Username et numéro de facture sont requis'
      });
    }

    await logDeleteAction(username, numeroFacture);

    res.json({
      success: true,
      message: 'Action de suppression enregistrée'
    });
  } catch (error) {
    console.error('Erreur lors de l\'enregistrement de la suppression:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de l\'enregistrement de la suppression'
    });
  }
};

// Enregistrer l'envoi d'une facture
const logInvoiceSend = async (req, res) => {
  try {
    const { username, numeroFacture, apiResponse, fneResponseTimeMs } = req.body;

    if (!username || !numeroFacture) {
      return res.status(400).json({
        success: false,
        error: 'Username et numéro de facture sont requis'
      });
    }

    // Vérifier si la facture a déjà été envoyée avec succès (anti-double envoi)
    const isSuccessResponse = apiResponse && apiResponse.success !== false;
    if (isSuccessResponse) {
      const alreadySent = await LogsAction.findOne({
        where: {
          numero_facture: numeroFacture,
          SendBy: { [Op.ne]: null },
          invoice_type: 'invoice'
        }
      });

      if (alreadySent) {
        let previousSuccess = true;
        if (alreadySent.api_response) {
          try {
            const prevResponse = JSON.parse(alreadySent.api_response);
            previousSuccess = prevResponse.success !== false;
          } catch (e) { /* considérer comme succès si non parsable */ }
        }

        if (previousSuccess) {
          return res.status(409).json({
            success: false,
            error: 'ALREADY_SENT',
            message: `La facture ${numeroFacture} a déjà été envoyée le ${new Date(alreadySent.SendOn).toLocaleString('fr-FR')} par ${alreadySent.SendBy}. Un double envoi n'est pas autorisé.`
          });
        }
      }
    }

    await logSendAction(username, numeroFacture, apiResponse, fneResponseTimeMs);

    res.json({
      success: true,
      message: 'Action d\'envoi enregistrée'
    });
  } catch (error) {
    console.error('Erreur lors de l\'enregistrement de l\'envoi:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de l\'enregistrement de l\'envoi'
    });
  }
};

// Récupérer les logs d'un utilisateur
const getUserLogs = async (req, res) => {
  try {
    const { username } = req.params;

    if (!username) {
      return res.status(400).json({
        success: false,
        error: 'Username est requis'
      });
    }

    const logs = await LogsAction.findAll({
      where: { username },
      order: [['created_on', 'DESC']]
    });

    res.json({
      success: true,
      data: logs
    });
  } catch (error) {
    console.error('Erreur lors de la récupération des logs utilisateur:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la récupération des logs'
    });
  }
};

// Récupérer les logs d'une facture
const getInvoiceLogs = async (req, res) => {
  try {
    const { numeroFacture } = req.params;

    if (!numeroFacture) {
      return res.status(400).json({
        success: false,
        error: 'Numéro de facture est requis'
      });
    }

    const logs = await LogsAction.findAll({
      where: { numero_facture: numeroFacture },
      order: [['created_on', 'DESC']]
    });

    res.json({
      success: true,
      data: logs
    });
  } catch (error) {
    console.error('Erreur lors de la récupération des logs de facture:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la récupération des logs'
    });
  }
};

// Enregistrer l'impression d'une facture
const logInvoicePrint = async (req, res) => {
  try {
    const { username, numeroFacture } = req.body;

    if (!username || !numeroFacture) {
      return res.status(400).json({
        success: false,
        error: 'Username et numéro de facture sont requis'
      });
    }

    // Trouver le log existant pour cette facture envoyée
    const log = await LogsAction.findOne({
      where: {
        numero_facture: numeroFacture,
        SendBy: { [require('sequelize').Op.ne]: null }
      },
      order: [['SendOn', 'DESC']]
    });

    if (!log) {
      return res.status(404).json({
        success: false,
        error: 'Facture non trouvée dans les logs'
      });
    }

    // Mettre à jour avec les informations d'impression
    await log.update({
      print_by: username,
      print_on: new Date()
    });

    res.json({
      success: true,
      message: 'Action d\'impression enregistrée'
    });
  } catch (error) {
    console.error('Erreur lors de l\'enregistrement de l\'impression:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de l\'enregistrement de l\'impression'
    });
  }
};

// Vérifier si une facture a déjà été envoyée avec succès (pré-vérification avant appel FNE)
const checkAlreadySent = async (req, res) => {
  try {
    const { numeroFacture } = req.params;

    if (!numeroFacture) {
      return res.status(400).json({ success: false, error: 'Numéro de facture requis' });
    }

    const alreadySent = await LogsAction.findOne({
      where: {
        numero_facture: numeroFacture,
        SendBy: { [Op.ne]: null }
      }
    });

    if (alreadySent) {
      let previousSuccess = true;
      if (alreadySent.api_response) {
        try {
          const prevResponse = JSON.parse(alreadySent.api_response);
          previousSuccess = prevResponse.success !== false;
        } catch (e) { /* considérer comme succès si non parsable */ }
      }

      if (previousSuccess) {
        return res.json({
          alreadySent: true,
          sentBy: alreadySent.SendBy,
          sentOn: alreadySent.SendOn
        });
      }
    }

    return res.json({ alreadySent: false });
  } catch (error) {
    console.error('Erreur lors de la vérification d\'envoi:', error);
    res.status(500).json({ success: false, error: 'Erreur lors de la vérification' });
  }
};

module.exports = {
  logInvoiceDownload,
  logInvoiceDelete,
  logInvoiceSend,
  getUserLogs,
  getInvoiceLogs,
  logInvoicePrint,
  checkAlreadySent
};
