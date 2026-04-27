const { DownloadedInvoice, LogsAction, PointOfSale, SapVbrkHeader, SapKomvCondition, InvoiceFieldModification, InvoiceTotals, TemplateInvoiceDetail } = require('../models');
const { Op, Sequelize } = require('sequelize');
const sequelize = require('../config/database');

// Sauvegarder une facture téléchargée
exports.saveDownloadedInvoice = async (req, res) => {
  try {
    const { id, username, numero, date, client, data, invoice_type_code } = req.body;

    if (!id || !username || !numero || !data) {
      return res.status(400).json({
        error: 'Champs requis manquants: id, username, numero, data'
      });
    }

    // Validation du Point of Sale pour l'import de template
    // Les imports de template ont un ID commençant par TMP_
    const isTemplateImport = id && String(id).startsWith('TMP_');
    if (isTemplateImport) {
      // Extraire le point of sale et la vue d'import des données
      let posLibelle = null;
      let importView = null;
      if (Array.isArray(data) && data.length > 0) {
        posLibelle = data[0].point_of_sale || data[0].PointOfSale || data[0].pointOfSale;
        importView = data[0].import_view;
      }

      // Si l'import se fait depuis la vue SURCCUSALE ou FACTURE_EXPORT, on ne valide plus les points de vente individuels
      if (importView === 'SURCCUSALE' || importView === 'FACTURE_EXPORT') {
        // Bypass complet de la validation POS pour la vue SURCCUSALE et FACTURE_EXPORT
        console.log(`Validation POS ignorée pour un import depuis la vue ${importView}`);
      } else if (posLibelle) {
        const existingPos = await PointOfSale.findOne({
          where: { libelle: posLibelle }
        });

        if (!existingPos) {
          // Si le POS est "SURCCUSALE" (ancien mécanisme de compatibilité), on l'autorise
          if (posLibelle === 'SURCCUSALE') {
            console.log('POS "SURCCUSALE" autorisé par défaut');
          } else {
            return res.status(400).json({
              error: `Le point de vente "${posLibelle}" n'existe pas dans la base de données. Veuillez vérifier le fichier d'import.`
            });
          }
        } else if (!existingPos.active) {
          return res.status(400).json({
            error: `Le point de vente "${posLibelle}" n'est pas activé pour l'importation. Veuillez l'activer dans les paramètres.`
          });
        }
      }
    }

    // Vérifier si une facture avec le même numéro existe déjà (peu importe l'utilisateur)
    const existingByNumero = await DownloadedInvoice.findOne({
      where: { numero }
    });

    if (existingByNumero) {
      return res.status(409).json({
        error: `La facture ${numero} a déjà été téléchargée`
      });
    }

    // Vérifier si une facture avec le même id existe déjà (sécurité complémentaire)
    const existingInvoice = await DownloadedInvoice.findOne({
      where: { id }
    });

    if (existingInvoice) {
      return res.status(409).json({
        error: 'Cette facture a déjà été sauvegardée (ID dupliqué)'
      });
    }

    // Extraire le statut verified des données (pour les imports de template)
    let verifiedStatus = 0; // Par défaut non vérifié
    if (Array.isArray(data) && data.length > 0 && data[0].verified !== undefined) {
      verifiedStatus = data[0].verified;
    }

    // Dériver invoice_type_code si non fourni explicitement
    let resolvedTypeCode = invoice_type_code || null;
    if (!resolvedTypeCode && Array.isArray(data) && data.length > 0) {
      const first = data[0] || {};
      const pos = first.point_of_sale || first.PointOfSale || first.pointOfSale;
      if (pos) resolvedTypeCode = (pos === 'NPG') ? 'NPG_SIEGE_FACTURATION' : pos;
    }

    // Créer la facture téléchargée
    const downloadedInvoice = await DownloadedInvoice.create({
      id,
      username,
      numero,
      date: date || new Date(),
      client: client || 'Client inconnu',
      data,
      verified: verifiedStatus,
      invoice_type_code: resolvedTypeCode,
    });

    // Si c'est un import template, enregistrer les détails et les totaux
    if (isTemplateImport && Array.isArray(data) && data.length > 0) {
      try {
        const lines = data;
        const firstLine = lines[0];
        const posValue = firstLine.point_of_sale || firstLine.PointOfSale || firstLine.pointOfSale || null;

        // Enregistrer chaque ligne dans template_invoice_details
        await TemplateInvoiceDetail.destroy({ where: { numero_facture: numero } });
        await TemplateInvoiceDetail.bulkCreate(lines.map((line, idx) => {
          const pu = parseFloat(line.pu_ht || line.PU_HT || line.prixUnitaireHT || 0);
          const qte = parseFloat(line.quantity || line.quantite || 0);
          const rem = parseFloat(line.rem_pct || line.remisePct || line.Remise || 0);
          const brut = pu * qte;
          const net = brut * (1 - rem / 100);
          return {
            numero_facture: numero,
            ligne_numero: idx + 1,
            reference: line.reference || null,
            designation: line.designation || null,
            quantite: qte,
            unite: line.unite || null,
            prix_unitaire_ht: pu,
            remise_pct: rem,
            montant_brut: Math.round(brut),
            montant_net: Math.round(net),
            tva_pct: parseFloat(line.tva || line.TVA || 0),
            airsi_pct: parseFloat(line.other_tax_pct || line.otherTaxPct || 0),
            client_name: line.client_name || line.nomClient || client || null,
            client_email: line.client_email || line.clientEmail || null,
            client_phone: line.client_phone || line.clientPhone || null,
            client_ncc: line.client_ncc || line.clientNCC || null,
            template: line.template || null,
            payment_method: line.payment_method || line.paymentMethod || null,
            point_of_sale: line.point_of_sale || posValue,
            is_rne: line.is_rne || line.isRne || null,
            username,
          };
        }));

        // Calculer et enregistrer les totaux
        let totalNetHT = 0, totalTVA = 0, totalAIRSI = 0, totalHT = 0, totalRemise = 0;
        lines.forEach(line => {
          const pu = parseFloat(line.pu_ht || line.PU_HT || line.prixUnitaireHT || 0);
          const qte = parseFloat(line.quantity || line.quantite || 0);
          const rem = parseFloat(line.rem_pct || line.remisePct || 0);
          const tva = parseFloat(line.tva || line.TVA || 0);
          const airsi = parseFloat(line.other_tax_pct || line.otherTaxPct || 0);

          const lineHT = pu * qte;
          const lineNetHT = lineHT * (1 - rem / 100);
          const lineTVA = lineNetHT * (tva / 100);
          const lineAIRSI = (lineNetHT + lineTVA) * (airsi / 100);

          totalHT += lineHT;
          totalNetHT += lineNetHT;
          totalTVA += lineTVA;
          totalAIRSI += lineAIRSI;
        });
        totalRemise = totalHT - totalNetHT;
        const totalTTC = totalNetHT + totalTVA;
        const totalAPayer = totalTTC + totalAIRSI;

        await InvoiceTotals.destroy({ where: { numero_facture: numero } });
        await InvoiceTotals.create({
          numero_facture: numero,
          point_of_sale: posValue,
          total_ht: Math.round(totalHT),
          total_net_ht: Math.round(totalNetHT),
          montant_remise: Math.round(totalRemise),
          tva_rate: parseFloat(lines[0].tva || lines[0].TVA || 0),
          montant_tva: Math.round(totalTVA),
          total_ttc: Math.round(totalTTC),
          airsi_rate: parseFloat(lines[0].otherTaxPct || lines[0].other_tax_pct || lines[0].AIRSI || 0),
          montant_airsi: Math.round(totalAIRSI),
          total_a_payer: Math.round(totalAPayer),
          source: 'template',
        });

        console.log('Template détails et totaux enregistrés pour', numero);
      } catch (tmplErr) {
        console.error('Erreur enregistrement template details/totaux:', tmplErr.message);
      }
    }

    res.status(201).json({
      success: true,
      message: 'Facture téléchargée sauvegardée avec succès',
      data: downloadedInvoice
    });

  } catch (error) {
    console.error('Erreur lors de la sauvegarde de la facture téléchargée:', error);
    res.status(500).json({
      error: 'Erreur serveur lors de la sauvegarde de la facture',
      details: error.message
    });
  }
};

