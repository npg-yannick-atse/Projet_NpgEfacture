-- ============================================================
--  PERF page "Factures téléchargées non envoyées"
--  Idempotent. À lancer sur la base backend prod (10.10.2.55).
--  En ligne (ALGORITHM=INPLACE, LOCK=NONE) : pas de blocage des écritures.
-- ============================================================

-- 1) Flag is_sent sur downloaded_invoices (remplace l'anti-jointure NOT EXISTS)
SET @c := (SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema=DATABASE() AND table_name='downloaded_invoices' AND column_name='is_sent');
SET @sql := IF(@c=0, 'ALTER TABLE downloaded_invoices ADD COLUMN is_sent TINYINT(1) NOT NULL DEFAULT 0', 'SELECT ''is_sent existe deja''');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @i := (SELECT COUNT(*) FROM information_schema.statistics
  WHERE table_schema=DATABASE() AND table_name='downloaded_invoices' AND index_name='idx_di_is_sent');
SET @sql := IF(@i=0, 'CREATE INDEX idx_di_is_sent ON downloaded_invoices (is_sent) ALGORITHM=INPLACE, LOCK=NONE', 'SELECT ''idx_di_is_sent existe deja''');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- 2) Index COUVRANT komv pour l'AIRSI (MWAL) -> requête index-only (1092 ms -> 77 ms)
SET @i := (SELECT COUNT(*) FROM information_schema.statistics
  WHERE table_schema=DATABASE() AND table_name='sap_komv_condition' AND index_name='idx_komv_cover');
SET @sql := IF(@i=0, 'CREATE INDEX idx_komv_cover ON sap_komv_condition (KSCHL, KRECH, KNUMV, KBETR) ALGORITHM=INPLACE, LOCK=NONE', 'SELECT ''idx_komv_cover existe deja''');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- 3) Backfill du flag : is_sent=1 pour tout numero deja envoye avec succes
UPDATE downloaded_invoices di
  SET is_sent = 1
  WHERE is_sent = 0 AND EXISTS (
    SELECT 1 FROM logs_actions la
    WHERE la.numero_facture = di.numero AND la.SendBy IS NOT NULL AND la.erreur = 0
  );

-- verification
SELECT
  (SELECT COUNT(*) FROM downloaded_invoices WHERE is_sent=1) AS envoyees,
  (SELECT COUNT(*) FROM downloaded_invoices WHERE is_sent=0) AS non_envoyees;
