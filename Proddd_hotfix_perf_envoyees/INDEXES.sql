-- ============================================================
--  INDEX PERFORMANCE — E-Facture (base npg_efacture, backend prod)
--  Idempotent : ré-exécutable sans erreur (crée l'index seulement s'il manque).
--  À lancer sur la base du backend (10.10.2.55).
--  Les CREATE utilisent ALGORITHM=INPLACE, LOCK=NONE => pas de blocage des
--  écritures pendant la création (InnoDB / MySQL 5.6+).
-- ============================================================

-- 1) logs_actions.SendOn  -> indispensable pour la fenêtre de dates + tri SendOn DESC
--    (le modèle n'indexe PAS SendOn ; c'est le principal manque)
SET @exist := (SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE table_schema = DATABASE() AND table_name = 'logs_actions' AND index_name = 'idx_logs_sendon');
SET @sql := IF(@exist = 0,
  'CREATE INDEX idx_logs_sendon ON logs_actions (SendOn) ALGORITHM=INPLACE, LOCK=NONE',
  'SELECT ''idx_logs_sendon : deja present'' AS info');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- 2) logs_actions (numero_facture)  -> vérifs par numéro (avoir, doublons, etc.)
SET @exist := (SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE table_schema = DATABASE() AND table_name = 'logs_actions' AND index_name = 'idx_logs_numero');
SET @sql := IF(@exist = 0,
  'CREATE INDEX idx_logs_numero ON logs_actions (numero_facture) ALGORITHM=INPLACE, LOCK=NONE',
  'SELECT ''idx_logs_numero : deja present'' AS info');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- 3) fne_invoices (numero_facture)  -> jointures/IN de la page "envoyées" (souvent deja present)
SET @exist := (SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE table_schema = DATABASE() AND table_name = 'fne_invoices' AND column_name = 'numero_facture');
SET @sql := IF(@exist = 0,
  'CREATE INDEX idx_fne_numero ON fne_invoices (numero_facture) ALGORITHM=INPLACE, LOCK=NONE',
  'SELECT ''index numero_facture sur fne_invoices : deja present'' AS info');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- 4) downloaded_invoices (numero)  -> WHERE numero IN (...) / numero = ... (page envoyées, avoir)
SET @exist := (SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE table_schema = DATABASE() AND table_name = 'downloaded_invoices' AND index_name = 'idx_dl_numero');
SET @sql := IF(@exist = 0,
  'CREATE INDEX idx_dl_numero ON downloaded_invoices (numero) ALGORITHM=INPLACE, LOCK=NONE',
  'SELECT ''idx_dl_numero : deja present'' AS info');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- (optionnel) rafraîchir les statistiques pour l'optimiseur
ANALYZE TABLE logs_actions, fne_invoices, downloaded_invoices;

-- Vérification finale : lister les index créés
SELECT table_name, index_name, column_name, seq_in_index
FROM information_schema.STATISTICS
WHERE table_schema = DATABASE()
  AND index_name IN ('idx_logs_sendon','idx_logs_numero','idx_fne_numero','idx_dl_numero')
ORDER BY table_name, index_name, seq_in_index;
