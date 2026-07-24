'use strict';
// Calcul des champs d'AFFICHAGE d'une facture envoyée, EXTRAIT à l'identique de
// sentInvoicesController.getSentInvoices (source de vérité de l'affichage actuel).
// Utilisé à 3 endroits pour rester cohérent :
//   - à l'envoi (logSendAction / sendRefund / manualRegisterFne) pour REMPLIR les colonnes,
//   - au backfill des lignes existantes,
//   - (référence) pour comparer précalculé vs recalculé.
//
// downloadedInfo : { data: <array|obj déjà parsé>, download_date, id, client } | null
// apiResponse    : objet déjà parsé | null
// meta           : { numero_facture, invoice_type, sendOn }
//
// Retourne : { total_ttc, point_of_sale, client_name, is_manual, is_cancellation }

const FIX_DATE = new Date('2025-12-30T17:15:00Z'); // correctif rétroactif ×1000

function computeInvoiceDisplay(downloadedInfo, apiResponse, meta = {}) {
  const numeroFacture = meta.numero_facture;
  const sendOn = meta.sendOn;

  const isTemplate =
    String(numeroFacture).startsWith('TMP_') ||
    (downloadedInfo && String(downloadedInfo.id).startsWith('TMP_'));

  // ---- total TTC ----
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

  let dataDate = new Date();
  if (downloadedInfo && downloadedInfo.download_date) {
    dataDate = new Date(downloadedInfo.download_date);
  } else if (sendOn) {
    dataDate = new Date(sendOn);
  }
  if (!isTemplate && dataDate < FIX_DATE) {
    totalTtc = totalTtc * 1000;
  }

  // ---- point de vente ----
  let pos = null;
  if (downloadedInfo) {
    const rows = Array.isArray(downloadedInfo.data) ? downloadedInfo.data : [downloadedInfo.data];
    pos = rows[0]?.point_of_sale || rows[0]?.PointOfSale || rows[0]?.pointOfSale;
    if (!pos && rows.length > 1) {
      const rowWithPos = rows.find(r => r.point_of_sale || r.PointOfSale || r.pointOfSale);
      if (rowWithPos) pos = rowWithPos.point_of_sale || rowWithPos.PointOfSale || rowWithPos.pointOfSale;
    }
  }
  if (!pos) {
    pos = apiResponse?.point_of_sale || apiResponse?.pointOfSale || apiResponse?.pos;
  }
  if (!pos || pos === 'N/A') {
    const respText = JSON.stringify(apiResponse || {});
    if (respText.includes('FACTURE_EXPORT')) pos = 'FACTURE_EXPORT';
  }
  if (!pos && !isTemplate) pos = 'NPG_SIEGE_FACTURATION';
  if (!pos) pos = 'N/A';
  // normalisation finale (comme dans le return du controller)
  const point_of_sale = (pos === 'NPG' ? 'NPG_SIEGE_FACTURATION' : (pos || 'N/A'));

  // ---- client ----
  const client_name =
    (downloadedInfo && downloadedInfo.client) ||
    apiResponse?.nomClient ||
    apiResponse?.clientCompanyName ||
    'Client Inconnu';

  // ---- is_manual / is_cancellation ----
  const is_manual = apiResponse?.is_manual === true || !!apiResponse?.manual_reference;
  const is_cancellation = !!(apiResponse && (
    apiResponse.cancellation === true ||
    apiResponse.cancelled_fne_invoice_id ||
    apiResponse.cancelled_fne_reference
  ));

  // ---- id de certif FNE du log (matching précis) + référence propre au log ----
  // Reproduit la logique de matching de sentInvoicesController (dont l'id synthétique
  // REFUND_<reference> pour les avoirs sans invoice.id).
  let fne_invoice_id =
    apiResponse?.invoice?.id ||
    apiResponse?.id ||
    apiResponse?.response?.invoice?.id ||
    apiResponse?.data?.invoice?.id ||
    null;
  if (!fne_invoice_id && meta.invoice_type === 'refund' && apiResponse?.reference) {
    fne_invoice_id = `REFUND_${apiResponse.reference}`;
  }
  const reference = apiResponse?.reference || apiResponse?.manual_reference || null;

  return {
    total_ttc: Number.isFinite(totalTtc) ? totalTtc : 0,
    point_of_sale,
    client_name: String(client_name).slice(0, 255),
    is_manual: !!is_manual,
    is_cancellation: !!is_cancellation,
    fne_invoice_id: fne_invoice_id ? String(fne_invoice_id).slice(0, 100) : null,
    reference: reference ? String(reference).slice(0, 100) : null,
  };
}

module.exports = { computeInvoiceDisplay, FIX_DATE };
