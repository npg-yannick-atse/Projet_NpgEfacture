const { InvoiceFieldModification } = require('../models');
const { Op } = require('sequelize');

// Champs autorisés pour la modification
const ALLOWED_FIELDS = [
  'ClientEmail',
  'ClientPhone', 
  'Template',
  'PaymentMethod',
  'InvoiceType',
  'isRne',
  'PointOfSale'
];

// Controller pour mettre à jour un champ inline
const updateInlineField = async (req, res) => {
  try {
    const {
      invoiceNumber,
      fieldName,
      newValue,
      oldValue,
      applyToAll = false,
      lineNumber = null,
      userId,
      userName
    } = req.body;

    // Validation des entrées
    if (!invoiceNumber || !fieldName || newValue === undefined) {
      return res.status(400).json({
        success: false,
        error: 'Paramètres manquants: invoiceNumber, fieldName, et newValue sont requis'
      });
    }

    if (!ALLOWED_FIELDS.includes(fieldName)) {
      return res.status(400).json({
        success: false,
        error: `Champ ${fieldName} non autorisé pour la modification`
      });
    }

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'L\'identifiant de l\'utilisateur est requis'
      });
    }

    // Enregistrer la modification dans la base de données
    const modification = await InvoiceFieldModification.create({
      invoice_number: invoiceNumber,
      field_name: fieldName,
      old_value: oldValue || null,
      new_value: newValue,
      user_id: userId,
      user_name: userName || null,
      apply_to_all: applyToAll,
      line_number: applyToAll ? null : lineNumber,
      modification_date: new Date()
    });

    console.log('=== MODIFICATION INLINE ENREGISTRÉE ===');
    console.log('Facture:', invoiceNumber);
    console.log('Champ:', fieldName);
    console.log('Ancienne valeur:', oldValue);
    console.log('Nouvelle valeur:', newValue);
    console.log('Utilisateur:', userId);
    console.log('Appliquer à toutes les lignes:', applyToAll);

    return res.json({
      success: true,
      message: 'Champ mis à jour avec succès',
      data: {
        id: modification.id,
        invoiceNumber,
        fieldName,
        newValue,
        applyToAll,
        lineNumber
      }
    });

  } catch (error) {
    console.error('Erreur lors de la mise à jour inline:', error);
    return res.status(500).json({
      success: false,
      error: 'Erreur lors de la mise à jour du champ',
      details: error.message
    });
  }
};

// Controller pour récupérer toutes les modifications d'une facture
const getInvoiceModifications = async (req, res) => {
  try {
    const { invoiceNumber } = req.params;

    if (!invoiceNumber) {
      return res.status(400).json({
        success: false,
        error: 'Le numéro de facture est requis'
      });
    }

    const modifications = await InvoiceFieldModification.findAll({
      where: {
        invoice_number: invoiceNumber
      },
      order: [
        ['modification_date', 'DESC']
      ]
    });

    return res.json({
      success: true,
      data: modifications
    });

  } catch (error) {
    console.error('Erreur lors de la récupération des modifications:', error);
    return res.status(500).json({
      success: false,
      error: 'Erreur lors de la récupération des modifications',
      details: error.message
    });
  }
};

// Controller pour récupérer la dernière valeur modifiée pour un champ
const getLastModification = async (req, res) => {
  try {
    const { invoiceNumber, fieldName } = req.params;

    if (!invoiceNumber || !fieldName) {
      return res.status(400).json({
        success: false,
        error: 'Le numéro de facture et le nom du champ sont requis'
      });
    }

    const modification = await InvoiceFieldModification.findOne({
      where: {
        invoice_number: invoiceNumber,
        field_name: fieldName
      },
      order: [
        ['modification_date', 'DESC']
      ]
    });

    return res.json({
      success: true,
      data: modification
    });

  } catch (error) {
    console.error('Erreur lors de la récupération de la dernière modification:', error);
    return res.status(500).json({
      success: false,
      error: 'Erreur lors de la récupération de la dernière modification',
      details: error.message
    });
  }
};

// Controller pour appliquer les modifications à une facture
const applyModificationsToInvoice = async (req, res) => {
  try {
    const { invoiceNumber } = req.params;

    if (!invoiceNumber) {
      return res.status(400).json({
        success: false,
        error: 'Le numéro de facture est requis'
      });
    }

    // Récupérer toutes les modifications pour cette facture
    const modifications = await InvoiceFieldModification.findAll({
      where: {
        invoice_number: invoiceNumber
      },
      order: [
        ['modification_date', 'ASC']
      ]
    });

    // Grouper les modifications par champ
    const fieldModifications = {};
    modifications.forEach(mod => {
      if (!fieldModifications[mod.field_name]) {
        fieldModifications[mod.field_name] = [];
      }
      fieldModifications[mod.field_name].push(mod);
    });

    // Pour chaque champ, garder la dernière modification
    const latestModifications = {};
    Object.keys(fieldModifications).forEach(fieldName => {
      const mods = fieldModifications[fieldName];
      latestModifications[fieldName] = mods[mods.length - 1];
    });

    return res.json({
      success: true,
      message: 'Modifications récupérées avec succès',
      data: {
        invoiceNumber,
        modifications: latestModifications,
        totalModifications: modifications.length
      }
    });

  } catch (error) {
    console.error('Erreur lors de l\'application des modifications:', error);
    return res.status(500).json({
      success: false,
      error: 'Erreur lors de l\'application des modifications',
      details: error.message
    });
  }
};

module.exports = {
  updateInlineField,
  getInvoiceModifications,
  getLastModification,
  applyModificationsToInvoice
};
