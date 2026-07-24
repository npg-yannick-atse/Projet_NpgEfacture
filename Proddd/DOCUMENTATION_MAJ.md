# Documentation — Mise à jour E-Facture

> **Périmètre :** page « Factures Non FNE » (liste noire) + contrôles à l'enregistrement
> (existence SAP, doublon, notification mail) + gestion par autorisations + traçabilité
> + filtre par date + blocage au téléchargement + compteur d'impressions (pointage) sur la page Statut Facture.

---

## 1. Résumé fonctionnel

Cette mise à jour apporte **5 évolutions** :

1. **Factures Non FNE (liste noire)** — nouvelle page pour enregistrer des factures **à ne pas envoyer à la FNE**. Elles sont stockées dans `auto_download_flagged` et **ignorées par le job** de téléchargement automatique.
2. **Contrôles à l'enregistrement** — avant d'ajouter une facture en liste noire, le système vérifie qu'elle **existe dans SAP**, qu'elle n'est **ni déjà téléchargée ni déjà envoyée**, et **récupère le nom du client**.
3. **Blocage au téléchargement** — une facture en liste noire ne peut plus être téléchargée : message clair au lieu du message trompeur « déjà téléchargée et envoyée ».
4. **Gestion par autorisations + traçabilité** — accès à la page géré par permissions (`non_fne.view` / `non_fne.manage` / `non_fne.delete`), et enregistrement de **qui** a ajouté chaque facture et **quand**.
5. **Compteur d'impressions (pointage)** — sur la page **Statut Facture**, un compteur affiche le **nombre d'impressions** de chaque facture, à côté du bouton d'impression.

---

## 2. Détail des fonctionnalités

### 2.1 Page « Factures Non FNE »

- **Emplacement :** menu latéral → section Administration → **Factures Non FNE**.
- **Ajouter** une facture : saisir le numéro, cliquer **Vérifier** (récupère le nom client SAP + statut), puis **Ajouter**.
- **Liste** : numéro, client, type, motif, **enregistré par**, **enregistré le**, action de suppression.
- **Filtre par date** : affiche par défaut **les factures du jour** ; champs *Du / Au* (filtrage côté serveur) + bouton *Tout afficher*.
- **Recherche** par numéro de facture.

### 2.2 Contrôles à l'enregistrement (ordre d'exécution)

