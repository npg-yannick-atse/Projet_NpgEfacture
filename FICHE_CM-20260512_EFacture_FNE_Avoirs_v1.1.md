# FICHE DE GESTION DE CHANGEMENT
## Demande de Validation — Mise à jour applicative

| Champ | Valeur |
|---|---|
| **Référence ISO** | MO/POP/INF/XX-XX |
| **Système / Module concerné** | E-Facture — module FNE/DGI (backend Node/Express + frontend React) |
| **Version actuelle** | v1.0.0 (production au 23/04/2026) |
| **Version cible** | v1.1.0 (snapshot 05/05/2026) |
| **Porteur du changement** | Yannick Atse — Équipe Développement / DSI |
| **Date de rédaction** | 12/05/2026 |
| **Date de déploiement souhaitée** | [JJ/MM/AAAA] — Créneau : [heure début – heure fin] |
| **Niveau de priorité** | Haute |
| **Statut** | En attente de validation |

---

## 1. CONTEXTE ET JUSTIFICATION DU CHANGEMENT

### 1.1 Pourquoi cette mise à jour est-elle nécessaire ?

La version actuellement en production gère uniquement l'émission de **factures** vers la FNE/DGI. Plusieurs constats opérationnels ont conduit à étendre le périmètre :

- Les **avoirs (refunds)** émis depuis SAP étaient envoyés à la FNE sans contrôle de cohérence avec leur facture initiale, ce qui a généré des cas d'avoirs signés FNE sans facture initiale tracée — non conformes à la réglementation DGI.
- L'absence de typage `invoice / refund` dans la table `fne_invoices` rendait impossible la distinction des avoirs dans les rapports et audits.
- L'expérience utilisateur frontend reposait sur des `alert()` natifs du navigateur, peu lisibles et incompatibles avec une UX moderne (notifications non groupées, pas de confirmation contextuelle).

| Catégorie | Description |
|---|---|
| **Problème identifié** | Gestion incomplète des avoirs FNE (pas de typage, pas de contrôle de cohérence avec facture initiale, pas de mécanisme de notification opérateur sur blocage). UX frontend obsolète basée sur `alert()`. |
| **Impact métier actuel** | Risque de non-conformité réglementaire DGI sur les avoirs ; impossibilité d'auditer correctement les flux refunds ; ergonomie utilisateur dégradée. |
| **Origine / Source** | Audit interne FNE (avril 2026) + demande métier comptabilité. |
| **Référence ticket / incident** | N/A |
| **Conséquence du non-changement** | Maintien du risque réglementaire sur les avoirs ; pas de traçabilité audit ; insatisfaction utilisateurs sur l'ergonomie. |

---

## 2. NATURE ET PÉRIMÈTRE DU CHANGEMENT

### 2.1 Ce qui a été modifié

#### 🔧 Backend — `backend_efacture/`

**Migrations base de données (2 nouvelles)**

| Migration | Effet |
|---|---|
| `20260504000000-add-role-avoir-fetch-initial.js` | Crée le rôle `avoir.fetch_initial` permettant de restreindre la récupération automatique de la facture initiale d'un avoir bloqué. |
| `20260505000000-add-type-to-fne-invoices.js` | Ajoute la colonne `type ENUM('invoice','refund')` à la table `fne_invoices` (+ index). Toutes les entrées existantes sont rétrofitées à `'invoice'`. |

**Modèle modifié**

- `models/FneInvoice.js` — Ajout du champ `type` (`ENUM 'invoice' | 'refund'`, défaut `'invoice'`).

**Controller modifié**

- `controllers/fneInvoiceController.js` (+57 lignes)
  - `sendRefund()` : bloque l'envoi si la facture initiale n'a pas été préalablement téléchargée ni envoyée à la FNE ; enregistre désormais l'avoir avec `type='refund'` dans `fne_invoices` et `logs_actions` (`invoice_type='refund'`) ; gère les variantes de réponse de l'API FNE (`invoice.id`, `refund_id`, `credit_note_id`).
  - `manualRegisterFne()` : permet de recycler un log d'envoi échoué en succès manuel ; crée l'entrée `FneInvoice` correspondante avec le type adéquat.
  - Logging détaillé : numéro d'avoir, facture initiale, temps de réponse FNE, utilisateur opérateur.

