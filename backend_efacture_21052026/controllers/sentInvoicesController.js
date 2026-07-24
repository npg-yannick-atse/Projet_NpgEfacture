const { LogsAction, DownloadedInvoice, FneInvoice } = require('../models');
const { Op, sequelize } = require('sequelize');

// Récupérer toutes les factures envoyées
const getSentInvoices = async (req, res) => {
  try {
    const { startDate, endDate, search, username, pointOfSale, sortBy, sortOrder } = req.query;

    // --- Chronométrage par étape (grep "[PERF-ENV]" dans les logs serveur) ---
    const _perfStart = Date.now();
    let _perfLast = _perfStart;
    const perf = (label) => {
      const now = Date.now();
      console.log(`[PERF-ENV] ${label}: ${now - _perfLast}ms (cumul ${now - _perfStart}ms)`);
      _perfLast = now;
    };

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

    // --- Garde-fou performance ---
    // Sans ce garde-fou, l'endpoint chargeait TOUT l'historique des envois puis
    // faisait JSON.parse(api_response) sur chaque ligne côté JS : sur un process
    // Node mono-cœur, ça bloque l'event loop -> lenteur générale + ERR_CONNECTION_TIMED_OUT.
    // Règle : si aucun filtre de date ni recherche n'est posé, on borne aux
    // SENT_DEFAULT_DAYS derniers jours (défaut 60). Un plafond dur (SENT_MAX_ROWS,
    // défaut 2000) borne aussi le pire cas même avec un filtre de date large.
    const HARD_CAP = parseInt(process.env.SENT_MAX_ROWS, 10) || 2000;
    // Mode "Factures Problème" : on ne charge QUE les envois en erreur (erreur=1),
    // sans fenêtre de dates (ils sont peu nombreux) — on filtrera ensuite les
    // non-certifiés. Sinon (vue "Envoyées"), garde-fou fenêtre par défaut.
    const isProblemsView = req.query.view === 'problems';
    if (isProblemsView) {
      whereConditions.push({ erreur: true });
    } else if (!startDate && !endDate && !search) {
      const defaultDays = parseInt(process.env.SENT_DEFAULT_DAYS, 10) || 60;
      const since = new Date();
      since.setDate(since.getDate() - defaultDays);
      since.setHours(0, 0, 0, 0);
      whereConditions.push({ SendOn: { [Op.gte]: since } });
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
          // Fix perf : on NE scanne PLUS api_response en LIKE '%..%'. C'était un scan
          // complet d'une colonne TEXT (~86 Mo) => ~34 s par recherche. La référence FNE
          // est déjà trouvée via fne_invoices.fne_reference (indexé) juste au-dessus, et le
          // numéro via son index. On garde donc numero_facture + fneNumeros uniquement.
          const searchOrConditions = searchTerms.map(term => (
            { numero_facture: { [Op.like]: `%${term}%` } }
          ));

          // Ajouter les numéros trouvés dans FneInvoice
          if (fneNumeros.length > 0) {
            searchOrConditions.push({ numero_facture: { [Op.in]: fneNumeros } });
          }

          whereConditions.push({ [Op.or]: searchOrConditions });
        } catch (searchError) {
          console.warn('Erreur lors de la recherche dans FneInvoice (ignorée):', searchError);
          // Fallback: recherche simple si FneInvoice plante
          const simpleSearchOrConditions = searchTerms.map(term => (
            { numero_facture: { [Op.like]: `%${term}%` } }
          ));
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
      // raw + colonnes ciblées : évite d'hydrater des milliers d'instances Sequelize
      // (chaque instance = getters/setters sur ~20 champs) qui bloquaient l'event loop.
      // Colonnes d'affichage PRÉCALCULÉES au lieu du gros api_response TEXT (~9,5 Ko/ligne).
      // On ne charge plus api_response ici : il n'est nécessaire que pour les avoirs (chargés à part).
      attributes: ['id', 'numero_facture', 'username', 'SendBy', 'SendOn', 'invoice_type', 'erreur',
        'total_ttc', 'point_of_sale', 'client_name', 'is_manual', 'is_cancellation', 'fne_invoice_id', 'reference'],
      raw: true,
      limit: HARD_CAP, // plafond dur : borne le volume (perf / anti-timeout)
    });

    perf(`LogsAction.findAll (${logs.length} logs envoyés, colonnes précalculées, cap ${HARD_CAP})`);

    // api_response chargé UNIQUEMENT pour les avoirs (peu nombreux) : eux seuls en ont
    // besoin (facture_initiale, réf d'avoir, matching REFUND_<ref>, annulation). Les
    // factures utilisent les colonnes -> on évite de transférer/parser des dizaines de Mo.
    const refundApiById = {};
    {
      const refundIds = logs.filter(l => (l.invoice_type || 'invoice') === 'refund').map(l => l.id);
      if (refundIds.length) {
        const ra = await LogsAction.findAll({ where: { id: { [Op.in]: refundIds } }, attributes: ['id', 'api_response'], raw: true });
        for (const r of ra) { try { refundApiById[r.id] = r.api_response ? JSON.parse(r.api_response) : null; } catch { refundApiById[r.id] = null; } }
      }
    }
    perf(`api_response chargé pour ${Object.keys(refundApiById).length} avoir(s) seulement`);

    // --- Rattachement des avoirs : injecter les FACTURES INITIALES manquantes ---
    // La fenêtre/plafond peut exclure une facture initiale plus ancienne alors que
    // son avoir (plus récent) est chargé => l'avoir apparaîtrait "orphelin".
    // On ajoute donc au jeu `logs` le log d'envoi de ces factures initiales, pour
    // que toute la logique en aval (fne, downloaded, regroupement) les traite.
    try {
      const shownNums = new Set(logs.map(l => l.numero_facture));
      const parentNums = new Set();
      for (const l of logs) {
        if ((l.invoice_type || 'invoice') !== 'refund') continue;
        const p = refundApiById[l.id];
        const fi = p?.facture_initiale || p?.facture_initiale_numero;
        if (fi && !shownNums.has(fi)) parentNums.add(fi);
      }
      if (parentNums.size > 0) {
        const parentLogs = await LogsAction.findAll({
          where: {
            numero_facture: { [Op.in]: [...parentNums] },
            SendBy: { [Op.ne]: null },
            [Op.or]: [{ invoice_type: 'invoice' }, { invoice_type: null }],
          },
          attributes: ['id', 'numero_facture', 'username', 'SendBy', 'SendOn', 'invoice_type', 'erreur',
            'total_ttc', 'point_of_sale', 'client_name', 'is_manual', 'is_cancellation'],
          order: [['SendOn', 'DESC']],
          raw: true,
        });
        const seenParent = new Set();
        for (const pl of parentLogs) {
          if (seenParent.has(pl.numero_facture)) continue; // garder l'envoi le plus récent
          seenParent.add(pl.numero_facture);
          logs.push(pl);
        }
        perf(`factures initiales injectées (${seenParent.size}/${parentNums.size})`);
      }
    } catch (e) {
      console.warn('Injection des factures initiales manquantes échouée:', e);
    }

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
          raw: true,
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

    perf('FneInvoice références (fneById / fneByNumero)');

    // NOTE PERF : on NE charge plus downloaded_invoices.data ni api_response pour la
    // liste. montant/pos/client/is_manual/annulation viennent des colonnes précalculées.
    const downloadedMap = {}; // conservé vide (l'injection orpheline y tombe en fallback apiResp)

    // --- Pour les avoirs : récupérer la référence FNE de la facture initiale ---
    const initialInvoiceMap = {};
    try {
      const initialNumeros = [];
      for (const log of logs) {
        if ((log.invoice_type || 'invoice') !== 'refund') continue;
        const parsed = refundApiById[log.id];
        if (!parsed) continue;
        const initial = parsed?.facture_initiale || parsed?.facture_initiale_numero;
        if (initial) {
          initialNumeros.push(initial);
        } else {
          const isCanc = !!(parsed?.cancellation === true || parsed?.cancelled_fne_invoice_id || parsed?.cancelled_fne_reference);
          if (isCanc && log.numero_facture) initialNumeros.push(log.numero_facture);
        }
      }
      const uniqueInitial = [...new Set(initialNumeros)];
      if (uniqueInitial.length > 0) {
        const initialFne = await FneInvoice.findAll({
          where: { numero_facture: { [Op.in]: uniqueInitial } },
          attributes: ['numero_facture', 'fne_reference', 'fne_invoice_id'],
          raw: true,
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

    perf('FneInvoice factures initiales (avoirs)');

    // --- SUPPRESSION DÉDUPLICATION (Pour afficher Facture et Avoir séparément) ---
    const uniqueLogs = logs;

    let uniqueInvoices = uniqueLogs.map(invoice => {
      const isRefund = (invoice.invoice_type || 'invoice') === 'refund';
      // api_response uniquement pour les avoirs ; les factures utilisent les colonnes précalculées
      const apiResponse = isRefund ? (refundApiById[invoice.id] || null) : null;

      // id de certif FNE du log = COLONNE précalculée (matching précis, y compris
      // REFUND_<ref> pour les avoirs). Évite de dépendre de api_response pour les factures.
      const logFneInvoiceId = invoice.fne_invoice_id || null;

      // Matching : d'abord par id exact (précis), sinon fallback par numero_facture
      const fneInfo = (logFneInvoiceId && fneById[logFneInvoiceId])
        || fneByNumero[invoice.numero_facture]
        || {};
      const isTemplate = String(invoice.numero_facture).startsWith('TMP_');

      // Champs d'affichage : COLONNES PRÉCALCULÉES (plus de parse de api_response/data).
      const totalTtc = parseFloat(invoice.total_ttc || 0);
      const pos = invoice.point_of_sale || 'N/A';
      const isManual = !!invoice.is_manual;
      // Pour les avoirs, api_response est chargé -> on en dérive l'annulation (robuste
      // même si la colonne n'a pas été remplie, ex. annulations créées par
      // fneDuplicatesController). Pour les factures, on lit la colonne précalculée.
      const isCancellation = isRefund
        ? !!(apiResponse && (apiResponse.cancellation === true || apiResponse.cancelled_fne_invoice_id || apiResponse.cancelled_fne_reference))
        : !!invoice.is_cancellation;
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
        ? (apiResponse?.reference || apiResponse?.manual_reference || invoice.reference || fneInfo.reference || null)
        : (fneInfo.reference || invoice.reference || null);

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
        client_name: invoice.client_name || apiResponse?.nomClient || apiResponse?.clientCompanyName || 'Client Inconnu',
        total_ttc: totalTtc,
        fne_invoice_id: fneInfo.fne_id || apiResponse?.invoice_id || apiResponse?.id || null,
        fne_created_at: fneInfo.created_at || null,
        is_template: isTemplate,
        status: invoice.erreur ? 'failed' : 'success',
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

    perf('construction lignes + JSON.parse api_response par log (JS)');

    // ─── Injecter les fne_invoices ORPHELINES (sans log correspondant) ───
    // Cas typique : facture envoyée 2 fois — FNE a certifié 2x, mais le backend
    // n'a enregistré qu'un seul log (l'ancien filtre anti-doublon jetait le 2ᵉ).
    // → On complète l'affichage depuis fne_invoices pour que le doublon soit visible.
    try {
      const allNumeros = [...new Set(uniqueInvoices.map(i => i.numero_facture).filter(Boolean))];
      if (allNumeros.length > 0) {
        const allFne = await FneInvoice.findAll({
          where: { numero_facture: { [Op.in]: allNumeros } },
          attributes: ['numero_facture', 'fne_reference', 'fne_invoice_id', 'created_at', 'api_response', 'type'],
          raw: true,
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
            invoice_type: fne.type === 'refund' ? 'refund' : 'invoice', // ne pas étiqueter un avoir comme "Facture"
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

    perf('injection fne_invoices orphelines');

    // Filtrer par menu (point de vente).
    // IMPORTANT : on classe par PRÉFIXE DU NUMÉRO (règle fiable, validée), et NON par
    // la colonne point_of_sale. Raison : pour les Succursale, point_of_sale contient le
    // NOM DE LA BOUTIQUE (ex "NPG ANYAMA") et ne vaut jamais "SURCCUSALE" -> le menu
    // Succursale ressortait VIDE. Règle : lettre -> Succursale ; "00" -> Export ; sinon NPG Siège.
    if (pointOfSale) {
      const wanted = (pointOfSale === 'NPG') ? 'NPG_SIEGE_FACTURATION' : pointOfSale;
      uniqueInvoices = uniqueInvoices.filter(invoice => {
        // Menu NPG_SALE : non distinguable par préfixe (rare) -> on garde le matching direct.
        if (wanted === 'NPG_SALE') return invoice.point_of_sale === 'NPG_SALE';
        const n = String(invoice.numero_facture || '');
        const type = /^[A-Za-z]/.test(n) ? 'SURCCUSALE'
          : n.startsWith('00') ? 'FACTURE_EXPORT'
          : 'NPG_SIEGE_FACTURATION';
        return type === wanted;
      });
    }

    // --- Séparation "Envoyées propres" / "Problèmes" ---
    // Certifié = numéro présent dans fne_invoices (fneByNumero rempli plus haut).
    if (isProblemsView) {
      // Problème = en erreur ET non certifié, dédupliqué par numéro (le plus récent d'abord,
      // les logs étant déjà triés SendOn DESC).
      const seenProblem = new Set();
      uniqueInvoices = uniqueInvoices.filter(inv => {
        if (inv.status !== 'failed' || fneByNumero[inv.numero_facture]) return false;
        if (seenProblem.has(inv.numero_facture)) return false;
        seenProblem.add(inv.numero_facture);
        return true;
      });
    } else {
      // Vue "Envoyées" propre : on exclut les lignes en erreur (elles vont dans "Problème").
      uniqueInvoices = uniqueInvoices.filter(inv => inv.status !== 'failed');
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

    perf('filtre point de vente (JS) + pagination');
    console.log(`[PERF-ENV] ===> TOTAL page Envoyées: ${Date.now() - _perfStart}ms (${totalCount} factures)`);

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
