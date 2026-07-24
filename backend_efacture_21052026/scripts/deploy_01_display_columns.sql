-- ============================================================
--  CHANTIER 01 (perf) — colonnes d'affichage précalculées sur logs_actions
--  Idempotent. À lancer sur la base backend PROD (10.10.2.17 / npg_efacture).
--  En ligne (ALGORITHM=INPLACE, LOCK=NONE) : pas de blocage des écritures.
--  Après ce script : lancer scripts/backfill_display_columns.js pour REMPLIR les valeurs.
-- ============================================================

-- helper : ajoute une colonne seulement si absente
SET @t := 'logs_actions';

SET @c := (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name=@t AND column_name='total_ttc');
SET @sql := IF(@c=0, 'ALTER TABLE logs_actions ADD COLUMN total_ttc DECIMAL(15,3) NULL', 'SELECT ''total_ttc existe deja''');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @c := (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name=@t AND column_name='point_of_sale');
SET @sql := IF(@c=0, 'ALTER TABLE logs_actions ADD COLUMN point_of_sale VARCHAR(80) NULL', 'SELECT ''point_of_sale existe deja''');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @c := (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name=@t AND column_name='client_name');
SET @sql := IF(@c=0, 'ALTER TABLE logs_actions ADD COLUMN client_name VARCHAR(255) NULL', 'SELECT ''client_name existe deja''');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @c := (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name=@t AND column_name='is_manual');
SET @sql := IF(@c=0, 'ALTER TABLE logs_actions ADD COLUMN is_manual TINYINT(1) NOT NULL DEFAULT 0', 'SELECT ''is_manual existe deja''');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @c := (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name=@t AND column_name='is_cancellation');
SET @sql := IF(@c=0, 'ALTER TABLE logs_actions ADD COLUMN is_cancellation TINYINT(1) NOT NULL DEFAULT 0', 'SELECT ''is_cancellation existe deja''');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @c := (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name=@t AND column_name='fne_invoice_id');
SET @sql := IF(@c=0, 'ALTER TABLE logs_actions ADD COLUMN fne_invoice_id VARCHAR(100) NULL', 'SELECT ''fne_invoice_id existe deja''');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @c := (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name=@t AND column_name='reference');
SET @sql := IF(@c=0, 'ALTER TABLE logs_actions ADD COLUMN reference VARCHAR(100) NULL', 'SELECT ''reference existe deja''');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- vérification
SELECT COUNT(*) AS colonnes_affichage_presentes
FROM information_schema.columns
WHERE table_schema=DATABASE() AND table_name='logs_actions'
  AND column_name IN ('total_ttc','point_of_sale','client_name','is_manual','is_cancellation','fne_invoice_id','reference');
