# -*- coding: utf-8 -*-
"""
Génère la fiche CM .docx en clonant le template Word et en remplaçant son body,
en respectant la STRUCTURE EXACTE du template original :
- titres en paragraphes gras simples (pas de style Titre/Titre1/Titre2)
- section 3 (Impacts/Risques) en paragraphes "Impact 1 :" / "Avant :" / "Après :" un par ligne
- plan rollback/communication en puces (style Paragraphedeliste)
- section 5 signatures = tableau 1×3, chaque cellule = 5 paragraphes (Nom / vide / Date / vide / Signature)
- section 5.2 commentaires = tableau 1×1
"""
import os
import re
import shutil
import tempfile
import uuid
import zipfile
from html import escape

ROOT = r"d:\Users\yannick.atse\Desktop\E_Facture"
SRC_TEMPLATE = os.path.join(ROOT, "FICHE_CM-AAAAMMJJ_NomModule_vX.X.docx_TEMPLATE.docx")
DST_DOCX = os.path.join(ROOT, "FICHE_CM-20260512_EFacture_FNE_Avoirs_v1.1.docx")


def x(s: str) -> str:
    return escape(s, quote=True) if s else ""


# ---------- low-level XML builders ----------

def _runs_xml(runs):
    """runs: list of (text, bold) tuples OR list of dicts {'text','bold'} OR a single str."""
    if isinstance(runs, str):
        return f'<w:r><w:t xml:space="preserve">{x(runs)}</w:t></w:r>'
    out = ""
    for r in runs:
        if isinstance(r, dict):
            text, bold = r.get("text", ""), r.get("bold", False)
        else:
            text, bold = r[0], (len(r) > 1 and r[1])
        r_pr = "<w:rPr><w:b/></w:rPr>" if bold else ""
        out += f'<w:r>{r_pr}<w:t xml:space="preserve">{x(text)}</w:t></w:r>'
    return out


def para(text="", bold=False, align=None, style=None):
    """Paragraphe simple. style optionnel (ex. 'Paragraphedeliste')."""
    p_pr = "<w:pPr>"
    if style:
        p_pr += f'<w:pStyle w:val="{style}"/>'
    if align:
        p_pr += f'<w:jc w:val="{align}"/>'
    p_pr += "</w:pPr>"
    runs = _runs_xml([(text, bold)])
    return f"<w:p>{p_pr}{runs}</w:p>"


def para_runs(runs, align=None, style=None):
    """Paragraphe avec plusieurs runs (mix gras/normal)."""
    p_pr = "<w:pPr>"
    if style:
        p_pr += f'<w:pStyle w:val="{style}"/>'
    if align:
        p_pr += f'<w:jc w:val="{align}"/>'
    p_pr += "</w:pPr>"
    return f"<w:p>{p_pr}{_runs_xml(runs)}</w:p>"


def empty_para():
    return "<w:p/>"


def cell_simple(text, width, bold=False, shade=None):
    """Cellule mono-paragraphe."""
    tc_pr = f'<w:tcPr><w:tcW w:w="{width}" w:type="dxa"/>'
    if shade:
        tc_pr += f'<w:shd w:val="clear" w:color="auto" w:fill="{shade}"/>'
    tc_pr += "</w:tcPr>"
    p = para(text, bold=bold)
    return f"<w:tc>{tc_pr}{p}</w:tc>"


def cell_paras(paragraphs, width, shade=None):
    """Cellule contenant plusieurs paragraphes (déjà construits)."""
    tc_pr = f'<w:tcPr><w:tcW w:w="{width}" w:type="dxa"/>'
    if shade:
        tc_pr += f'<w:shd w:val="clear" w:color="auto" w:fill="{shade}"/>'
    tc_pr += "</w:tcPr>"
    return f"<w:tc>{tc_pr}{''.join(paragraphs)}</w:tc>"


def row_simple(cells, widths, bold=False, shade=None):
    """Ligne avec cellules mono-paragraphe (texte simple)."""
    cells_xml = "".join(cell_simple(c, widths[i], bold=bold, shade=shade) for i, c in enumerate(cells))
    return f"<w:tr>{cells_xml}</w:tr>"


