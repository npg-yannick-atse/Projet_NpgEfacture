$ErrorActionPreference = 'Stop'

$src      = 'd:\Users\yannick.atse\Desktop\E_Facture\FICHE_CM-AAAAMMJJ_NomModule_vX.X.docx_TEMPLATE.docx'
$dstDocx  = 'd:\Users\yannick.atse\Desktop\E_Facture\FICHE_CM-20260512_EFacture_FNE_Avoirs_v1.1.docx'
$workDir  = Join-Path $env:TEMP ('fiche_cm_build_' + [Guid]::NewGuid().ToString('N'))

if (Test-Path $workDir) { Remove-Item $workDir -Recurse -Force }
New-Item -ItemType Directory -Path $workDir | Out-Null

Add-Type -AssemblyName System.IO.Compression.FileSystem
[System.IO.Compression.ZipFile]::ExtractToDirectory($src, $workDir)

# ---------- XML helpers ----------
function XmlEscape($t) {
    if ($null -eq $t) { return '' }
    return $t.Replace('&','&amp;').Replace('<','&lt;').Replace('>','&gt;').Replace('"','&quot;')
}

function Para([string]$text, [string]$style = 'Normal', [bool]$bold = $false, [string]$align = $null) {
    $pPr = "<w:pPr><w:pStyle w:val=`"$style`"/>"
    if ($align) { $pPr += "<w:jc w:val=`"$align`"/>" }
    $pPr += "</w:pPr>"
    $rPr = if ($bold) { '<w:rPr><w:b/></w:rPr>' } else { '' }
    $escaped = XmlEscape $text
    return "<w:p>$pPr<w:r>$rPr<w:t xml:space=`"preserve`">$escaped</w:t></w:r></w:p>"
}

function ParaMulti([object[]]$runs, [string]$style = 'Normal', [string]$align = $null) {
    # runs : @( @{text='...'; bold=$true}, ... )
    $pPr = "<w:pPr><w:pStyle w:val=`"$style`"/>"
    if ($align) { $pPr += "<w:jc w:val=`"$align`"/>" }
    $pPr += "</w:pPr>"
    $runsXml = ''
    foreach ($r in $runs) {
        $rPr = if ($r.bold) { '<w:rPr><w:b/></w:rPr>' } else { '' }
        $t = XmlEscape $r.text
        $runsXml += "<w:r>$rPr<w:t xml:space=`"preserve`">$t</w:t></w:r>"
    }
    return "<w:p>$pPr$runsXml</w:p>"
}

function Bullet([string]$text) {
    # Paragraphe de liste avec puce manuelle (- texte) — simple et lisible
    return Para ("• " + $text) 'Paragraphedeliste'
}

function Cell([string]$text, [bool]$bold = $false, [int]$widthDxa = 4500, [string]$shade = $null) {
    $tcPr = "<w:tcPr><w:tcW w:w=`"$widthDxa`" w:type=`"dxa`"/>"
    if ($shade) { $tcPr += "<w:shd w:val=`"clear`" w:color=`"auto`" w:fill=`"$shade`"/>" }
    $tcPr += "</w:tcPr>"
    $rPr = if ($bold) { '<w:rPr><w:b/></w:rPr>' } else { '' }
    $escaped = XmlEscape $text
    return "<w:tc>$tcPr<w:p><w:r>$rPr<w:t xml:space=`"preserve`">$escaped</w:t></w:r></w:p></w:tc>"
}

function Row([string[]]$cells, [bool]$bold = $false, [int[]]$widths = $null, [string]$shade = $null) {
    $tr = '<w:tr>'
    for ($i = 0; $i -lt $cells.Count; $i++) {
        $w = if ($widths) { $widths[$i] } else { 4500 }
        $tr += Cell $cells[$i] $bold $w $shade
    }
    $tr += '</w:tr>'
    return $tr
}

function Table([object[]]$rows, [int[]]$widths) {
    $totalW = ($widths | Measure-Object -Sum).Sum
    $tbl = "<w:tbl><w:tblPr><w:tblW w:w=`"$totalW`" w:type=`"dxa`"/><w:tblBorders><w:top w:val=`"single`" w:sz=`"4`" w:space=`"0`" w:color=`"auto`"/><w:left w:val=`"single`" w:sz=`"4`" w:space=`"0`" w:color=`"auto`"/><w:bottom w:val=`"single`" w:sz=`"4`" w:space=`"0`" w:color=`"auto`"/><w:right w:val=`"single`" w:sz=`"4`" w:space=`"0`" w:color=`"auto`"/><w:insideH w:val=`"single`" w:sz=`"4`" w:space=`"0`" w:color=`"auto`"/><w:insideV w:val=`"single`" w:sz=`"4`" w:space=`"0`" w:color=`"auto`"/></w:tblBorders><w:tblLayout w:type=`"fixed`"/></w:tblPr><w:tblGrid>"
    foreach ($w in $widths) { $tbl += "<w:gridCol w:w=`"$w`"/>" }
    $tbl += '</w:tblGrid>'
    foreach ($r in $rows) { $tbl += $r }
    $tbl += '</w:tbl>'
    return $tbl
}