1. **Déjà ENVOYÉE à la FNE ?** → **blocage** + **mail** de notification.
2. **Déjà TÉLÉCHARGÉE ?** → **blocage** + **mail** de notification.
3. **Existe dans SAP ?** (table VBRK) → si non, **blocage** (« n'existe pas dans SAP »).
   - Garde-fou : un numéro numérique de **plus de 10 chiffres** est rejeté immédiatement (VBELN = CHAR(10)).
4. Si tout est OK → enregistrement en liste noire, avec le **nom client** (KNA1) et le type de document (FKART).

> **Clé de notification (blocage Non FNE) :** `4d119a18ee214d18a66b`
> Les mails partent vers `http://10.10.2.17:3030/notifications` (le backend doit joindre ce service).

### 2.3 Blocage au téléchargement

Lors d'un téléchargement de facture (`getInvoiceDocument`), un **contrôle liste noire prioritaire** est effectué :
si la facture est en `non_fne`, le téléchargement est refusé avec le message :

> « La facture XXXX est en liste noire (Non FNE) — à ne pas envoyer à la FNE. »

### 2.4 Job de téléchargement automatique

Le job **ignore** désormais toute facture présente dans `auto_download_flagged` (liste noire, avoirs, problèmes déjà vus) → elles ne sont pas re-téléchargées.

### 2.5 Compteur d'impressions (page Statut Facture)

- À **chaque impression** (bouton unitaire, historique ou impression groupée), le compteur `print_count` de la facture est **incrémenté**.
- Affiché sous forme de puce **🖨 N** à côté du bouton d'impression (détail, recherche en masse, historique).

---

## 3. Autorisations (rôles)

| Code | Libellé | Portée |
|---|---|---|
| `non_fne.view` | Voir les factures Non FNE | Lecture de la liste |
| `non_fne.manage` | Gérer les factures Non FNE (liste noire) | Ajout / mise à jour + bouton Vérifier |
| `non_fne.delete` | Supprimer une facture Non FNE (liste noire) | Suppression |

- **Lecture** : `non_fne.view` **ou** `non_fne.manage` **ou** `non_fne.delete`.
- **Ajout/MAJ** : `non_fne.manage`.
- **Suppression** : `non_fne.delete`.
- Les administrateurs conservent l'accès. Les rôles se cochent dans **Paramètres → autorisations**.

---

## 4. Base de données

### 4.1 Tables impactées (aucune nouvelle table sur cette MAJ)

| Table | Changement |
|---|---|
| `auto_download_flagged` | enum `kind` élargi à `non_fne` + colonne `created_by VARCHAR(100)` |
| `bl_validations` | colonne `print_count INT NOT NULL DEFAULT 0` |
| `roles` | 3 rôles ajoutés (`non_fne.view`, `non_fne.manage`, `non_fne.delete`) |

### 4.2 SQL à exécuter (idempotent)

```sql
ALTER TABLE auto_download_flagged
  MODIFY COLUMN kind ENUM('avoir','probleme','non_fne') NOT NULL;
ALTER TABLE auto_download_flagged ADD COLUMN created_by VARCHAR(100) NULL;

ALTER TABLE bl_validations ADD COLUMN print_count INT NOT NULL DEFAULT 0;

INSERT IGNORE INTO roles (code, label, created_at) VALUES
  ('non_fne.view',   'Voir les factures Non FNE',                   NOW()),
  ('non_fne.manage', 'Gérer les factures Non FNE (liste noire)',    NOW()),
  ('non_fne.delete', 'Supprimer une facture Non FNE (liste noire)', NOW());
```

> Le fichier `DEPLOY.sql` contient l'ensemble du schéma (y compris les tables des versions précédentes).

---

## 5. API (endpoints)

| Méthode | Route | Permission | Rôle |
|---|---|---|---|
| GET | `/api/non-fne` | `non_fne.view` / `manage` / `delete` | Liste (params : `search`, `startDate`, `endDate`, `kind`) |
| POST | `/api/non-fne/check` | `non_fne.manage` | Vérif SAP + nom client + statut (sans enregistrer) |
| POST | `/api/non-fne` | `non_fne.manage` | Ajout (avec les 3 contrôles + mail si bloqué) |
| DELETE | `/api/non-fne/:numero` | `non_fne.delete` | Suppression |

Endpoint existant enrichi : `POST /api/bl-validations/invoice/:numero/print` incrémente `print_count`.

---

## 6. Fichiers modifiés / créés

### Backend — `backend_efacture_21052026/`
**Nouveaux :**
- `controllers/nonFneController.js`
- `routes/nonFneRoutes.js`
- `services/checkSapInvoice.js`
- `services/notifyNonFneBlocked.js`
- `migrations/20260626000000-add-non-fne-kind.js`
- `migrations/20260626000001-add-non-fne-author-and-roles.js`
- `migrations/20260626000002-add-non-fne-delete-role.js`
- `migrations/20260701000000-add-print-count-bl-validations.js`

**Modifiés :**
- `index.js` — montage `/api/non-fne`
- `models/AutoDownloadFlagged.js` — enum `non_fne` + `created_by`
- `models/BlValidation.js` — `print_count`
- `services/autoDownloadJob.js` — ignore les factures signalées
- `controllers/sapInvoiceController.js` — blocage liste noire au téléchargement
- `controllers/blValidationController.js` — incrément `print_count` + `serialize`

### Frontend — `frontend_efacture_210526/src/`
**Nouveau :**
- `pages/NonFnePage.js`

**Modifiés :**
- `App.js` — vue Non FNE (par permission) + message 409 lisible
- `components/Sidebar.js` — entrée menu Non FNE (par permission)
- `config/api.js` — endpoints `NON_FNE` (+ `CHECK`)
- `pages/BlValidationPage.js` — compteur d'impressions

### Base de données
- `DEPLOY.sql` (mis à jour)

---

## 7. Procédure de déploiement (PROD)

1. **Base de données** : exécuter le SQL du §4.2 (ou `DEPLOY.sql`).
2. **Backend** : copier les fichiers, puis **redémarrer** (`pm2 restart <app>`).
   > Sans redémarrage, les contrôles SAP / liste noire ne s'exécutent pas.
3. **Frontend** : copier les fichiers, **rebuild** (`npm run build`), déployer.
4. **Autorisations** : cocher `non_fne.*` aux utilisateurs concernés.
5. **Réseau** : vérifier que le backend joint `http://10.10.2.17:3030/notifications` (mails).

### Différences dev / prod (volontaires)
| Fichier | Prod | Dev |
|---|---|---|
| `index.js` | `PORT || 8050` | `PORT || 6050` |
| `config/api.js` | `http://10.10.2.55:8050` | `http://10.10.32.2:6050` |
| `App.js` | FNE prod + titre `E_Facture` | FNE dev + `E_Facture DEV` |

---

## 8. Tests de validation (recette)

- [ ] Ajouter une facture **inexistante** (ex. 16 chiffres) → refus « n'existe pas dans SAP ».
- [ ] Ajouter une facture **déjà envoyée** → refus + mail reçu (clé `4d119a18ee214d18a66b`).
- [ ] Ajouter une facture **déjà téléchargée** → refus + mail reçu.
- [ ] Ajouter une facture **valide non traitée** → nom client affiché + enregistrement OK.
- [ ] **Télécharger** une facture en liste noire → message « en liste noire (Non FNE) ».
- [ ] Un utilisateur avec `non_fne.view` seulement → ne voit ni Ajouter ni Supprimer.
- [ ] Un utilisateur sans `non_fne.delete` → pas de bouton Supprimer.
- [ ] Filtre date : par défaut, seules les factures **du jour** s'affichent.
- [ ] Imprimer une facture (Statut Facture) plusieurs fois → le compteur s'incrémente.

---

*Document généré pour le déploiement E-Facture.*
