const express = require('express');
const router = express.Router();
const db = require('../models');

// Route pour récupérer les détails d'une facture depuis sap_vbrk_header
router.get('/invoice-details/:invoiceNumber', async (req, res) => {
  try {
    const { invoiceNumber } = req.params;

    console.log('=== RECHERCHE DÉTAILS FACTURE ===');
    console.log('Numéro de facture:', invoiceNumber);

    // Récupérer les détails depuis sap_vbrk_header
    const vbrkHeader = await db.SapVbrkHeader.findOne({
      where: { VBELN: invoiceNumber }
    });

    if (!vbrkHeader) {
      console.log('Aucune facture trouvée avec ce numéro');
      return res.status(404).json({
        error: 'Facture non trouvée',
        VBELN: 'N/A',
        NAME1: 'Client inconnu'
      });
    }

    console.log('Facture trouvée:', {
      VBELN: vbrkHeader.VBELN,
      NAMRG: vbrkHeader.NAMRG
    });

    // Calculer l'AIRSI (MWAL)
    let mwalValue = 0;
    if (vbrkHeader.KNUMV) {
      try {
        const mwalConditions = await db.SapKomvCondition.findAll({
          where: {
            KNUMV: vbrkHeader.KNUMV,
            KRECH: { [db.Sequelize.Op.like]: '%A%' },
            KSCHL: { [db.Sequelize.Op.like]: '%MWAL%' }
          }
        });

        if (mwalConditions.length > 0) {
          const firstMwal = mwalConditions[0];
          const rawMwal = parseFloat(String(firstMwal.KBETR).replace(',', '.'));
          const candidates = [rawMwal / 10, rawMwal / 100, rawMwal / 1000, rawMwal];
          mwalValue = candidates.find(c => c > 0 && c <= 100) ?? (rawMwal / 10);
        }
      } catch (e) {
        console.warn('Erreur lors du calcul de l\'AIRSI pour la liste:', e);
      }
    }

    // Multiplier par 1000 car le frontend formatMontant divise par 10
    // Et SAP stocke des valeurs divises par 100 (ex: 50.88 pour 5088)
    const netHt = parseFloat(vbrkHeader.NETWR || 0) * 1000;
    const tva = parseFloat(vbrkHeader.MWSBK || 0) * 1000;
    const totalTtc = netHt + tva;
    const montantAirsi = totalTtc * (mwalValue / 100);
    const totalAPayer = totalTtc + montantAirsi;

    // Vérifier s'il y a une modification pour le PointOfSale
    let pointOfSale = 'NPG_SIEGE_FACTURATION';
    try {
      const modification = await db.InvoiceFieldModification.findOne({
        where: {
          invoice_number: invoiceNumber,
          field_name: 'PointOfSale'
        },
        order: [['modification_date', 'DESC']]
      });

      if (modification) {
        pointOfSale = modification.new_value;
        console.log('PointOfSale modifié trouvé:', pointOfSale);
      }
    } catch (e) {
      console.warn('Erreur lors de la récupération de la modification POS:', e);
    }

    res.json({
      VBELN: vbrkHeader.VBELN,
      NAME1: vbrkHeader.NAMRG, // Utiliser NAMRG mais le nommer NAME1 pour compatibilité frontend
      PointOfSale: pointOfSale,
      TotalTTC: totalAPayer // On renvoie le total à payer dans le champ TotalTTC utilisé par le frontend
    });

  } catch (error) {
    console.error('Erreur lors de la récupération des détails de la facture:', error);
    res.status(500).json({
      error: 'Erreur serveur',
      VBELN: 'N/A',
      NAME1: 'Client inconnu'
    });
  }
});

module.exports = router;