function Spacer() { return Para '' 'Normal' }

# ---------- Build body ----------
$body = New-Object System.Text.StringBuilder

[void]$body.Append( (Para 'FICHE DE GESTION DE CHANGEMENT' 'Titre' $true 'center') )
[void]$body.Append( (Para 'Demande de Validation — Mise à jour applicative' 'Titre1' $false 'center') )
[void]$body.Append( (Spacer) )

# --- Métadonnées ---
$metaRows = @(
    (Row @('Référence ISO', 'MO/POP/INF/XX-XX') $false @(3500, 6500)),
    (Row @('Système / Module concerné', 'E-Facture — module FNE/DGI (backend Node/Express + frontend React)') $false @(3500, 6500)),
    (Row @('Version actuelle', 'v1.0.0 (production au 23/04/2026)') $false @(3500, 6500)),
    (Row @('Version cible', 'v1.1.0 (snapshot 05/05/2026)') $false @(3500, 6500)),
    (Row @('Porteur du changement', 'Yannick Atse — Équipe Développement / DSI') $false @(3500, 6500)),
    (Row @('Date de rédaction', '12/05/2026') $false @(3500, 6500)),
    (Row @('Date de déploiement souhaitée', '[JJ/MM/AAAA] — Créneau : [heure début – heure fin]') $false @(3500, 6500)),
    (Row @('Niveau de priorité', 'Haute') $false @(3500, 6500)),
    (Row @('Statut', 'En attente de validation') $false @(3500, 6500))
)
[void]$body.Append( (Table $metaRows @(3500, 6500)) )
[void]$body.Append( (Spacer) )

# --- 1. CONTEXTE ---
[void]$body.Append( (Para '1. CONTEXTE ET JUSTIFICATION DU CHANGEMENT' 'Titre1') )
[void]$body.Append( (Para '1.1 Pourquoi cette mise à jour est-elle nécessaire ?' 'Titre2') )
[void]$body.Append( (Para "La version actuellement en production gère uniquement l'émission de factures vers la FNE/DGI. Plusieurs constats opérationnels ont conduit à étendre le périmètre :") )
[void]$body.Append( (Bullet "Les avoirs (refunds) émis depuis SAP étaient envoyés à la FNE sans contrôle de cohérence avec leur facture initiale, ce qui a généré des cas d'avoirs signés FNE sans facture initiale tracée — non conformes à la réglementation DGI.") )
[void]$body.Append( (Bullet "L'absence de typage invoice/refund dans la table fne_invoices rendait impossible la distinction des avoirs dans les rapports et audits.") )
[void]$body.Append( (Bullet "L'expérience utilisateur frontend reposait sur des alert() natifs du navigateur, peu lisibles et incompatibles avec une UX moderne.") )
[void]$body.Append( (Spacer) )

$ctxRows = @(
    (Row @('Catégorie', 'Description') $true @(3500, 6500) 'D9E1F2'),
    (Row @('Problème identifié', "Gestion incomplète des avoirs FNE (pas de typage, pas de contrôle de cohérence avec facture initiale, pas de mécanisme de notification opérateur sur blocage). UX frontend obsolète basée sur alert().") $false @(3500, 6500)),
    (Row @('Impact métier actuel', "Risque de non-conformité réglementaire DGI sur les avoirs ; impossibilité d'auditer correctement les flux refunds ; ergonomie utilisateur dégradée.") $false @(3500, 6500)),
    (Row @('Origine / Source', 'Audit interne FNE (avril 2026) + demande métier comptabilité.') $false @(3500, 6500)),
    (Row @('Référence ticket / incident', 'N/A') $false @(3500, 6500)),
    (Row @('Conséquence du non-changement', "Maintien du risque réglementaire sur les avoirs ; pas de traçabilité audit ; insatisfaction utilisateurs sur l'ergonomie.") $false @(3500, 6500))
)
[void]$body.Append( (Table $ctxRows @(3500, 6500)) )
[void]$body.Append( (Spacer) )