// Récupérer les factures téléchargées d'un utilisateur
exports.getUserDownloadedInvoices = async (req, res) => {
  console.log('=== APPEL DE getUserDownloadedInvoices avec username:', req.params.username, '===');
  try {
    const { username } = req.params;
    const { startDate, endDate, search } = req.query;

    if (!username) {
      return res.status(400).json({
        error: 'Username requis'
      });
    }

    // Construire les conditions de requête
    const whereClause = { username };

    // Filtrer par plage de dates si fournie
    if (startDate && endDate) {
      whereClause.download_date = {
        [Op.between]: [new Date(startDate), new Date(endDate)]
      };
    }

    // Recherche par numéro de facture ou client (Multi-critères avec saut de ligne)
    if (search) {
      // Séparer les termes par retour à la ligne ou virgule
      const searchTerms = search.split(/[\r\n,]+/).map(t => t.trim()).filter(t => t);

      if (searchTerms.length > 0) {
        // Créer un tableau pour stocker les conditions de recherche
        const searchConditions = [];

        // Pour chaque terme de recherche, ajouter les conditions de recherche
        searchTerms.forEach(term => {
          searchConditions.push(
            { numero: { [Op.like]: `%${term}%` } },
            { client: { [Op.like]: `%${term}%` } }
          );
        });

        // Ajouter les conditions de recherche à la clause where
        if (whereClause[Op.and]) {
          whereClause[Op.and].push({ [Op.or]: searchConditions.flat() });
        } else {
          whereClause[Op.or] = searchConditions.flat();
        }
      }
    }

    // Déterminer les numéros de factures à EXCLURE (celles envoyées avec succès)
    const sentLogs = await LogsAction.findAll({
      where: {
        SendBy: { [Op.ne]: null }
      },
      attributes: ['numero_facture', 'api_response']
    });

    const successfulSentNumbers = sentLogs
      .filter(log => {
        // Cas 1: Pas de réponse API = Succès legacy
        if (!log.api_response || log.api_response === 'null') return true;

        try {
          const resp = typeof log.api_response === 'string' ? JSON.parse(log.api_response) : log.api_response;
          // Cas 2: Succès explicite 
          if (resp.success === true) return true;
          // Cas 3: Manuel (considéré comme succès)
          if (resp.is_manual) return true;
          // Cas 4: Échec explicite
          if (resp.success === false) return false;

          // Par défaut, si on n'arrive pas à déterminer mais qu'il y a un log d'envoi,
          // on considère que c'est un succès legacy pour éviter les doublons
          return !resp.error;
        } catch (e) {
          // Si le JSON est illisible, c'est probablement un vieux log de succès
          return true;
        }
      })
      .map(inv => inv.numero_facture);

    // On utilise Op.and pour s'assurer que si search a déjà ajouté une condition sur numero, elles se combinent
    const exclusionCondition = { numero: { [Op.notIn]: successfulSentNumbers } };
    if (whereClause[Op.and]) {
      whereClause[Op.and].push(exclusionCondition);
    } else {
      whereClause[Op.and] = [exclusionCondition];
    }

    // Déterminer l'ordre de tri
    const validSortFields = ['download_date', 'date', 'numero', 'client', 'username'];
    const sortField = validSortFields.includes(req.query.sortBy) ? req.query.sortBy : 'download_date';
    const sortDirection = req.query.sortOrder && req.query.sortOrder.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    const downloadedInvoices = await DownloadedInvoice.findAll({
      where: whereClause,
      order: [[sortField, sortDirection]]
    });

    // Récupérer tous les logs pour ces factures afin de déterminer le statut
    const invoiceNumbers = downloadedInvoices.map(inv => inv.numero);
    const allLogs = await LogsAction.findAll({
      where: {
        numero_facture: { [Op.in]: invoiceNumbers },
        SendBy: { [Op.ne]: null }
      },
      attributes: ['numero_facture', 'api_response'],
      order: [['created_on', 'DESC']]
    });

    const statusMap = {};
    allLogs.forEach(log => {
      // On ne garde que le dernier log pour chaque facture
      if (!statusMap[log.numero_facture]) {
        try {
          const resp = typeof log.api_response === 'string' ? JSON.parse(log.api_response) : log.api_response;
          if (resp && resp.success === false) {
            statusMap[log.numero_facture] = 'failed';
            console.log(`[DEBUG STATUS] Invoice ${log.numero_facture} set to failed`);
          } else {
            console.log(`[DEBUG STATUS] Invoice ${log.numero_facture} status:`, resp?.success);
          }
        } catch (e) {
          console.log(`[DEBUG STATUS] Error parsing log for ${log.numero_facture}`);
        }
      }
    });

    // Récupérer les modifications pour ces factures
    const modifications = await InvoiceFieldModification.findAll({
      where: { invoice_number: { [Op.in]: invoiceNumbers } }
    });

    const modMap = {};
    modifications.forEach(mod => {
      if (!modMap[mod.invoice_number]) modMap[mod.invoice_number] = {};
      modMap[mod.invoice_number][mod.field_name] = mod.new_value;
    });

    const dataWithStatus = downloadedInvoices.map(inv => {
      const invoice = inv.toJSON();
      invoice.status = statusMap[inv.numero] || null;
      invoice.modifications = modMap[inv.numero] || {};
      return invoice;
    });

    res.json({
      success: true,
      data: dataWithStatus
    });

  } catch (error) {
    console.error('Erreur lors de la récupération des factures téléchargées:', error);
    res.status(500).json({
      error: 'Erreur serveur lors de la récupération des factures',
      details: error.message
    });
  }
};

