-- Permission d'accès à la page "Factures Problème" (idempotent : code unique).
INSERT IGNORE INTO roles (code, label, created_at)
VALUES ('problem.view', 'Voir les factures Problème (envois en erreur)', NOW());

SELECT code, label FROM roles WHERE code = 'problem.view';