# --- 2. NATURE ET PÉRIMÈTRE ---
[void]$body.Append( (Para '2. NATURE ET PÉRIMÈTRE DU CHANGEMENT' 'Titre1') )
[void]$body.Append( (Para '2.1 Ce qui a été modifié' 'Titre2') )

[void]$body.Append( (Para 'Backend — backend_efacture/' 'Titre3') )

[void]$body.Append( (ParaMulti @(@{text='Migrations base de données (2 nouvelles)'; bold=$true})) )
$migRows = @(
    (Row @('Migration', 'Effet') $true @(4500, 5500) 'D9E1F2'),
    (Row @('20260504000000-add-role-avoir-fetch-initial.js', "Crée le rôle avoir.fetch_initial permettant de restreindre la récupération automatique de la facture initiale d'un avoir bloqué.") $false @(4500, 5500)),
    (Row @('20260505000000-add-type-to-fne-invoices.js', "Ajoute la colonne type ENUM('invoice','refund') à la table fne_invoices (+ index). Toutes les entrées existantes sont rétrofitées à 'invoice'.") $false @(4500, 5500))
)
[void]$body.Append( (Table $migRows @(4500, 5500)) )
[void]$body.Append( (Spacer) )

[void]$body.Append( (ParaMulti @(@{text='Modèle modifié'; bold=$true})) )
[void]$body.Append( (Bullet "models/FneInvoice.js — Ajout du champ type (ENUM 'invoice' | 'refund', défaut 'invoice').") )
[void]$body.Append( (Spacer) )

[void]$body.Append( (ParaMulti @(@{text='Controller modifié'; bold=$true})) )
[void]$body.Append( (Bullet "controllers/fneInvoiceController.js (+57 lignes)") )
[void]$body.Append( (Bullet "sendRefund() : bloque l'envoi si la facture initiale n'a pas été préalablement téléchargée ni envoyée à la FNE ; enregistre désormais l'avoir avec type='refund' dans fne_invoices et logs_actions (invoice_type='refund') ; gère les variantes de réponse API FNE (invoice.id, refund_id, credit_note_id).") )
[void]$body.Append( (Bullet "manualRegisterFne() : permet de recycler un log d'envoi échoué en succès manuel ; crée l'entrée FneInvoice correspondante avec le type adéquat.") )
[void]$body.Append( (Bullet "Logging détaillé : numéro d'avoir, facture initiale, temps de réponse FNE, utilisateur opérateur.") )
[void]$body.Append( (Spacer) )

[void]$body.Append( (ParaMulti @(@{text='Service ajouté'; bold=$true})) )
[void]$body.Append( (Bullet "services/notifyAvoirBlocked.js — Notifie les opérateurs lors du blocage d'un avoir incohérent avec sa facture initiale. Génère un HTML formaté (tables avoir/items, taux de matching), envoie via POST JSON avec retry (3 tentatives, délai 5 s).") )
[void]$body.Append( (Spacer) )

[void]$body.Append( (ParaMulti @(@{text='Scripts utilitaires ajoutés'; bold=$true})) )
[void]$body.Append( (Bullet "scripts/check_avoir_prod.js — Diagnostic ponctuel en PROD (recherche par numéro dans logs_actions, fne_invoices, downloaded_invoices).") )
[void]$body.Append( (Bullet "scripts/repair_refund_fne_invoices.js + repair_refund_fne_invoices_prod.js — Crée rétroactivement les entrées fne_invoices manquantes pour les avoirs envoyés avec succès avant la migration (mode dry-run / --apply).") )
[void]$body.Append( (Bullet "scripts/diag_avoir_via_bapi.js, inspect_feuil2.js, inspect_xlsx.js, concordance_*.js — Scripts d'audit et de concordance des avoirs avec les données SAP.") )
[void]$body.Append( (Spacer) )

[void]$body.Append( (ParaMulti @(@{text='Endpoints (inchangés)'; bold=$true})) )
[void]$body.Append( (Para "routes/fneInvoiceRoutes.js conserve ses 5 endpoints : GET /by-sap-number/:numeroFacture, GET /:fneInvoiceId, POST /refund, POST /items/by-ids, POST /manual-register.") )
[void]$body.Append( (Spacer) )

