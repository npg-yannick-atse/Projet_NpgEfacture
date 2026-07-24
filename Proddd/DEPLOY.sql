-- ============================================================
-- Déploiement PROD — à exécuter sur la base de données du backend
-- Idempotent autant que possible (saute ce qui existe déjà).
-- ============================================================

-- 1) Index SAP (accélère téléchargement + affichage).
--    Si un index existe déjà, MySQL renverra une erreur "Duplicate key name" : ignore-la.
ALTER TABLE sap_komv_condition  ADD INDEX idx_komv_knumv_kschl (KNUMV, KSCHL);
ALTER TABLE sap_vbrk_header     ADD INDEX idx_vbrk_vbeln (VBELN);
ALTER TABLE sap_vbrk_header     ADD INDEX idx_vbrk_knumv (KNUMV);
ALTER TABLE sap_vbrp_item       ADD INDEX idx_vbrp_vbeln (VBELN);
ALTER TABLE sap_vbpa_partner    ADD INDEX idx_vbpa_vbeln (VBELN);
ALTER TABLE sap_reference_cmde  ADD INDEX idx_refcmde_vbeln (VBELN);

-- 2) Index sur la date d'envoi (tri page Factures envoyées)
ALTER TABLE logs_actions        ADD INDEX idx_logs_sendon (SendOn);

-- 3) Table de validation BL
CREATE TABLE IF NOT EXISTS bl_validations (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  numero_facture VARCHAR(50) NOT NULL,
  numero_bl VARCHAR(255) NULL,
  statut ENUM('en_attente','valide_logistique','valide_commercial','valide') NOT NULL DEFAULT 'en_attente',
  logistique_valide_by VARCHAR(100) NULL,
  logistique_valide_on DATETIME NULL,
  commercial_valide_by VARCHAR(100) NULL,
  commercial_valide_on DATETIME NULL,
  comptabilite_valide_by VARCHAR(100) NULL,
  comptabilite_valide_on DATETIME NULL,
  imprime_by VARCHAR(100) NULL,
  imprime_on DATETIME NULL,
  print_count INT NOT NULL DEFAULT 0,
  created_on DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_on DATETIME NULL,
  UNIQUE KEY idx_bl_validations_numero_facture (numero_facture),
  KEY idx_bl_validations_statut (statut)
);

-- 4b) Si la table bl_validations existait DÉJÀ sans les colonnes d'impression,
--     ajoute-les (ignore l'erreur "Duplicate column name" si déjà présentes).
ALTER TABLE bl_validations ADD COLUMN imprime_by VARCHAR(100) NULL;
ALTER TABLE bl_validations ADD COLUMN imprime_on DATETIME NULL;
-- Pointage : compteur d'impressions (ignore "Duplicate column name" si déjà présent).
ALTER TABLE bl_validations ADD COLUMN print_count INT NOT NULL DEFAULT 0;

-- 4c) Si la table existait DÉJÀ (schéma 2 étapes) : ajouter la 3ème validation Comptabilité.
--     a) élargir l'enum statut, b) ajouter colonnes, c) requalifier les anciennes 'valide'.
ALTER TABLE bl_validations
  MODIFY COLUMN statut ENUM('en_attente','valide_logistique','valide_commercial','valide') NOT NULL DEFAULT 'en_attente';
ALTER TABLE bl_validations ADD COLUMN comptabilite_valide_by VARCHAR(100) NULL;
ALTER TABLE bl_validations ADD COLUMN comptabilite_valide_on DATETIME NULL;
-- Anciennes 'valide' (= logistique+commercial sous l'ancien schéma) -> 'valide_commercial'
UPDATE bl_validations SET statut = 'valide_commercial' WHERE statut = 'valide' AND comptabilite_valide_by IS NULL;

-- 4) Rôles de la page Statut Facture (validation BL)
INSERT IGNORE INTO roles (code, label, created_at) VALUES
  ('bl.view',                'Voir les validations de réception BL',  NOW()),
  ('bl.validate_logistique', 'Valider la réception BL (Logistique)',  NOW()),
  ('bl.validate_commercial', 'Valider la réception BL (Commercial)',  NOW()),
  ('bl.validate_comptabilite','Valider la réception BL (Comptabilité)', NOW());

-- 5) Téléchargement automatique des factures SAP (job planifié)
CREATE TABLE IF NOT EXISTS auto_download_config (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  enabled TINYINT(1) NOT NULL DEFAULT 0,
  mode ENUM('daily','interval') NOT NULL DEFAULT 'daily',
  daily_time VARCHAR(5) NULL DEFAULT '06:00',
  interval_minutes INT NULL DEFAULT 120,
  point_of_sale VARCHAR(100) NULL DEFAULT 'NPG_SIEGE_FACTURATION',
  last_run_at DATETIME NULL,
  last_status VARCHAR(20) NULL,
  last_message TEXT NULL,
  last_downloaded_count INT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NULL
);
INSERT IGNORE INTO auto_download_config
  (id, enabled, mode, daily_time, interval_minutes, point_of_sale, last_downloaded_count, created_at)
VALUES (1, 0, 'daily', '06:00', 120, 'NPG_SIEGE_FACTURATION', 0, NOW());

-- 6) Factures déjà marquées FNE dans SAP (envoi bloqué) — BAPI ZBAPI_INFO_FNE_FACTURES
CREATE TABLE IF NOT EXISTS fne_marked_invoices (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  numero_facture VARCHAR(50) NOT NULL,
  text1 VARCHAR(255) NULL,
  marked_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY idx_fne_marked_numero (numero_facture)
);

-- 7) Factures signalées par le job (avoirs / problèmes) — dédup des notifications
CREATE TABLE IF NOT EXISTS auto_download_flagged (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  numero_facture VARCHAR(50) NOT NULL,
  kind ENUM('avoir','probleme','non_fne') NOT NULL,
  client VARCHAR(255) NULL,
  type VARCHAR(10) NULL,
  detail VARCHAR(255) NULL,
  created_by VARCHAR(100) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY idx_auto_flagged_numero (numero_facture)
);
-- Si la table existait déjà sans 'non_fne' : élargir l'enum (saisie manuelle "Non FNE").
ALTER TABLE auto_download_flagged
  MODIFY COLUMN kind ENUM('avoir','probleme','non_fne') NOT NULL;
-- Si la table existait déjà sans created_by : tracer qui enregistre (ignore "Duplicate column name").
ALTER TABLE auto_download_flagged ADD COLUMN created_by VARCHAR(100) NULL;

-- 7b) Rôles d'autorisation de la page "Factures Non FNE"
INSERT IGNORE INTO roles (code, label, created_at) VALUES
  ('non_fne.view',   'Voir les factures Non FNE',                   NOW()),
  ('non_fne.manage', 'Gérer les factures Non FNE (liste noire)',    NOW()),
  ('non_fne.delete', 'Supprimer une facture Non FNE (liste noire)', NOW());

CREATE TABLE IF NOT EXISTS auto_download_runs (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  started_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  finished_at DATETIME NULL,
  status ENUM('running','success','error') NOT NULL DEFAULT 'running',
  triggered_by VARCHAR(50) NULL,
  range_start VARCHAR(10) NULL,
  range_end VARCHAR(10) NULL,
  found_count INT NOT NULL DEFAULT 0,
  downloaded_count INT NOT NULL DEFAULT 0,
  skipped_count INT NOT NULL DEFAULT 0,
  error_count INT NOT NULL DEFAULT 0,
  message TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_auto_runs_started (started_at)
);