def table(rows, widths):
    total = sum(widths)
    tbl = (
        f'<w:tbl><w:tblPr><w:tblW w:w="{total}" w:type="dxa"/>'
        '<w:tblBorders>'
        '<w:top w:val="single" w:sz="4" w:space="0" w:color="auto"/>'
        '<w:left w:val="single" w:sz="4" w:space="0" w:color="auto"/>'
        '<w:bottom w:val="single" w:sz="4" w:space="0" w:color="auto"/>'
        '<w:right w:val="single" w:sz="4" w:space="0" w:color="auto"/>'
        '<w:insideH w:val="single" w:sz="4" w:space="0" w:color="auto"/>'
        '<w:insideV w:val="single" w:sz="4" w:space="0" w:color="auto"/>'
        '</w:tblBorders><w:tblLayout w:type="fixed"/></w:tblPr><w:tblGrid>'
    )
    for w in widths:
        tbl += f'<w:gridCol w:w="{w}"/>'
    tbl += "</w:tblGrid>" + "".join(rows) + "</w:tbl>"
    return tbl


def bullet(text):
    """Paragraphe puce avec le style 'Paragraphedeliste' du template."""
    return para(text, style="Paragraphedeliste")


# ============================================================
# BODY — suit EXACTEMENT la structure du template
# ============================================================
parts = []

# ---- En-tête ----
parts.append(para("FICHE DE GESTION DE CHANGEMENT", bold=True, align="center"))
parts.append(para("Demande de Validation — Mise à jour applicative", bold=True, align="center"))
parts.append(empty_para())

# ---- Tableau métadonnées (2 colonnes × 9 lignes) ----
mw = [3500, 6500]
meta_rows = [
    row_simple(["Référence ISO", "Réf : MO/POP/INF/XX-XX"], mw),
    row_simple(["Système / Module concerné",
                "E-Facture — module FNE/DGI (backend Node/Express + frontend React)"], mw),
    row_simple(["Version actuelle", "v1.0.0 (production au 23/04/2026)"], mw),
    row_simple(["Version cible", "v1.1.0 (snapshot 05/05/2026)"], mw),
    row_simple(["Porteur du changement", "Yannick Atse — Équipe Développement / DSI"], mw),
    row_simple(["Date de rédaction", "12/05/2026"], mw),
    row_simple(["Date de déploiement souhaitée",
                "[JJ/MM/AAAA] — Créneau : [heure début – heure fin]"], mw),
    row_simple(["Niveau de priorité", "Haute"], mw),
    row_simple(["Statut", "En attente de validation"], mw),
]
parts.append(table(meta_rows, mw))
parts.append(empty_para())

# ============================================================
# 1. CONTEXTE
# ============================================================
parts.append(para("1. CONTEXTE ET JUSTIFICATION DU CHANGEMENT", bold=True))
parts.append(para("1.1 Pourquoi cette mise à jour est-elle nécessaire ?", bold=True))
parts.append(para(
    "La version actuellement en production gère uniquement l'émission de factures vers la FNE/DGI. "
    "Plusieurs constats opérationnels ont conduit à étendre le périmètre : (i) absence de contrôle "
    "de cohérence entre les avoirs et leurs factures initiales, (ii) absence de typage invoice/refund "
    "en base, (iii) expérience utilisateur frontend obsolète basée sur des alert() natifs."
))
parts.append(empty_para())

cw = [3500, 6500]
ctx_rows = [
    row_simple(["Catégorie", "Description"], cw, bold=True, shade="D9E1F2"),
    row_simple(["Problème identifié",
                "Gestion incomplète des avoirs FNE (pas de typage, pas de contrôle de cohérence avec "
                "facture initiale, pas de notification opérateur sur blocage). UX frontend obsolète "
                "basée sur alert()."], cw),
    row_simple(["Impact métier actuel",
                "Risque de non-conformité réglementaire DGI sur les avoirs ; impossibilité d'auditer "
                "correctement les flux refunds ; ergonomie utilisateur dégradée."], cw),
    row_simple(["Origine / Source",
                "Audit interne FNE (avril 2026) + demande métier comptabilité."], cw),
    row_simple(["Référence ticket / incident", "N/A"], cw),
    row_simple(["Conséquence du non-changement",
                "Maintien du risque réglementaire sur les avoirs ; pas de traçabilité audit ; "
                "insatisfaction utilisateurs sur l'ergonomie."], cw),
]
parts.append(table(ctx_rows, cw))
parts.append(empty_para())

