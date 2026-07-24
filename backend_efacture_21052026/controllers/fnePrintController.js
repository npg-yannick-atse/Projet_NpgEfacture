// Playwright et pdf-lib sont requis "paresseusement" (dans les fonctions) pour
// qu'un module non installé ne fasse pas planter tout le backend au démarrage —
// seule l'impression FNE échouera alors (500), le reste de l'app fonctionne.
const fs = require('fs');
const db = require('../models');

const { FneInvoice } = db;

// Normalise le token FNE en URL de vérification réelle.
function tokenToUrl(token) {
  if (!token) return null;
  let url = String(token).trim();
  url = url.replace('https://api.fne-ci.com/facture/', '');
  return url || null;
}

// Navigateur Playwright gardé "chaud" et réutilisé entre les requêtes.
let browserPromise = null;
async function getBrowser() {
  if (!browserPromise) {
    const { chromium } = require('playwright');
    browserPromise = chromium.launch({ headless: true }).catch((e) => {
      browserPromise = null;
      throw e;
    });
  }
  return browserPromise;
}

const PDF_OPTS = { format: 'A4', printBackground: true, margin: { top: '10mm', bottom: '10mm', left: '8mm', right: '8mm' } };

const exportLocator = (p) => p.locator(
  'button:has-text("Exporter"), a:has-text("Exporter"), [role="button"]:has-text("Exporter")'
).first();

/**
 * Rend la facture FNE d'une facture en PDF (Buffer) via Playwright :
 * ouvre la page de vérification, enchaîne les boutons « Exporter », capture le doc.
 * Retourne null si pas de document FNE pour cette facture.
 */
async function renderInvoicePdf(numero) {
  // Pas de filtre sur le type : un avoir a son token FNE en type='refund' (sous le
  // numéro de l'avoir). On prend le plus récent pour ce numéro.
  const fne = await FneInvoice.findOne({
    where: { numero_facture: numero },
    attributes: ['fne_token'],
    order: [['created_at', 'DESC']],
    raw: true,
  });
  const url = tokenToUrl(fne && fne.fne_token);
  if (!url) return null;

  const browser = await getBrowser();
  const context = await browser.newContext({ acceptDownloads: true });
  let downloadObj = null;
  context.on('download', (d) => { downloadObj = d; });

  try {
    const page = await context.newPage();
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    try { await page.waitForLoadState('networkidle', { timeout: 12000 }); } catch (e) {}
    await page.waitForTimeout(1500);

    for (let i = 0; i < 3 && !downloadObj; i++) {
      const pages = context.pages();
      const active = pages[pages.length - 1];
      try { await active.waitForLoadState('domcontentloaded', { timeout: 8000 }); } catch (e) {}
      await active.waitForTimeout(1000);
      if (downloadObj) break;
      const btn = exportLocator(active);
      if ((await btn.count()) === 0) break;
      try { await btn.click({ timeout: 8000 }); } catch (e) {}
      await active.waitForTimeout(1800);
    }

    if (downloadObj) {
      const path = await downloadObj.path();
      return await fs.promises.readFile(path);
    }
    const pages = context.pages();
    const active = pages[pages.length - 1];
    const u = active.url() || '';
    if (/\.pdf($|\?)/i.test(u)) {
      const r = await context.request.get(u);
      return Buffer.from(await r.body());
    }
    try { await active.waitForLoadState('networkidle', { timeout: 8000 }); } catch (e) {}
    await active.waitForTimeout(1000);
    return await active.pdf(PDF_OPTS);
  } finally {
    try { await context.close(); } catch (e) { /* noop */ }
  }
}

/**
 * GET /api/fne/print/:numero — PDF d'une seule facture FNE (impression hors-ligne).
 */
exports.printProxy = async (req, res) => {
  const numero = (req.params.numero || '').trim();
  if (!numero) return res.status(400).send('Numéro de facture requis');
  try {
    const pdf = await renderInvoicePdf(numero);
    if (!pdf) return res.status(404).send('Aucun document FNE pour cette facture.');
    res.set('Content-Type', 'application/pdf');
    res.set('Content-Disposition', `inline; filename="facture-${numero}.pdf"`);
    return res.send(pdf);
  } catch (err) {
    console.error('printProxy (playwright):', err.message);
    return res.status(500).send('Erreur lors de la génération du PDF de la facture FNE.');
  }
};

/**
 * POST /api/fne/print-multi  { numeros: [...] }
 * Génère le PDF de chaque facture et les fusionne en UN seul PDF (impression groupée).
 */
exports.printMulti = async (req, res) => {
  const input = (req.body && Array.isArray(req.body.numeros)) ? req.body.numeros : [];
  const numeros = [...new Set(input.map((n) => String(n).trim()).filter(Boolean))].slice(0, 30);
  if (!numeros.length) return res.status(400).send('Aucune facture sélectionnée.');

  try {
    const { PDFDocument } = require('pdf-lib');
    const merged = await PDFDocument.create();
    let added = 0;
    for (const numero of numeros) {
      try {
        const pdf = await renderInvoicePdf(numero);
        if (!pdf) continue;
        const doc = await PDFDocument.load(pdf, { ignoreEncryption: true });
        const pages = await merged.copyPages(doc, doc.getPageIndices());
        pages.forEach((p) => merged.addPage(p));
        added++;
      } catch (e) {
        console.error('printMulti', numero, e.message);
      }
    }
    if (!added) return res.status(404).send('Aucun document FNE généré pour la sélection.');

    const bytes = await merged.save();
    res.set('Content-Type', 'application/pdf');
    res.set('Content-Disposition', 'inline; filename="factures-fne.pdf"');
    return res.send(Buffer.from(bytes));
  } catch (err) {
    console.error('printMulti:', err.message);
    return res.status(500).send('Erreur lors de la génération du PDF groupé.');
  }
};