**Service ajouté**

- `services/notifyAvoirBlocked.js` — Notifie les opérateurs lors du blocage d'un avoir incohérent avec sa facture initiale. Génère un HTML formaté (tables avoir/items, taux de matching), envoie via POST JSON avec retry (3 tentatives, délai 5 s).

**Scripts utilitaires ajoutés**

- `scripts/check_avoir_prod.js` — Diagnostic ponctuel en PROD (recherche par numéro dans `logs_actions`, `fne_invoices`, `downloaded_invoices`).
- `scripts/repair_refund_fne_invoices.js` + `repair_refund_fne_invoices_prod.js` — Crée rétroactivement les entrées `fne_invoices` manquantes pour les avoirs envoyés avec succès avant la migration (mode dry-run / `--apply`).
- `scripts/diag_avoir_via_bapi.js`, `inspect_feuil2.js`, `inspect_xlsx.js`, `concordance_*.js` — Scripts d'audit et de concordance des avoirs avec les données SAP.

**Endpoints (inchangés)** — `routes/fneInvoiceRoutes.js` conserve ses 5 endpoints : `GET /by-sap-number/:numeroFacture`, `GET /:fneInvoiceId`, `POST /refund`, `POST /items/by-ids`, `POST /manual-register`.

**Sécurité / configuration** — `middleware/auth.js`, `middleware/requireRole.js`, `index.js`, configuration CORS : aucun changement.

#### 🖥️ Frontend — `frontend_efacture/`

**Contexte ajouté**

- `src/contexts/NotificationContext.js` — Système centralisé de notifications/confirmations (modales) avec détection automatique du type (info, succès, avertissement, erreur) et support des boîtes de confirmation utilisateur.

**Fichiers modifiés**

- `src/index.js` — Le `NotificationProvider` enveloppe l'application (placé avant `AuthProvider` pour exposer `useNotify()` partout).
- `src/App.js` (+1143 lignes : 7767 → 8910)
  - Intégration massive du hook `useNotify()` (60+ appels à `notify()` / `confirm()`).
  - Remplacement systématique des `alert()` et `console.log()` utilisateur par `notify()`.
  - Détection des sévérités (succès, erreur, avertissement) côté notification.
- `src/pages/FneCancellationsPage.js` (+127 lignes : 323 → 450)
  - Nouvelle barre de recherche / filtrage (par numéro de facture, référence FNE, catégorie).
  - Fonction `formatMontant()` : division par 10 + formatage `fr-FR` pour affichage correct des montants FNE.

**Inchangés** — `AuthContext.js`, `config/api.js`, `Login.js`, `SettingsPage.js`, `HomePage.js`, `Sidebar.js`, utilitaires, styles : aucune modification → **rétrocompatibilité maximale**, aucun nouvel appel API, aucun changement d'authentification.

---

## 3. IMPACT ATTENDU

### 3.1 Impacts positifs

**Impact 1 — Conformité réglementaire des avoirs**
- *Avant* : Avoirs envoyés à la FNE sans contrôle de cohérence avec la facture initiale ; pas de typage en base.
- *Après* : Blocage automatique des avoirs incohérents ; typage `invoice/refund` dans `fne_invoices` ; notification opérateur en cas de blocage.

**Impact 2 — Traçabilité et audit**
- *Avant* : Impossible de distinguer factures et avoirs dans les rapports.
- *Après* : Colonne `type` indexée ; scripts d'audit (`check_avoir_prod`, `repair_refund_fne_invoices`) permettant la réparation rétroactive et le diagnostic.

**Impact 3 — Expérience utilisateur frontend**
- *Avant* : `alert()` natifs, peu lisibles, pas de niveaux de sévérité.
- *Après* : Notifications contextuelles unifiées (succès / erreur / avertissement) + confirmations modales + recherche/filtrage sur la page doublons FNE.

### 3.2 Risques et impacts négatifs potentiels