# ============================================================
# 2. NATURE ET PÉRIMÈTRE
# ============================================================
parts.append(para("2. NATURE ET PÉRIMÈTRE DU CHANGEMENT", bold=True))
parts.append(para("2.1 Ce qui a été modifié", bold=True))
parts.append(para(
    "Liste des composants techniques et fonctionnels concernés par cette mise à jour, regroupés "
    "par périmètre (Backend Node/Express + Frontend React)."
))
parts.append(empty_para())

# ---- BACKEND ----
parts.append(para("Backend — backend_efacture/", bold=True))
parts.append(empty_para())

parts.append(para("Migrations base de données (2 nouvelles) :", bold=True))
parts.append(bullet(
    "20260504000000-add-role-avoir-fetch-initial.js — Crée le rôle avoir.fetch_initial permettant "
    "de restreindre la récupération automatique de la facture initiale d'un avoir bloqué."
))
parts.append(bullet(
    "20260505000000-add-type-to-fne-invoices.js — Ajoute la colonne type ENUM('invoice','refund') "
    "à la table fne_invoices (+ index). Toutes les entrées existantes sont rétrofitées à 'invoice'."
))
parts.append(empty_para())

parts.append(para("Modèle modifié :", bold=True))
parts.append(bullet(
    "models/FneInvoice.js — Ajout du champ type (ENUM 'invoice' | 'refund', défaut 'invoice')."
))
parts.append(empty_para())

parts.append(para("Controller modifié — controllers/fneInvoiceController.js (+57 lignes) :", bold=True))
parts.append(bullet(
    "sendRefund() : bloque l'envoi si la facture initiale n'a pas été préalablement téléchargée ni "
    "envoyée à la FNE ; enregistre désormais l'avoir avec type='refund' dans fne_invoices et "
    "logs_actions (invoice_type='refund') ; gère les variantes de réponse API FNE "
    "(invoice.id, refund_id, credit_note_id)."
))
parts.append(bullet(
    "manualRegisterFne() : permet de recycler un log d'envoi échoué en succès manuel ; crée l'entrée "
    "FneInvoice correspondante avec le type adéquat."
))
parts.append(bullet(
    "Logging détaillé : numéro d'avoir, facture initiale, temps de réponse FNE, utilisateur opérateur."
))
parts.append(empty_para())

parts.append(para("Service ajouté :", bold=True))
parts.append(bullet(
    "services/notifyAvoirBlocked.js — Notifie les opérateurs lors du blocage d'un avoir incohérent "
    "avec sa facture initiale. Génère un HTML formaté (tables avoir/items, taux de matching), envoie "
    "via POST JSON avec retry (3 tentatives, délai 5 s)."
))
parts.append(empty_para())

parts.append(para("Scripts utilitaires ajoutés :", bold=True))
parts.append(bullet(
    "scripts/check_avoir_prod.js — Diagnostic ponctuel en PROD (recherche par numéro dans logs_actions, "
    "fne_invoices, downloaded_invoices)."
))
parts.append(bullet(
    "scripts/repair_refund_fne_invoices.js + repair_refund_fne_invoices_prod.js — Crée rétroactivement "
    "les entrées fne_invoices manquantes pour les avoirs envoyés avec succès avant la migration "
    "(mode dry-run / --apply)."
))
parts.append(bullet(
    "scripts/diag_avoir_via_bapi.js, inspect_feuil2.js, inspect_xlsx.js, concordance_*.js — Scripts "
    "d'audit et de concordance des avoirs avec les données SAP."
))
parts.append(empty_para())

parts.append(para("Endpoints (inchangés) :", bold=True))
parts.append(para(
    "routes/fneInvoiceRoutes.js conserve ses 5 endpoints : GET /by-sap-number/:numeroFacture, "
    "GET /:fneInvoiceId, POST /refund, POST /items/by-ids, POST /manual-register."
))
parts.append(empty_para())

