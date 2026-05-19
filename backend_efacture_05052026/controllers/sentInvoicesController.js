const { LogsAction, DownloadedInvoice, FneInvoice } = require('../models');
const { Op, sequelize } = require('sequelize');

// Récupérer toutes les factures envoyées
const getSentInvoices = async (req, res) => {
  try {
    const { startDate, endDate, search, username, pointOfSale, sortBy, sortOrder } = req.query;

    // Construire les conditions WHERE pour LogsAction
    const whereConditions = [
      { SendBy: { [Op.ne]: null } }
    ];

    // Filtrer par plage de dates d'envoi
    if (startDate && endDate) {
      const start = new Date(startDate);
      start.setHours(0, 0, 0, 0);
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      whereConditions.push({ SendOn: { [Op.between]: [start, end] } });
    } else if (startDate) {
      const start = new Date(startDate);
      start.setHours(0, 0, 0, 0);
      whereConditions.push({ SendOn: { [Op.gte]: start } });
    } else if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      whereConditions.push({ SendOn: { [Op.lte]: end } });
    }

    // Filtrer par utilisateur
    if (username) {
      whereConditions.push({ username: { [Op.like]: `%${username}%` } });
    }

    // Recherche par numéro de facture ou référence
    if (search) {
      // Modif: Séparer seulement par saut de ligne ou virgule pour éviter la segmentation par espace
      const searchTerms = search.split(/[\r\n,]+/).filter(term => term.length > 0);
      if (searchTerms.length > 0) {
        // 1. Chercher les numéros de facture correspondants dans FneAnswer (si on cherche par référence)
        try {
          const fneMatches = await FneInvoice.findAll({
            where: {
              [Op.or]: searchTerms.map(term => ({
                fne_reference: { [Op.eq]: term } // Modif: Recherche exacte (au lieu de like)
              }))
            },
            attributes: ['numero_facture']
          });
          const fneNumeros = fneMatches.map(f => f.numero_facture);

          // 2. Construire la condition OR
          const searchOrConditions = searchTerms.flatMap(term => [
            { numero_facture: { [Op.like]: `%${term}%` } }, // Garder like pour le numéro de facture
            {
              api_response: {
                [Op.and]: [
                  { [Op.not]: null },
                  // Modif: Chercher le terme EXACT entre guillemets pour éviter les faux positifs dans le JSON
                  // Ex: "REF1" ne matchera pas "REF12" car on cherche "REF1"
                  { [Op.like]: `%\\"${term}\\"%` }
                ]
              }
            }
          ]);

          // Ajouter les numéros trouvés dans FneInvoice
          if (fneNumeros.length > 0) {
            searchOrConditions.push({ numero_facture: { [Op.in]: fneNumeros } });
          }

          whereConditions.push({ [Op.or]: searchOrConditions });
        } catch (searchError) {
          console.warn('Erreur lors de la recherche dans FneInvoice (ignorée):', searchError);
          // Fallback: recherche simple si FneInvoice plante
          const simpleSearchOrConditions = searchTerms.flatMap(term => [
            { numero_facture: { [Op.like]: `%${term}%` } },
            { api_response: { [Op.like]: `%\\"${term}\\"%` } } // Modif: Ajouter guillemets aussi ici
          ]);
          whereConditions.push({ [Op.or]: simpleSearchOrConditions });
        }
      }
    }

    const whereClause = { [Op.and]: whereConditions };

    // Déterminer l'ordre de tri
    const validSortFields = ['SendOn', 'numero_facture', 'username', 'SendBy'];
    const sortField = validSortFields.includes(sortBy) ? sortBy : 'SendOn';
    const sortDirection = sortOrder && sortOrder.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
    const orderClause = [[sortField, sortDirection]];

    // Exécuter la requête SANS include pour éviter les problèmes d'association
    const logs = await LogsAction.findAll({
      where: whereClause,
      order: orderClause,
      // limit: 1000 // Limit removed to show all invoices
    });

    // Récupérer les références FNE pour ces logs.
    // Deux index nécessaires :
    //   - fneById[fne_invoice_id]  → matching précis quand le log contient l'id dans son api_response
    //   - fneByNumero[numero_facture] → fallback pour les logs sans id (saisies manuelles)
    const numeros = logs.map(l => l.numero_facture).filter(n => n);
    let fneById = {};
    let fneByNumero = {};

    if (numeros.length > 0) {
      try {
        const fneInfos = await FneInvoice.findAll({
          where: { numero_facture: { [Op.in]: numeros } },
          attributes: ['numero_facture', 'fne_reference', 'fne_invoice_id', 'created_at'],
          order: [['created_at', 'ASC']], // pour que fneByNumero garde la PREMIÈRE cert en fallback
        });

        for (const f of fneInfos) {
          if (f.fne_invoice_id) {
            fneById[f.fne_invoice_id] = {
              reference: f.fne_reference,
              fne_id: f.fne_invoice_id,
              created_at: f.created_at,
            };
          }
          // fallback : première cert trouvée par numero (ne pas écraser)
          if (!fneByNumero[f.numero_facture]) {
            fneByNumero[f.numero_facture] = {
              reference: f.fne_reference,
              fne_id: f.fne_invoice_id,
              created_at: f.created_at,
            };
          }
        }
      } catch (fneError) {
        console.warn('Impossible de récupérer les infos FneInvoice:', fneError);
      }
    }

    // Convertir les factures et enrichir avec les infos FNE et DownloadedInfo
    const downloadedMap = {};
    try {
      // OPTIMISATION: Ne récupérer que les factures concernées par les logs affichés
      // au lieu de charger TOUTE la table DownloadedInvoice en mémoire (ce qui cause la lenteur/blocage)
      const uniqueNumeros = [...new Set(logs.map(l => l.numero_facture).filter(n => n))];

      if (uniqueNumeros.length > 0) {
        // Fetch only relevant downloaded invoices
        const relevantDownloaded = await DownloadedInvoice.findAll({
          where: {
            numero: { [Op.in]: uniqueNumeros }
          },
          attributes: ['numero', 'client', 'data', 'id', 'download_date']
        });

        relevantDownloaded.forEach(inv => {
          downloadedMap[String(inv.numero)] = inv;
        });
      }
    } catch (e) {
      console.warn('Erreur lors de la récupération des infos downloadedMap:', e);
    }

    // --- Pour les avoirs : récupérer la référence FNE de la facture initiale ---
    const initialInvoiceMap = {};
    try {
      const initialNumeros = [];
      for (const log of logs) {
        if ((log.invoice_type || 'invoice') !== 'refund' || !log.api_response) continue;
        try {
          const parsed = typeof log.api_response === 'string' ? JSON.parse(log.api_response) : log.api_response;
          const initial = parsed?.facture_initiale || parsed?.facture_initiale_numero;
          if (initial) {
            initialNumeros.push(initial);
          } else {
            // Cas annulation : l'ancien log peut ne pas avoir facture_initiale,
            // mais son numero_facture EST la facture initiale (c'est la règle côté cancel controller).
            const isCanc = !!(parsed?.cancellation === true || parsed?.cancelled_fne_invoice_id || parsed?.cancelled_fne_reference);
            if (isCanc && log.numero_facture) initialNumeros.push(log.numero_facture);
          }
        } catch { /* ignore */ }
      }
      const uniqueInitial = [...new Set(initialNumeros)];
      if (uniqueInitial.length > 0) {
        const initialFne = await FneInvoice.findAll({
          where: { numero_facture: { [Op.in]: uniqueInitial } },
          attributes: ['numero_facture', 'fne_reference', 'fne_invoice_id'],
        });
        for (const f of initialFne) {
          initialInvoiceMap[f.numero_facture] = {
            reference: f.fne_reference,
            fne_id: f.fne_invoice_id,
          };
        }
      }
    } catch (e) {
      console.warn('Erreur récupération factures initiales pour avoirs:', e);
    }

    // --- SUPPRESSION DÉDUPLICATION (Pour afficher Facture et Avoir séparément) ---
    const uniqueLogs = logs;

    let uniqueInvoices = uniqueLogs.map(invoice => {
      let apiResponse = null;
      if (invoice.api_response) {
        try {
          apiResponse = JSON.parse(invoice.api_response);
        } catch (e) {
          console.warn('Impossible de parser api_response pour log id', invoice.id);
          apiResponse = null;
        }
      }

      // Extraire le fne_invoice_id embarqué dans l'api_response de CE log spécifique
      // (pour matcher la bonne cert FNE quand plusieurs envois existent pour un même numéro).
      const logFneInvoiceId = apiResponse?.invoice?.id
        || apiResponse?.id
        || apiResponse?.response?.invoice?.id
        || apiResponse?.data?.invoice?.id
        || null;

      // Matching : d'abord par id exact (précis), sinon fallback par numero_facture
      const fneInfo = (logFneInvoiceId && fneById[logFneInvoiceId])
        || fneByNumero[invoice.numero_facture]
        || {};
      const downloadedInfo = downloadedMap[String(invoice.numero_facture)];

      const isTemplate = String(invoice.numero_facture).startsWith('TMP_') || (downloadedInfo && String(downloadedInfo.id).startsWith('TMP_'));

      // Calculer le total TTC si disponible dans downloadedInfo
      let totalTtc = 0;
      if (downloadedInfo && downloadedInfo.data) {
        const rows = Array.isArray(downloadedInfo.data) ? downloadedInfo.data : [downloadedInfo.data];
        rows.forEach(row => {
          const pu = parseFloat(row.pu_ht || row.prixUnitaireHT || 0);
          const qte = parseFloat(row.quantity || row.quantite || 0);
          const tva = parseFloat(row.tva || 0);
          const airsi = parseFloat(row.other_tax_pct || row.otherTaxPct || 0);
          const rem = parseFloat(row.rem_pct || row.remisePct || 0);

          const netHt = (pu * qte) * (1 - rem / 100);
          const tvaAmount = netHt * (tva / 100);
          const airsiAmount = (netHt + tvaAmount) * (airsi / 100);
          totalTtc += netHt + tvaAmount + airsiAmount;
        });
      } else if (apiResponse && (apiResponse.totalTTC || apiResponse.total_ttc)) {
        totalTtc = parseFloat(apiResponse.totalTTC || apiResponse.total_ttc || 0);
      }

      // CORRECTIF RETROACTIF GLOBAL POUR L'AFFICHAGE
      const FIX_DATE = new Date('2025-12-30T17:15:00Z');

      let dataDate = new Date();
      if (downloadedInfo && downloadedInfo.download_date) {
        dataDate = new Date(downloadedInfo.download_date);
      } else if (invoice.SendOn) {
        dataDate = new Date(invoice.SendOn);
      }

      if (!isTemplate && dataDate < FIX_DATE) {
        totalTtc = totalTtc * 1000;
      }

      // Extraire le point de vente
      let pos = null;
      if (downloadedInfo) {
        const rows = Array.isArray(downloadedInfo.data) ? downloadedInfo.data : [downloadedInfo.data];
        // Chercher dans toutes les lignes si rows[0] n'a pas l'info
        pos = rows[0]?.point_of_sale || rows[0]?.PointOfSale || rows[0]?.pointOfSale;
        if (!pos && rows.length > 1) {
          const rowWithPos = rows.find(r => r.point_of_sale || r.PointOfSale || r.pointOfSale);
          if (rowWithPos) pos = rowWithPos.point_of_sale || rowWithPos.PointOfSale || rowWithPos.pointOfSale;
        }
      }

      if (!pos) {
        pos = apiResponse?.point_of_sale || apiResponse?.pointOfSale || apiResponse?.pos;
      }

      // Fallback spécifique pour l'export basé sur l'api_response ou le contenu
      if (!pos || pos === 'N/A') {
        const respText = JSON.stringify(apiResponse || {});
        if (respText.includes('FACTURE_EXPORT')) {
          pos = 'FACTURE_EXPORT';
        }
      }

      if (!pos && !isTemplate) {
        pos = 'NPG_SIEGE_FACTURATION';
      }

      if (!pos) pos = 'N/A';

      const isManual = apiResponse?.is_manual === true || !!apiResponse?.manual_reference;

      // Pour les avoirs : infos de la facture initiale
      const isRefund = (invoice.invoice_type || 'invoice') === 'refund';
      // Détection "annulation" robuste (cancellation, cancelled_fne_invoice_id ou cancelled_fne_reference)
      const isCancellation = !!(apiResponse && (
        apiResponse.cancellation === true ||
        apiResponse.cancelled_fne_invoice_id ||
        apiResponse.cancelled_fne_reference
      ));
      // Pour les annulations, log.numero_facture == facture initiale (pas de n° avoir SAP distinct)
      // donc fallback sur invoice.numero_facture si facture_initiale absent des anciens logs.
      let initialNumero = null;
      if (isRefund) {
        initialNumero = apiResponse?.facture_initiale || apiResponse?.facture_initiale_numero || null;
        if (!initialNumero && isCancellation) {
          initialNumero = invoice.numero_facture;
        }
      }
      const initialInfo = initialNumero ? initialInvoiceMap[initialNumero] : null;

      // Ordre de priorité différent pour les avoirs :
      //   - avoir  → privilégier apiResponse.reference (= nouvelle réf d'avoir FNE)
      //              sinon fneInfo.reference (fallback, probablement la facture initiale — à éviter)
      //   - facture → privilégier fneInfo.reference (matching par fne_invoice_id précis)
      const resolvedReference = isRefund
        ? (apiResponse?.reference || apiResponse?.manual_reference || fneInfo.reference || null)
        : (fneInfo.reference || apiResponse?.reference || apiResponse?.manual_reference || null);

      return {
        id: invoice.id,
        numero_facture: invoice.numero_facture,
        username: invoice.username,
        sent_by: invoice.SendBy,
        send_date: invoice.SendOn,
        api_response: apiResponse,
        invoice_type: invoice.invoice_type || 'invoice',
        reference: resolvedReference,
        is_cancellation: isCancellation,
        initial_invoice_numero: initialNumero,
        initial_invoice_reference: initialInfo?.reference || null,
        point_of_sale: (pos === 'NPG' ? 'NPG_SIEGE_FACTURATION' : (pos || 'N/A')),
        client_name: downloadedInfo?.client || apiResponse?.nomClient || apiResponse?.clientCompanyName || 'Client Inconnu',
        total_ttc: totalTtc,
        fne_invoice_id: fneInfo.fne_id || apiResponse?.invoice_id || apiResponse?.id || null,
        fne_created_at: fneInfo.created_at || null,
        is_template: isTemplate,
        status: apiResponse && apiResponse.success === false ? 'failed' : 'success',
        is_manual: isManual,
        // manual_on/manual_by : on essaie de remonter la date/auteur SPÉCIFIQUE de la
        // saisie manuelle (≠ date d'envoi initial de la facture).
        // Sources possibles dans l'api_response :
        //   - recovered_at / recovered_by (cas "recyclage" d'un échec → manuel)
        //   - modified_at / modified_by   (cas "update" d'une fne_invoice existante)
        //   - fneInfo.created_at          (cas "création" pure : fne_invoice MANUAL_*)
        //   - SendOn                       (fallback ultime)
        manual_on: isManual ? (
          apiResponse?.recovered_at ||
          apiResponse?.modified_at ||
          fneInfo.created_at ||
          invoice.SendOn
        ) : null,
        manual_by: isManual ? (
          apiResponse?.recovered_by ||
          apiResponse?.modified_by ||
          invoice.SendBy
        ) : null,
        is_orphan: false,
      };
    });

    // ─── Injecter les fne_invoices ORPHELINES (sans log correspondant) ───
    // Cas typique : facture envoyée 2 fois — FNE a certifié 2x, mais le backend
    // n'a enregistré qu'un seul log (l'ancien filtre anti-doublon jetait le 2ᵉ).
    // → On complète l'affichage depuis fne_invoices pour que le doublon soit visible.
    try {
      const allNumeros = [...new Set(uniqueInvoices.map(i => i.numero_facture).filter(Boolean))];
      if (allNumeros.length > 0) {
        const allFne = await FneInvoice.findAll({
          where: { numero_facture: { [Op.in]: allNumeros } },
        });

        // IDs couverts : ceux déjà présents dans la liste construite depuis les logs
        const coveredFneIds = new Set(
          uniqueInvoices.map(i => i.fne_invoice_id).filter(Boolean)
        );

        for (const fne of allFne) {
          if (!fne.fne_invoice_id || coveredFneIds.has(fne.fne_invoice_id)) continue;

          // fne_invoice orpheline → créer une ligne synthétique
          const dl = downloadedMap[String(fne.numero_facture)];
          let apiResp = null;
          try {
            apiResp = typeof fne.api_response === 'string' ? JSON.parse(fne.api_response) : fne.api_response;
          } catch { apiResp = null; }

          uniqueInvoices.push({
            id: `orphan-${fne.fne_invoice_id}`,
            numero_facture: fne.numero_facture,
            username: '(log manquant)',
            sent_by: '(log manquant)',
            send_date: fne.created_at,
            api_response: apiResp,
            invoice_type: 'invoice',
            reference: fne.fne_reference || null,
            initial_invoice_numero: null,
            initial_invoice_reference: null,
            point_of_sale: apiResp?.pointOfSale || apiResp?.point_of_sale || 'N/A',
            client_name: dl?.client || apiResp?.clientCompanyName || apiResp?.nomClient || 'Client Inconnu',
            total_ttc: parseFloat(apiResp?.amount || apiResp?.totalTTC || apiResp?.total_ttc || 0),
            fne_invoice_id: fne.fne_invoice_id,
            is_template: false,
            status: 'success',
            is_manual: false,
            manual_by: null,
            manual_on: null,
            is_orphan: true, // Marqueur pour que le frontend puisse l'afficher différemment
          });
        }
      }
    } catch (orphanErr) {
      console.warn('Injection fne_invoices orphelines échouée:', orphanErr);
    }

    // Filtrer par point de vente si spécifié (OPTIMISÉ)
    if (pointOfSale) {
      uniqueInvoices = uniqueInvoices.filter(invoice => {
        // PointOfSale Direct (déjà extrait de l'invoice ou de l'api_response)
        if (invoice.point_of_sale && invoice.point_of_sale === pointOfSale) return true;

        // Fallback: Si le PointOfSale est 'NPG', on accepte SIEGE_FACTURATION
        if ((pointOfSale === 'NPG' || pointOfSale === 'NPG_SIEGE_FACTURATION') &&
          (invoice.point_of_sale === 'NPG' || invoice.point_of_sale === 'NPG_SIEGE_FACTURATION')) {
          return true;
        }

        // Fallback: Si le PointOfSale est 'FACTURE_EXPORT'
        if ((pointOfSale === 'FACTURE_EXPORT') &&
          (invoice.point_of_sale && invoice.point_of_sale.includes('EXPORT'))) {
          return true;
        }

        return false;
      });
    }

    // Pagination opt-in : slice après dedup + injection orphelines + filtre POS JS.
    // Why: la dedup et l'injection se font en JS, donc impossible de paginer en SQL
    // sans refactor lourd. Gain principal : transfer réseau + render React.
    const totalCount = uniqueInvoices.length;
    const pageSize = parseInt(req.query.pageSize, 10);
    const page = parseInt(req.query.page, 10) || 0;
    let paged = uniqueInvoices;
    if (!isNaN(pageSize) && pageSize > 0) {
      paged = uniqueInvoices.slice(page * pageSize, (page + 1) * pageSize);
    }

    res.json({
      success: true,
      data: paged,
      count: paged.length,
      totalCount,
    });
  } catch (error) {
    console.error('Erreur lors de la récupération des factures envoyées:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la récupération des factures envoyées',
      details: error.message
    });
  }
};

module.exports = {
  getSentInvoices
};