[void]$body.Append( (ParaMulti @(@{text='Sécurité / configuration'; bold=$true})) )
[void]$body.Append( (Para "middleware/auth.js, middleware/requireRole.js, index.js, configuration CORS : aucun changement.") )
[void]$body.Append( (Spacer) )

[void]$body.Append( (Para 'Frontend — frontend_efacture/' 'Titre3') )

[void]$body.Append( (ParaMulti @(@{text='Contexte ajouté'; bold=$true})) )
[void]$body.Append( (Bullet "src/contexts/NotificationContext.js — Système centralisé de notifications/confirmations (modales) avec détection automatique du type (info, succès, avertissement, erreur) et support des boîtes de confirmation utilisateur.") )
[void]$body.Append( (Spacer) )

[void]$body.Append( (ParaMulti @(@{text='Fichiers modifiés'; bold=$true})) )
[void]$body.Append( (Bullet "src/index.js — NotificationProvider enveloppe l'application (placé avant AuthProvider pour exposer useNotify() partout).") )
[void]$body.Append( (Bullet "src/App.js (+1143 lignes : 7767 → 8910) — Intégration massive du hook useNotify() (60+ appels à notify()/confirm()) ; remplacement systématique des alert() et console.log() utilisateur ; détection des sévérités côté notification.") )
[void]$body.Append( (Bullet "src/pages/FneCancellationsPage.js (+127 lignes : 323 → 450) — Nouvelle barre de recherche/filtrage (par numéro de facture, référence FNE, catégorie) ; fonction formatMontant() : division par 10 + formatage fr-FR pour affichage correct des montants FNE.") )
[void]$body.Append( (Spacer) )

[void]$body.Append( (ParaMulti @(@{text='Inchangés'; bold=$true})) )
[void]$body.Append( (Para "AuthContext.js, config/api.js, Login.js, SettingsPage.js, HomePage.js, Sidebar.js, utilitaires, styles : aucune modification → rétrocompatibilité maximale, aucun nouvel appel API, aucun changement d'authentification.") )
[void]$body.Append( (Spacer) )

# --- 3. IMPACT ATTENDU ---
[void]$body.Append( (Para '3. IMPACT ATTENDU' 'Titre1') )
[void]$body.Append( (Para '3.1 Impacts positifs' 'Titre2') )

[void]$body.Append( (ParaMulti @(@{text='Impact 1 — Conformité réglementaire des avoirs'; bold=$true})) )
[void]$body.Append( (ParaMulti @(@{text='Avant : '; bold=$true}, @{text='Avoirs envoyés à la FNE sans contrôle de cohérence avec la facture initiale ; pas de typage en base.'})) )
[void]$body.Append( (ParaMulti @(@{text='Après : '; bold=$true}, @{text="Blocage automatique des avoirs incohérents ; typage invoice/refund dans fne_invoices ; notification opérateur en cas de blocage."})) )
[void]$body.Append( (Spacer) )

[void]$body.Append( (ParaMulti @(@{text='Impact 2 — Traçabilité et audit'; bold=$true})) )
[void]$body.Append( (ParaMulti @(@{text='Avant : '; bold=$true}, @{text='Impossible de distinguer factures et avoirs dans les rapports.'})) )
[void]$body.Append( (ParaMulti @(@{text='Après : '; bold=$true}, @{text="Colonne type indexée ; scripts d'audit (check_avoir_prod, repair_refund_fne_invoices) permettant la réparation rétroactive et le diagnostic."})) )
[void]$body.Append( (Spacer) )

[void]$body.Append( (ParaMulti @(@{text='Impact 3 — Expérience utilisateur frontend'; bold=$true})) )
[void]$body.Append( (ParaMulti @(@{text='Avant : '; bold=$true}, @{text="alert() natifs, peu lisibles, pas de niveaux de sévérité."})) )
[void]$body.Append( (ParaMulti @(@{text='Après : '; bold=$true}, @{text='Notifications contextuelles unifiées (succès / erreur / avertissement) + confirmations modales + recherche/filtrage sur la page doublons FNE.'})) )
[void]$body.Append( (Spacer) )

[void]$body.Append( (Para '3.2 Risques et impacts négatifs potentiels' 'Titre2') )