parts.append(para("Sécurité / configuration :", bold=True))
parts.append(para(
    "middleware/auth.js, middleware/requireRole.js, index.js, configuration CORS : aucun changement."
))
parts.append(empty_para())

# ---- FRONTEND ----
parts.append(para("Frontend — frontend_efacture/", bold=True))
parts.append(empty_para())

parts.append(para("Contexte ajouté :", bold=True))
parts.append(bullet(
    "src/contexts/NotificationContext.js — Système centralisé de notifications/confirmations "
    "(modales) avec détection automatique du type (info, succès, avertissement, erreur) et support "
    "des boîtes de confirmation utilisateur."
))
parts.append(empty_para())

parts.append(para("Fichiers modifiés :", bold=True))
parts.append(bullet(
    "src/index.js — NotificationProvider enveloppe l'application (placé avant AuthProvider pour "
    "exposer useNotify() partout)."
))
parts.append(bullet(
    "src/App.js (+1143 lignes : 7767 → 8910) — Intégration massive du hook useNotify() (60+ appels "
    "à notify()/confirm()) ; remplacement systématique des alert() et console.log() utilisateur ; "
    "détection des sévérités côté notification."
))
parts.append(bullet(
    "src/pages/FneCancellationsPage.js (+127 lignes : 323 → 450) — Nouvelle barre de "
    "recherche/filtrage (par numéro de facture, référence FNE, catégorie) ; fonction formatMontant() : "
    "division par 10 + formatage fr-FR pour affichage correct des montants FNE."
))
parts.append(empty_para())

parts.append(para("Inchangés :", bold=True))
parts.append(para(
    "AuthContext.js, config/api.js, Login.js, SettingsPage.js, HomePage.js, Sidebar.js, utilitaires, "
    "styles : aucune modification → rétrocompatibilité maximale, aucun nouvel appel API, aucun "
    "changement d'authentification."
))
parts.append(empty_para())

# ============================================================
# 3. IMPACT — structure du template : paragraphes successifs label / valeur
# ============================================================
parts.append(para("3. IMPACT ATTENDU", bold=True))
parts.append(para("3.1 Impacts positifs", bold=True))
parts.append(empty_para())

# Impact 1
parts.append(para("Impact 1 — Conformité réglementaire des avoirs", bold=True))
parts.append(para_runs([
    ("Avant : ", True),
    ("Avoirs envoyés à la FNE sans contrôle de cohérence avec la facture initiale ; "
     "pas de typage en base.", False),
]))
parts.append(para_runs([
    ("Après : ", True),
    ("Blocage automatique des avoirs incohérents ; typage invoice/refund dans fne_invoices ; "
     "notification opérateur en cas de blocage.", False),
]))
parts.append(empty_para())

# Impact 2
parts.append(para("Impact 2 — Traçabilité et audit", bold=True))
parts.append(para_runs([
    ("Avant : ", True),
    ("Impossible de distinguer factures et avoirs dans les rapports.", False),
]))
parts.append(para_runs([
    ("Après : ", True),
    ("Colonne type indexée ; scripts d'audit (check_avoir_prod, repair_refund_fne_invoices) "
     "permettant la réparation rétroactive et le diagnostic.", False),
]))
parts.append(empty_para())

# Impact 3
parts.append(para("Impact 3 — Expérience utilisateur frontend", bold=True))
parts.append(para_runs([
    ("Avant : ", True),
    ("alert() natifs, peu lisibles, pas de niveaux de sévérité.", False),
]))
parts.append(para_runs([
    ("Après : ", True),
    ("Notifications contextuelles unifiées (succès / erreur / avertissement) + confirmations "
     "modales + recherche/filtrage sur la page doublons FNE.", False),
]))
parts.append(empty_para())

parts.append(para("3.2 Risques et impacts négatifs potentiels", bold=True))
parts.append(empty_para())

# Risque 1
parts.append(para_runs([
    ("Risque identifié : ", True),
    ("Migration add-type-to-fne-invoices sur la table fne_invoices en production.", False),
]))
parts.append(para_runs([
    ("Mesure d'atténuation : ", True),
    ("Migration testée en UAT ; sauvegarde complète avant déploiement ; rollback Sequelize "
     "disponible (db:migrate:undo).", False),
]))
parts.append(para("Probabilité : Faible"))
parts.append(para("Sévérité : Moyenne"))
parts.append(empty_para())

