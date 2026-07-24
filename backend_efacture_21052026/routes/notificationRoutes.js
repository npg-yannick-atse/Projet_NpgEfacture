const express = require('express');
const router = express.Router();
const axios = require('axios');
const { InvoiceFieldModification } = require('../models');
const { NOTIFICATION_URL, NOTIFICATION_KEY } = require('../config/notificationConfig');

// Route pour déclencher une notification
router.post('/trigger', async (req, res) => {
    const { invoiceNumber, clientName } = req.body;

    console.log(`[NOTIFICATION] Reçu demande de notification pour facture: ${invoiceNumber}, Client: ${clientName}`);

    if (!invoiceNumber) {
        return res.status(400).json({
            success: false,
            error: 'Numéro de facture requis'
        });
    }

    try {
        // Récupérer les modifications pour cette facture
        const modifications = await InvoiceFieldModification.findAll({
            where: { invoice_number: invoiceNumber },
            order: [['modification_date', 'ASC']]
        });

        console.log(`[NOTIFICATION] Modifications trouvées: ${modifications.length}`);

        if (modifications.length === 0) {
            return res.json({
                success: true,
                message: 'Aucune modification trouvée, pas de notification envoyée',
                sent: false
            });
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
        // Construire le message HTML
        let htmlMessage = `
            <h3>Modifications sur la facture ${invoiceNumber}</h3>
            <p><strong>Client:</strong> ${clientName || 'Non spécifié'}</p>
            <p><strong>Utilisateur:</strong> ${userInfo.name} (${userInfo.id})</p>
            <p><strong>Date:</strong> ${new Date().toLocaleString()}</p>
            <table border="1" cellpadding="5" cellspacing="0" style="border-collapse: collapse; width: 100%;">
                <thead>
                    <tr style="background-color: #f2f2f2;">
                        <th>Champ</th>
                        <th>Ancienne Valeur</th>
                        <th>Nouvelle Valeur</th>
                    </tr>
                </thead>
                <tbody>
        `;

        modificationsData.forEach(mod => {
            htmlMessage += `
                <tr>
                    <td>${mod.field}</td>
                    <td>${mod.oldValue || '-'}</td>
                    <td>${mod.newValue}</td>
                </tr>
            `;
        });

        htmlMessage += `
                </tbody>
            </table>
        `;

        // Construire le payload selon le format attendu
        const payload = {
            key: NOTIFICATION_KEY,
            object: `Modification Facture - ${invoiceNumber}`,
            message: htmlMessage
        };

        console.log('[NOTIFICATION] Envoi vers:', NOTIFICATION_URL);
        console.log('[NOTIFICATION] Payload:', JSON.stringify(payload, null, 2));

        // Envoyer la notification
        const response = await axios.post(NOTIFICATION_URL, payload);

        console.log('[NOTIFICATION] Succès. Status:', response.status);

        return res.json({
            success: true,
            message: 'Notification envoyée avec succès',
            sent: true,
            externalStatus: response.status,
            externalData: response.data,
            payload: payload
        });

    } catch (error) {
        console.error('[NOTIFICATION] Erreur:', error.message);

        const errorDetails = error.response ? {
            status: error.response.status,
            data: error.response.data
        } : { message: error.message };

        return res.status(500).json({
            success: false,
            error: 'Erreur lors de l\'envoi de la notification',
            details: errorDetails
        });
    }
});

module.exports = router;