**Risque 1 — Migration `add-type-to-fne-invoices` sur table en production**
- *Mesure d'atténuation* : Migration testée en UAT ; sauvegarde complète avant déploiement ; rollback Sequelize disponible (`db:migrate:undo`).
- *Probabilité* : Faible
- *Sévérité* : Moyenne

**Risque 2 — Régression UX sur les écrans utilisant `alert()` → `notify()`**
- *Mesure d'atténuation* : Tests utilisateurs sur l'environnement de recette ; couverture des 60+ points d'appel `notify()` ; possibilité de basculer un écran sur l'ancien comportement via redéploiement partiel.
- *Probabilité* : Moyenne
- *Sévérité* : Faible

**Risque 3 — Avoirs déjà envoyés à la FNE avant la migration non typés `refund`**
- *Mesure d'atténuation* : Exécution du script `repair_refund_fne_invoices_prod.js` post-déploiement (en mode `--apply` après validation dry-run) pour rétrofiter les entrées manquantes.
- *Probabilité* : Élevée (existence confirmée par audit)
- *Sévérité* : Faible (réparation scriptée)

---

## 4. PROPOSITIONS ET MODALITÉS DE DÉPLOIEMENT

### 4.1 Plan de déploiement recommandé

| Étape | Action | Responsable | Délai estimé |
|---|---|---|---|
| 1 | Sauvegarde complète de la base de production (`pg_dump`) et du code backend + frontend déployés | Équipe infrastructure | 30 min |
| 2 | Déploiement en environnement UAT (`backend_efacture_05052026` + `frontend_efacture_05052026`) + exécution des migrations | Équipe développement | 1 h |
| 3 | Tests fonctionnels : émission facture, émission avoir cohérent, tentative d'avoir incohérent (blocage attendu), notifications UX | Équipe QA + comptabilité | 2 h |
| 4 | Go/No-Go — validation des parties prenantes (DSI, Responsable Informatique, métier) | Chef de projet + validateurs | 30 min |
| 5 | Déploiement production : `pm2 stop` → mise à jour code → `npm install` → `sequelize db:migrate` → `pm2 restart` → monitoring | Équipe infrastructure + support | 1 h |
| 6 | Exécution du script `repair_refund_fne_invoices_prod.js --apply` pour rétrofiter les avoirs antérieurs | Équipe développement | 30 min |

### 4.2 Plan de rollback

- **Condition de déclenchement** : Échec des tests post-déploiement (envoi FNE en erreur > 5 %, blocage frontal des notifications, échec migration).
- **Procédure** :
  1. `pm2 stop efacture-backend`
  2. `sequelize db:migrate:undo --to 20260423000002-add-fne-response-time-to-logs.js`
  3. Restauration du code backend + frontend v1.0.0
  4. `pm2 restart efacture-backend`
  5. Vérification émission facture standard
- **Délai estimé** : 20 minutes
- **Responsable du rollback** : Équipe développement (Yannick Atse) + Équipe infrastructure
- **Communication en cas de rollback** : Email + canal Teams DSI immédiatement, comptabilité dans l'heure

### 4.3 Plan de communication

- **Communication préalable aux utilisateurs** : J-3, email + affichage intranet (DSI → utilisateurs comptables et facturation).
- **Notification en cas d'interruption de service** : Bannière intranet + email comptable si > 15 min.
- **Information post-déploiement** : Email récapitulatif (succès ou rollback) à J+0, dans les 2 h suivant la fin du déploiement.

---

## 5. VALIDATION ET APPROBATION

### 5.1 Validation hiérarchique — Signatures requises

Les signataires ci-dessous attestent avoir pris connaissance du présent document et autorisent (ou refusent) le déploiement de la mise à jour décrite.

**Chef de Département**
Nom : _______________________
Date : ____ / ____ / ____
Signature :


**Responsable Informatique**
Nom : _______________________
Date : ____ / ____ / ____
Signature :


**DSI / Directeur SI**
Nom : _______________________
Date : ____ / ____ / ____
Signature :


### 5.2 Commentaires / Conditions de validation

_Commentaires libres, réserves ou conditions posées par les validateurs :_

_____________________________________________________________
_____________________________________________________________
_____________________________________________________________
_____________________________________________________________