# Risque 2
parts.append(para_runs([
    ("Risque identifié : ", True),
    ("Régression UX sur les écrans utilisant alert() → notify().", False),
]))
parts.append(para_runs([
    ("Mesure d'atténuation : ", True),
    ("Tests utilisateurs en recette ; couverture des 60+ points d'appel notify() ; "
     "possibilité de basculer un écran sur l'ancien comportement via redéploiement partiel.", False),
]))
parts.append(para("Probabilité : Moyenne"))
parts.append(para("Sévérité : Faible"))
parts.append(empty_para())

# Risque 3
parts.append(para_runs([
    ("Risque identifié : ", True),
    ("Avoirs déjà envoyés à la FNE avant la migration, non typés 'refund' en base.", False),
]))
parts.append(para_runs([
    ("Mesure d'atténuation : ", True),
    ("Exécution du script repair_refund_fne_invoices_prod.js post-déploiement (mode --apply après "
     "validation dry-run) pour rétrofiter les entrées manquantes.", False),
]))
parts.append(para("Probabilité : Elevée (existence confirmée par audit)"))
parts.append(para("Sévérité : Faible (réparation scriptée)"))
parts.append(empty_para())

# ============================================================
# 4. DÉPLOIEMENT
# ============================================================
parts.append(para("4. PROPOSITIONS ET MODALITÉS DE DÉPLOIEMENT", bold=True))
parts.append(para("4.1 Plan de déploiement recommandé", bold=True))

dw = [800, 5500, 2200, 1500]
dep_rows = [
    row_simple(["Étape", "Action", "Responsable", "Délai estimé"], dw, bold=True, shade="D9E1F2"),
    row_simple(["1",
                "Sauvegarde complète de la base de production (pg_dump) et du code backend + "
                "frontend déployés",
                "Équipe infrastructure", "30 min"], dw),
    row_simple(["2",
                "Déploiement en environnement UAT (backend_efacture_05052026 + "
                "frontend_efacture_05052026) + exécution des migrations",
                "Équipe développement", "1 h"], dw),
    row_simple(["3",
                "Tests fonctionnels : émission facture, émission avoir cohérent, tentative d'avoir "
                "incohérent (blocage attendu), notifications UX",
                "Équipe QA + comptabilité", "2 h"], dw),
    row_simple(["4",
                "Go/No-Go — validation des parties prenantes (DSI, Responsable Informatique, métier)",
                "Chef de projet + validateurs", "30 min"], dw),
    row_simple(["5",
                "Déploiement production : pm2 stop → mise à jour code → npm install → "
                "sequelize db:migrate → pm2 restart → monitoring",
                "Équipe infrastructure + support", "1 h"], dw),
    row_simple(["6",
                "Exécution du script repair_refund_fne_invoices_prod.js --apply pour rétrofiter "
                "les avoirs antérieurs",
                "Équipe développement", "30 min"], dw),
]
parts.append(table(dep_rows, dw))
parts.append(empty_para())

# 4.2 Rollback : style du template = Paragraphedeliste
parts.append(para("4.2 Plan de rollback", bold=True))
parts.append(bullet(
    "Condition de déclenchement : échec des tests post-déploiement (envoi FNE en erreur > 5 %, "
    "blocage frontal des notifications, échec migration)."
))
parts.append(bullet(
    "Procédure : pm2 stop efacture-backend → sequelize db:migrate:undo --to "
    "20260423000002-add-fne-response-time-to-logs.js → restauration code backend + frontend v1.0.0 "
    "→ pm2 restart → vérification émission facture standard. Délai estimé : 20 minutes."
))
parts.append(bullet("Responsable du rollback : Équipe développement (Yannick Atse) + Équipe infrastructure."))
parts.append(bullet(
    "Communication en cas de rollback : email + canal Teams DSI immédiatement, comptabilité "
    "dans l'heure."
))
parts.append(empty_para())