[void]$body.Append( (ParaMulti @(@{text='Risque 1 — Migration add-type-to-fne-invoices sur table en production'; bold=$true})) )
[void]$body.Append( (Bullet "Mesure d'atténuation : Migration testée en UAT ; sauvegarde complète avant déploiement ; rollback Sequelize disponible (db:migrate:undo).") )
[void]$body.Append( (Bullet "Probabilité : Faible") )
[void]$body.Append( (Bullet "Sévérité : Moyenne") )
[void]$body.Append( (Spacer) )

[void]$body.Append( (ParaMulti @(@{text='Risque 2 — Régression UX sur les écrans utilisant alert() → notify()'; bold=$true})) )
[void]$body.Append( (Bullet "Mesure d'atténuation : Tests utilisateurs sur l'environnement de recette ; couverture des 60+ points d'appel notify() ; possibilité de basculer un écran sur l'ancien comportement via redéploiement partiel.") )
[void]$body.Append( (Bullet "Probabilité : Moyenne") )
[void]$body.Append( (Bullet "Sévérité : Faible") )
[void]$body.Append( (Spacer) )

[void]$body.Append( (ParaMulti @(@{text="Risque 3 — Avoirs déjà envoyés à la FNE avant la migration non typés 'refund'"; bold=$true})) )
[void]$body.Append( (Bullet "Mesure d'atténuation : Exécution du script repair_refund_fne_invoices_prod.js post-déploiement (en mode --apply après validation dry-run) pour rétrofiter les entrées manquantes.") )
[void]$body.Append( (Bullet "Probabilité : Élevée (existence confirmée par audit)") )
[void]$body.Append( (Bullet "Sévérité : Faible (réparation scriptée)") )
[void]$body.Append( (Spacer) )

# --- 4. DÉPLOIEMENT ---
[void]$body.Append( (Para '4. PROPOSITIONS ET MODALITÉS DE DÉPLOIEMENT' 'Titre1') )
[void]$body.Append( (Para '4.1 Plan de déploiement recommandé' 'Titre2') )

$depRows = @(
    (Row @('Étape', 'Action', 'Responsable', 'Délai estimé') $true @(800, 5500, 2200, 1500) 'D9E1F2'),
    (Row @('1', "Sauvegarde complète de la base de production (pg_dump) et du code backend + frontend déployés", 'Équipe infrastructure', '30 min') $false @(800, 5500, 2200, 1500)),
    (Row @('2', "Déploiement en environnement UAT (backend_efacture_05052026 + frontend_efacture_05052026) + exécution des migrations", 'Équipe développement', '1 h') $false @(800, 5500, 2200, 1500)),
    (Row @('3', "Tests fonctionnels : émission facture, émission avoir cohérent, tentative d'avoir incohérent (blocage attendu), notifications UX", 'Équipe QA + comptabilité', '2 h') $false @(800, 5500, 2200, 1500)),
    (Row @('4', 'Go/No-Go — validation des parties prenantes (DSI, Responsable Informatique, métier)', 'Chef de projet + validateurs', '30 min') $false @(800, 5500, 2200, 1500)),
    (Row @('5', 'Déploiement production : pm2 stop → mise à jour code → npm install → sequelize db:migrate → pm2 restart → monitoring', 'Équipe infrastructure + support', '1 h') $false @(800, 5500, 2200, 1500)),
    (Row @('6', "Exécution du script repair_refund_fne_invoices_prod.js --apply pour rétrofiter les avoirs antérieurs", 'Équipe développement', '30 min') $false @(800, 5500, 2200, 1500))
)
[void]$body.Append( (Table $depRows @(800, 5500, 2200, 1500)) )
[void]$body.Append( (Spacer) )