// Récupérer toutes les factures téléchargées non envoyées
exports.getAllDownloadedInvoices = async (req, res) => {
  console.log('=== APPEL DE getAllDownloadedInvoices ===');
  try {
    const { startDate, endDate, search, pointOfSale, sortBy, sortOrder } = req.query;

    // Construire les conditions de requête
    const whereConditions = [];

    // Filtrer par plage de dates si fournie (sur download_date)
    if (startDate && endDate) {
      const start = new Date(startDate);
      start.setHours(0, 0, 0, 0);
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      whereConditions.push({ download_date: { [Op.between]: [start, end] } });
    } else if (startDate) {
      const start = new Date(startDate);
      start.setHours(0, 0, 0, 0);
      whereConditions.push({ download_date: { [Op.gte]: start } });
    } else if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      whereConditions.push({ download_date: { [Op.lte]: end } });
    }

    // Recherche par numéro de facture ou client (Multi-critères avec saut de ligne)
    if (search) {
      // Séparer les termes par retour à la ligne ou virgule
      const searchTerms = search.split(/[\r\n,]+/).map(t => t.trim()).filter(t => t);

      if (searchTerms.length > 0) {
        // Créer un tableau pour stocker les conditions de recherche
        const searchConditions = [];

        // Pour chaque terme de recherche, ajouter les conditions de recherche
        searchTerms.forEach(term => {
          searchConditions.push(
            { numero: { [Op.like]: `%${term}%` } },
            { client: { [Op.like]: `%${term}%` } }
          );
        });

        // Ajouter les conditions de recherche aux conditions existantes
        whereConditions.push({ [Op.or]: searchConditions.flat() });
      }
    }

    // Ne récupérer que les factures non envoyées (on ne cache que les succès)
    if (req.query.includeSent !== 'true') {
      const sentLogs = await LogsAction.findAll({
        where: {
          SendBy: { [Op.ne]: null }
        },
        attributes: ['numero_facture', 'api_response']
      });

      const successfulSentNumbers = sentLogs
        .filter(log => {
          if (!log.api_response || log.api_response === 'null') return true;
          try {
            const resp = typeof log.api_response === 'string' ? JSON.parse(log.api_response) : log.api_response;
            if (resp.success === true) return true;
            if (resp.is_manual) return true;
            if (resp.success === false) return false;
            return !resp.error;
          } catch (e) {
            return true;
          }
        })
        .map(inv => inv.numero_facture);

      if (successfulSentNumbers.length > 0) {
        whereConditions.push({ numero: { [Op.notIn]: successfulSentNumbers } });
      }
    }

    // Construire la clause WHERE finale
    const whereClause = whereConditions.length > 0 ? { [Op.and]: whereConditions } : {};

    // Déterminer l'ordre de tri
    const validSortFields = ['download_date', 'date', 'numero', 'client', 'username'];
    const sortField = validSortFields.includes(sortBy) ? sortBy : 'download_date';
    const sortDirection = sortOrder && sortOrder.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    // Tri direct par le champ demandé
    const orderClause = [[sortField, sortDirection]];
    console.log(`Tri appliqué: champ=${sortField}, ordre=${sortDirection}`);

    // Récupérer toutes les factures
    let downloadedInvoices = await DownloadedInvoice.findAll({
      where: whereClause,
      order: orderClause
    });

    // CORRECTIF RETROACTIF : Appliquer x1000 aux anciennes factures (avant 30/12/2025 17:15)
    // Cela permet d'afficher les bons montants dans le détail sans re-téléchargement
    const FIX_DATE = new Date('2025-12-30T17:15:00Z');

    // Récupérer les statuts pour toutes les factures récupérées
    const invoiceNumbers = downloadedInvoices.map(inv => inv.numero);
    const allLogs = await LogsAction.findAll({
      where: {
        numero_facture: { [Op.in]: invoiceNumbers },
        SendBy: { [Op.ne]: null }
      },
      attributes: ['numero_facture', 'api_response'],
      order: [['created_on', 'DESC']]
    });

    const statusMap = {};
    allLogs.forEach(log => {
      if (!statusMap[log.numero_facture]) {
        try {
          const resp = typeof log.api_response === 'string' ? JSON.parse(log.api_response) : log.api_response;
          if (resp && resp.success === false) {
            statusMap[log.numero_facture] = 'failed';
            console.log(`[DEBUG STATUS ALL] Invoice ${log.numero_facture} set to failed`);
          }
        } catch (e) {
          // Ignorer
        }
      }
    });

    // Récupérer les modifications pour ces factures
    const modifications = await InvoiceFieldModification.findAll({
      where: { invoice_number: { [Op.in]: invoiceNumbers } }
    });

    const modMap = {};
    modifications.forEach(mod => {
      if (!modMap[mod.invoice_number]) modMap[mod.invoice_number] = {};
      modMap[mod.invoice_number][mod.field_name] = mod.new_value;
    });

    downloadedInvoices = downloadedInvoices.map(inv => {
      // Cloner pour éviter de muter l'objet sequelize directement si retourné brut
      const invoice = inv.toJSON ? inv.toJSON() : { ...inv };

      // Ajouter le statut et les modifications
      invoice.status = statusMap[invoice.numero] || null;
      invoice.modifications = modMap[invoice.numero] || {};

      const invoiceDate = invoice.download_date ? new Date(invoice.download_date) : new Date();

      const isTemplate = String(invoice.id).startsWith('TMP_');

      if (!isTemplate && invoiceDate < FIX_DATE) {
        // Appliquer x1000 au total TTC s'il est calculé dynamiquement
        // Note : Ici on retourne l'objet 'data' qui contient les lignes.
        // Le frontend recalcule souvent le total à partir des lignes.
        // Donc on doit multiplier les montants DANS les données (data).

        if (invoice.data) {
          let dataRows = [];
          if (Array.isArray(invoice.data)) {
            dataRows = invoice.data;
          } else if (invoice.data.data && Array.isArray(invoice.data.data)) {
            dataRows = invoice.data.data;
          }

          // Multiplier les montants clés par 1000
          dataRows.forEach(row => {
            if (row.pu_ht !== undefined) row.pu_ht *= 1000;
            if (row.prixUnitaireHT !== undefined) row.prixUnitaireHT *= 1000;
            if (row.montantBrut !== undefined) row.montantBrut *= 1000;
            if (row.montantNet !== undefined) row.montantNet *= 1000;
            if (row.totalTTC !== undefined) row.totalTTC *= 1000;
            // Si d'autres champs de montant existent, les ajouter
          });

          // Réassigner les données modifiées
          if (Array.isArray(invoice.data)) {
            invoice.data = dataRows;
          } else if (invoice.data.data) {
            invoice.data.data = dataRows;
          }
        }
      }
      return invoice;
    });

    // Filtrer par point de vente si spécifié (le point de vente est dans le JSON data)
    if (pointOfSale) {
      downloadedInvoices = downloadedInvoices.filter(invoice => {
        if (!invoice.data) return false;

        // Chercher dans les différentes structures possibles
        const data = invoice.data;
        let pos = null;
        let importView = null;

        // Extraire pos et importView selon la structure
        if (Array.isArray(data) && data.length > 0) {
          const firstItem = data[0];
          if (firstItem.data && Array.isArray(firstItem.data) && firstItem.data.length > 0) {
            const firstLine = firstItem.data[0];
            pos = firstLine.point_of_sale || firstLine.pointOfSale || firstLine.PointOfSale;
            importView = firstLine.import_view;
          } else {
            pos = firstItem.point_of_sale || firstItem.pointOfSale || firstItem.PointOfSale;
            importView = firstItem.import_view;
          }
        } else if (data) {
          pos = data.point_of_sale || data.pointOfSale || data.PointOfSale;
          importView = data.import_view;
        }

        // Le point de vente de la vue (pour le filtrage) est en priorité importView, sinon pos
        const effectiveViewPos = importView || pos;

        // Pour NPG: vérifier si ce n'est PAS un import template (pas d'ID commençant par TMP_)
        if (pointOfSale === 'NPG' || pointOfSale === 'NPG_SIEGE_FACTURATION') {
          return !invoice.id || !String(invoice.id).startsWith('TMP_');
        }

        // Pour les autres vues (NPG_SALE, SURCCUSALE, etc.), on compare avec effectiveViewPos
        return effectiveViewPos === pointOfSale;
      });
    }

    // --- OPTIMISATION : Charger les détails SAP en masse pour éviter les appels individuels du frontend ---
    const sapInvoiceNumbers = downloadedInvoices.map(inv => inv.numero).filter(n => n && !n.startsWith('TMP_'));

    let sapDetailsMap = {};
    if (sapInvoiceNumbers.length > 0) {
      console.log(`Récupération en masse des détails pour ${sapInvoiceNumbers.length} factures SAP`);
      const vbrkHeaders = await SapVbrkHeader.findAll({
        where: { VBELN: { [Op.in]: sapInvoiceNumbers } }
      });

      // Charger les conditions MWAL (AIRSI) en masse pour éviter le N+1
      const knumvs = vbrkHeaders.map(h => h.KNUMV).filter(k => k);
      let mwalMap = {};

      if (knumvs.length > 0) {
        const mwalConditions = await SapKomvCondition.findAll({
          where: {
            KNUMV: { [Op.in]: knumvs },
            KRECH: { [Op.like]: '%A%' },
            KSCHL: { [Op.like]: '%MWAL%' }
          },
          attributes: ['KNUMV', 'KBETR']
        });

        mwalConditions.forEach(cond => {
          if (!mwalMap[cond.KNUMV]) {
            const rawMwal = parseFloat(String(cond.KBETR).replace(',', '.'));
            const candidates = [rawMwal / 10, rawMwal / 100, rawMwal / 1000, rawMwal];
            mwalMap[cond.KNUMV] = candidates.find(c => c > 0 && c <= 100) ?? (rawMwal / 10);
          }
        });
      }

      // Construire la map client/total
      for (const header of vbrkHeaders) {
        const mwalValue = mwalMap[header.KNUMV] || 0;
        const netHt = parseFloat(header.NETWR || 0) * 1000;
        const tva = parseFloat(header.MWSBK || 0) * 1000;
        const totalTtc = netHt + tva;
        const montantAirsi = totalTtc * (mwalValue / 100);
        const totalAPayer = totalTtc + montantAirsi;

        sapDetailsMap[header.VBELN] = {
          numeroFacture: header.VBELN,
          nomClient: header.NAMRG,
          totalTTC: totalAPayer,
          totalNetHT: netHt,
          pointOfSale: 'NPG_SIEGE_FACTURATION' // Valeur par défaut
        };
      }

      // Charger les modifications de POS en masse
      const posModifications = await InvoiceFieldModification.findAll({
        where: {
          invoice_number: { [Op.in]: sapInvoiceNumbers },
          field_name: 'PointOfSale'
        },
        order: [['modification_date', 'ASC']] // Les plus récents écraseront les plus anciens
      });

      posModifications.forEach(mod => {
        if (sapDetailsMap[mod.invoice_number]) {
          sapDetailsMap[mod.invoice_number].pointOfSale = mod.new_value;
        }
      });
    }

    // Enrichir les factures avec leurs détails calculés/récupérés
    downloadedInvoices = downloadedInvoices.map(inv => {
      const invoice = inv;

      const dataRows = Array.isArray(invoice.data) ? invoice.data : (invoice.data?.data || []);
      const isTemplate = String(invoice.id).startsWith('TMP_') || (dataRows.length > 0 && (dataRows[0].source === 'template_import' || dataRows[0].source === 'template'));

      if (isTemplate) {
        // Helper interne pour parser les nombres (gestion des virgules et espaces)
        const safeParseFloat = (val) => {
          if (val === undefined || val === null || val === '') return 0;
          if (typeof val === 'number') return val;
          const clean = String(val).replace(/\s/g, '').replace(',', '.');
          const parsed = parseFloat(clean);
          return isNaN(parsed) ? 0 : parsed;
        };

        // Pour les templates, recalculer le total comme dans fetchInvoiceDetails du frontend
        let totalNetHT = 0;
        let totalTVA = 0;
        let totalAIRSI = 0;
        let pos = 'NPG_SIEGE_FACTURATION'; // Par défaut NPG_SIEGE_FACTURATION mais on va chercher mieux

        dataRows.forEach(row => {
          const puRaw = safeParseFloat(row.pu_ht || row.PU_HT || row.prixUnitaireHT || 0);
          const qte = safeParseFloat(row.quantity || row.quantite || row.Qte || 0);
          const tvaPct = safeParseFloat(row.tva || row.TVA || 0);
          const remPct = safeParseFloat(row.rem_pct || row.Rem_Pct || row.remisePct || 0);
          const airsiPct = safeParseFloat(row.other_tax_pct || row.OtherTaxPct || 0);

          const lineHT = puRaw * qte;
          const lineNetHT = lineHT * (1 - remPct / 100);
          const lineTVA = lineNetHT * (tvaPct / 100);
          const lineAIRSI = (lineNetHT + lineTVA) * (airsiPct / 100);

          totalNetHT += lineNetHT;
          totalTVA += lineTVA;
          totalAIRSI += lineAIRSI;

          // Extraction plus robuste du POS
          if (!pos || pos === 'NPG_SIEGE_FACTURATION' || pos === 'NPG' || pos === 'N/A') {
            const extractedPos = row.point_of_sale || row.PointOfSale || row.pointOfSale || row.Point_Of_Sale || row.POS || row.pos;
            if (extractedPos && extractedPos !== 'NPG_SIEGE_FACTURATION' && extractedPos !== 'NPG' && extractedPos !== 'N/A') {
              pos = extractedPos;
            } else if (extractedPos && (!pos || pos === 'N/A')) {
              pos = extractedPos;
            }
          }
        });

        invoice.computedDetails = {
          numeroFacture: invoice.numero,
          nomClient: invoice.client || 'Client inconnu',
          totalTTC: Math.round(totalNetHT + totalTVA + totalAIRSI),
          totalNetHT: Math.round(totalNetHT),
          pointOfSale: ((invoice.modifications && invoice.modifications.PointOfSale) === 'NPG' ? 'NPG_SIEGE_FACTURATION' : ((invoice.modifications && invoice.modifications.PointOfSale) || pos || 'NPG_SIEGE_FACTURATION'))
        };
      } else {
        // Pour SAP, utiliser les détails récupérés
        const details = sapDetailsMap[invoice.numero];
        invoice.computedDetails = details ? { ...details, numeroFacture: details.numeroFacture || invoice.numero } : {
          numeroFacture: invoice.numero,
          nomClient: invoice.client || 'Client inconnu',
          totalTTC: 0,
          totalNetHT: 0,
          pointOfSale: ((invoice.modifications && invoice.modifications.PointOfSale) === 'NPG' ? 'NPG_SIEGE_FACTURATION' : ((invoice.modifications && invoice.modifications.PointOfSale) || 'NPG_SIEGE_FACTURATION'))
        };
      }
      return invoice;
    });

    console.log('Nombre de factures non envoyées trouvées:', downloadedInvoices.length);

    res.json({
      success: true,
      data: downloadedInvoices,
      count: downloadedInvoices.length
    });

  } catch (error) {
    console.error('Erreur lors de la récupération de toutes les factures téléchargées:', error);
    res.status(500).json({
      error: 'Erreur serveur lors de la récupération des factures',
      details: error.message
    });
  }
};

