const { LogsAction, FneInvoice, FneInvoiceItem } = require('../models');

// Enregistrer une action de téléchargement
const logDownloadAction = async (username, numeroFacture) => {
  try {
    await LogsAction.create({
      username,
      numero_facture: numeroFacture,
      download_date: new Date(),
      downloadBy: username,
      created_by: username
    });
    console.log(`Action téléchargement enregistrée: ${username} - ${numeroFacture}`);
  } catch (error) {
    console.error('Erreur lors de l\'enregistrement du téléchargement:', error);
  }
};

// Enregistrer une action de suppression
const logDeleteAction = async (username, numeroFacture) => {
  try {
    await LogsAction.create({
      username,
      numero_facture: numeroFacture,
      delete_on: new Date(),
      delete_by: username,
      created_by: username
    });
    console.log(`Action suppression enregistrée: ${username} - ${numeroFacture}`);
  } catch (error) {
    console.error('Erreur lors de l\'enregistrement de la suppression:', error);
  }
};

// Détecter si une réponse API correspond à un envoi en erreur
const isErrorResponse = (apiResponse) => {
  if (!apiResponse) return false;
  if (apiResponse.success === false) return true;
  if (apiResponse.error || apiResponse.errorMessage) return true;
  if (typeof apiResponse.statusCode === 'number' && apiResponse.statusCode >= 400) return true;
  return false;
};

// Enregistrer une action d'envoi
const logSendAction = async (username, numeroFacture, apiResponse = null, fneResponseTimeMs = null) => {
  try {
    const erreur = isErrorResponse(apiResponse);
    await LogsAction.create({
      username,
      numero_facture: numeroFacture,
      SendBy: username,
      SendOn: new Date(),
      api_response: apiResponse ? JSON.stringify(apiResponse) : null,
      fne_response_time_ms: (typeof fneResponseTimeMs === 'number' && !isNaN(fneResponseTimeMs)) ? fneResponseTimeMs : null,
      invoice_type: 'invoice', // Facture normale
      erreur,
      created_by: username
    });
    console.log(`Action envoi enregistrée: ${username} - ${numeroFacture}`);

    // Parser et stocker les IDs FNE si la réponse contient les données de facture
    if (apiResponse) {
      try {
        // La réponse peut être dans result.response ou directement dans result
        const responseData = apiResponse.response || apiResponse;
        
        // Vérifier si on a les données de facture avec invoice.id et invoice.items
        if (responseData.invoice && responseData.invoice.id) {
          const fneInvoiceId = responseData.invoice.id;
          
          // Vérifier si la facture FNE existe déjà
          const existingFneInvoice = await FneInvoice.findOne({
            where: { fne_invoice_id: fneInvoiceId }
          });

          if (!existingFneInvoice) {
            // Créer l'enregistrement de la facture FNE
            const fneInvoice = await FneInvoice.create({
              numero_facture: numeroFacture,
              fne_invoice_id: fneInvoiceId,
              fne_reference: responseData.reference || responseData.invoice.reference || null,
              fne_ncc: responseData.ncc || null,
              fne_token: responseData.token || null,
              api_response: responseData
            });

            console.log(`Facture FNE créée: ${fneInvoiceId} pour facture SAP ${numeroFacture}`);

            // Stocker les articles de la facture
            if (responseData.invoice.items && Array.isArray(responseData.invoice.items)) {
              const itemsToCreate = responseData.invoice.items.map(item => ({
                fne_invoice_id: fneInvoiceId,
                fne_item_id: item.id,
                reference: item.reference || null,
                description: item.description || null,
                quantity: item.quantity || null,
                item_data: item
              }));

              await FneInvoiceItem.bulkCreate(itemsToCreate);
              console.log(`${itemsToCreate.length} article(s) FNE créé(s) pour la facture ${fneInvoiceId}`);
            }
          } else {
            console.log(`Facture FNE ${fneInvoiceId} existe déjà, pas de création`);
          }
        } else {
          console.log('Réponse API ne contient pas les données invoice.id, pas de stockage FNE');
        }
      } catch (fneError) {
        // Ne pas bloquer le flux principal si le stockage FNE échoue
        console.error('Erreur lors du stockage des IDs FNE:', fneError);
      }
    }
  } catch (error) {
    console.error('Erreur lors de l\'enregistrement de l\'envoi:', error);
  }
};

// Récupérer les logs d'un utilisateur
const getUserActionLogs = async (username) => {
  try {
    return await LogsAction.findAll({
      where: { username },
      order: [['created_on', 'DESC']]
    });
  } catch (error) {
    console.error('Erreur lors de la récupération des logs utilisateur:', error);
    return [];
  }
};

// Récupérer les logs d'une facture
const getInvoiceActionLogs = async (numeroFacture) => {
  try {
    return await LogsAction.findAll({
      where: { numero_facture: numeroFacture },
      order: [['created_on', 'DESC']]
    });
  } catch (error) {
    console.error('Erreur lors de la récupération des logs de facture:', error);
    return [];
  }
};

module.exports = {
  logDownloadAction,
  logDeleteAction,
  logSendAction,
  getUserActionLogs,
  getInvoiceActionLogs
};