[void]$body.Append( (Para '4.2 Plan de rollback' 'Titre2') )
[void]$body.Append( (ParaMulti @(@{text='Condition de déclenchement : '; bold=$true}, @{text='Échec des tests post-déploiement (envoi FNE en erreur > 5 %, blocage frontal des notifications, échec migration).'})) )
[void]$body.Append( (ParaMulti @(@{text='Procédure : '; bold=$true})) )
[void]$body.Append( (Bullet "pm2 stop efacture-backend") )
[void]$body.Append( (Bullet "sequelize db:migrate:undo --to 20260423000002-add-fne-response-time-to-logs.js") )
[void]$body.Append( (Bullet "Restauration du code backend + frontend v1.0.0") )
[void]$body.Append( (Bullet "pm2 restart efacture-backend") )
[void]$body.Append( (Bullet "Vérification émission facture standard") )
[void]$body.Append( (ParaMulti @(@{text='Délai estimé : '; bold=$true}, @{text='20 minutes'})) )
[void]$body.Append( (ParaMulti @(@{text='Responsable du rollback : '; bold=$true}, @{text='Équipe développement (Yannick Atse) + Équipe infrastructure'})) )
[void]$body.Append( (ParaMulti @(@{text='Communication en cas de rollback : '; bold=$true}, @{text='Email + canal Teams DSI immédiatement, comptabilité dans l'heure.'})) )
[void]$body.Append( (Spacer) )

[void]$body.Append( (Para '4.3 Plan de communication' 'Titre2') )
[void]$body.Append( (Bullet "Communication préalable aux utilisateurs : J-3, email + affichage intranet (DSI → utilisateurs comptables et facturation).") )
[void]$body.Append( (Bullet "Notification en cas d'interruption de service : Bannière intranet + email comptable si > 15 min.") )
[void]$body.Append( (Bullet "Information post-déploiement : Email récapitulatif (succès ou rollback) à J+0, dans les 2 h suivant la fin du déploiement.") )
[void]$body.Append( (Spacer) )

# --- 5. VALIDATION ---
[void]$body.Append( (Para '5. VALIDATION ET APPROBATION' 'Titre1') )
[void]$body.Append( (Para '5.1 Validation hiérarchique — Signatures requises' 'Titre2') )
[void]$body.Append( (Para "Les signataires ci-dessous attestent avoir pris connaissance du présent document et autorisent (ou refusent) le déploiement de la mise à jour décrite.") )
[void]$body.Append( (Spacer) )

$sigRows = @(
    (Row @('Rôle', 'Nom', 'Date', 'Signature') $true @(2500, 3000, 2000, 2500) 'D9E1F2'),
    (Row @('Chef de Département', '', '____/____/____', '') $false @(2500, 3000, 2000, 2500)),
    (Row @('Responsable Informatique', '', '____/____/____', '') $false @(2500, 3000, 2000, 2500)),
    (Row @('DSI / Directeur SI', '', '____/____/____', '') $false @(2500, 3000, 2000, 2500))
)
[void]$body.Append( (Table $sigRows @(2500, 3000, 2000, 2500)) )
[void]$body.Append( (Spacer) )

[void]$body.Append( (Para '5.2 Commentaires / Conditions de validation' 'Titre2') )
[void]$body.Append( (Para 'Commentaires libres, réserves ou conditions posées par les validateurs :') )
[void]$body.Append( (Para '____________________________________________________________________________') )
[void]$body.Append( (Para '____________________________________________________________________________') )
[void]$body.Append( (Para '____________________________________________________________________________') )
[void]$body.Append( (Para '____________________________________________________________________________') )

$bodyXml = $body.ToString()

# ---------- Inject into template document.xml ----------
$docPath = Join-Path $workDir 'word\document.xml'
$docXml  = Get-Content $docPath -Raw -Encoding UTF8

# Extract original sectPr (page settings) so we keep header/footer & page size
$sectPrMatch = [regex]::Match($docXml, '<w:sectPr[\s\S]*?</w:sectPr>')
$sectPr = if ($sectPrMatch.Success) { $sectPrMatch.Value } else { '<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr>' }

# Find the <w:body>...</w:body> block and replace
$newBody = "<w:body>$bodyXml$sectPr</w:body>"
$newDoc  = [regex]::Replace($docXml, '<w:body>[\s\S]*</w:body>', { param($m) $newBody })

# Save document.xml with UTF-8 (no BOM) — Word expects this
$utf8NoBom = New-Object System.Text.UTF8Encoding $false
[System.IO.File]::WriteAllText($docPath, $newDoc, $utf8NoBom)

# ---------- Re-zip into .docx ----------
if (Test-Path $dstDocx) { Remove-Item $dstDocx -Force }
[System.IO.Compression.ZipFile]::CreateFromDirectory($workDir, $dstDocx, [System.IO.Compression.CompressionLevel]::Optimal, $false)

Write-Output "OK -> $dstDocx"
Write-Output ('Size: ' + (Get-Item $dstDocx).Length + ' bytes')

# Cleanup
Remove-Item $workDir -Recurse -Force