// Supprimer une facture téléchargée
exports.deleteDownloadedInvoice = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({
        error: 'ID de facture requis'
      });
    }

    // Récupérer le numéro de facture avant suppression
    const invoice = await DownloadedInvoice.findOne({ where: { id } });
    if (!invoice) {
      return res.status(404).json({ error: 'Facture téléchargée non trouvée' });
    }

    await DownloadedInvoice.destroy({ where: { id } });

    // Nettoyer les tables liées
    await InvoiceTotals.destroy({ where: { numero_facture: invoice.numero } });
    await TemplateInvoiceDetail.destroy({ where: { numero_facture: invoice.numero } });

    res.json({
      success: true,
      message: 'Facture téléchargée supprimée avec succès'
    });

  } catch (error) {
    console.error('Erreur lors de la suppression de la facture téléchargée:', error);
    res.status(500).json({
      error: 'Erreur serveur lors de la suppression de la facture',
      details: error.message
    });
  }
};

// Basculer le statut vérifié d'une facture
exports.toggleVerify = async (req, res) => {
  try {
    const { id } = req.params;
    const { verified } = req.body; // true ou false

    if (!id) {
      return res.status(400).json({
        error: 'ID de facture requis'
      });
    }

    const invoice = await DownloadedInvoice.findOne({
      where: { id }
    });

    if (!invoice) {
      return res.status(404).json({
        error: 'Facture téléchargée non trouvée'
      });
    }

    // Mettre à jour le statut
    // Si verified est fourni, l'utiliser, sinon inverser la valeur actuelle
    const newStatus = verified !== undefined ? verified : !invoice.verified;

    await invoice.update({ verified: newStatus });

    res.json({
      success: true,
      message: `Facture marquée comme ${newStatus ? 'vérifiée' : 'non vérifiée'}`,
      data: {
        id: invoice.id,
        verified: newStatus
      }
    });

  } catch (error) {
    console.error('Erreur lors du changement de statut de vérification:', error);
    res.status(500).json({
      error: 'Erreur serveur lors de la mise à jour',
      details: error.message
    });
  }
};
// Supprimer plusieurs factures téléchargées
exports.bulkDeleteDownloadedInvoices = async (req, res) => {
  try {
    const { ids } = req.body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({
        error: 'IDs de factures requis'
      });
    }

    // Récupérer les numéros de facture avant suppression
    const invoices = await DownloadedInvoice.findAll({
      where: { id: { [Op.in]: ids } },
      attributes: ['numero'],
    });
    const numeros = invoices.map(inv => inv.numero);

    const deletedCount = await DownloadedInvoice.destroy({
      where: { id: { [Op.in]: ids } }
    });

    // Nettoyer les tables liées
    if (numeros.length > 0) {
      await InvoiceTotals.destroy({ where: { numero_facture: { [Op.in]: numeros } } });
      await TemplateInvoiceDetail.destroy({ where: { numero_facture: { [Op.in]: numeros } } });
    }

    res.json({
      success: true,
      message: `${deletedCount} facture(s) supprimée(s) avec succès`
    });

  } catch (error) {
    console.error('Erreur lors de la suppression en masse:', error);
    res.status(500).json({
      error: 'Erreur serveur lors de la suppression en masse',
      details: error.message
    });
  }
};