# 4.3 Communication : style du template = Paragraphedeliste
parts.append(para("4.3 Plan de communication", bold=True))
parts.append(bullet(
    "Communication préalable aux utilisateurs : J-3, email + affichage intranet "
    "(DSI → utilisateurs comptables et facturation)."
))
parts.append(bullet(
    "Notification en cas d'interruption de service : bannière intranet + email comptable si > 15 min."
))
parts.append(bullet(
    "Information post-déploiement (succès ou rollback) : email récapitulatif à J+0, dans les 2 h "
    "suivant la fin du déploiement."
))
parts.append(empty_para())

# ============================================================
# 5. VALIDATION
# ============================================================
parts.append(para("5. VALIDATION ET APPROBATION", bold=True))
parts.append(para("5.1 Validation hiérarchique — Signatures requises", bold=True))
parts.append(para(
    "Les signataires ci-dessous attestent avoir pris connaissance du présent document et autorisent "
    "(ou refusent) le déploiement de la mise à jour décrite."
))
parts.append(empty_para())

# Tableau signatures 1×3, chaque cellule = 5 paragraphes (Nom / vide / Date / vide / Signature)
sig_widths = [3333, 3333, 3334]


def sig_cell(role, width):
    paras = [
        para(role, bold=True),
        empty_para(),
        para("Date : ____/ ____/ ____"),
        empty_para(),
        para("Signature :"),
    ]
    return cell_paras(paras, width)


sig_row = "<w:tr>" + sig_cell("Chef de Département", sig_widths[0]) \
          + sig_cell("Responsable Informatique", sig_widths[1]) \
          + sig_cell("DSI / Directeur SI", sig_widths[2]) \
          + "</w:tr>"
parts.append(table([sig_row], sig_widths))
parts.append(empty_para())

# 5.2 Commentaires : tableau 1×1
parts.append(para("5.2 Commentaires / Conditions de validation", bold=True))
comm_inner = [
    para("Commentaires libres, réserves ou conditions posées par les validateurs :"),
    empty_para(),
    empty_para(),
    empty_para(),
    empty_para(),
    empty_para(),
]
comm_row = "<w:tr>" + cell_paras(comm_inner, 10000) + "</w:tr>"
parts.append(table([comm_row], [10000]))

body_xml = "".join(parts)

# ============================================================
# Clone template & inject body
# ============================================================
work_dir = os.path.join(tempfile.gettempdir(), f"fiche_cm_build_{uuid.uuid4().hex}")
if os.path.exists(work_dir):
    shutil.rmtree(work_dir)
os.makedirs(work_dir)

with zipfile.ZipFile(SRC_TEMPLATE, "r") as zin:
    zin.extractall(work_dir)

doc_path = os.path.join(work_dir, "word", "document.xml")
with open(doc_path, "r", encoding="utf-8") as f:
    doc_xml = f.read()

sect_match = re.search(r"<w:sectPr[\s\S]*?</w:sectPr>", doc_xml)
sect_pr = sect_match.group(0) if sect_match else (
    '<w:sectPr><w:pgSz w:w="12240" w:h="15840"/>'
    '<w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" '
    'w:header="720" w:footer="720" w:gutter="0"/></w:sectPr>'
)

new_body = f"<w:body>{body_xml}{sect_pr}</w:body>"
new_doc = re.sub(r"<w:body>[\s\S]*</w:body>", lambda m: new_body, doc_xml, count=1)

with open(doc_path, "w", encoding="utf-8", newline="") as f:
    f.write(new_doc)

if os.path.exists(DST_DOCX):
    try:
        os.remove(DST_DOCX)
    except PermissionError:
        # Word file open → fail clearly so user knows to close it
        raise SystemExit(
            f"ERREUR : le fichier {DST_DOCX} est ouvert (probablement dans Word). "
            f"Ferme-le puis relance."
        )

with zipfile.ZipFile(DST_DOCX, "w", zipfile.ZIP_DEFLATED) as zout:
    for folder, _, files in os.walk(work_dir):
        for fname in files:
            full = os.path.join(folder, fname)
            rel = os.path.relpath(full, work_dir).replace("\\", "/")
            zout.write(full, rel)

shutil.rmtree(work_dir, ignore_errors=True)

size = os.path.getsize(DST_DOCX)
print(f"OK -> {DST_DOCX}")
print(f"Size: {size} bytes")
