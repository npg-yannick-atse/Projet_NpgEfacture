'use strict';

/**
 * Backfill `logs_actions.erreur` pour les logs antérieurs au 22/04/2026
 * (date d'ajout de la colonne via 20260422000000-add-erreur-to-logs).
 *
 * Pour ces anciens logs, `erreur` vaut false (default), ce qui peut être incorrect
 * pour les envois qui avaient échoué. Cette migration calcule la vraie valeur en
 * inspectant le JSON `api_response`, en suivant exactement la logique de
 * `services/actionLogger.js::isErrorResponse`.
 *
 * Réversible : `down` remet erreur=false pour la même fenêtre temporelle.
 *
 * Pré-requis : MySQL 5.7.8+ (JSON_VALID, JSON_EXTRACT).
 */

const CUTOFF_DATE = '2026-04-22';

const ERREUR_CASE = `
  CASE
    WHEN api_response IS NULL OR api_response = '' OR api_response = 'null' THEN 0
    WHEN JSON_VALID(api_response) = 0 THEN 0
    WHEN JSON_EXTRACT(api_response, '$.success') = FALSE THEN 1
    WHEN JSON_EXTRACT(api_response, '$.error') IS NOT NULL THEN 1
    WHEN JSON_EXTRACT(api_response, '$.errorMessage') IS NOT NULL THEN 1
    WHEN CAST(JSON_EXTRACT(api_response, '$.statusCode') AS UNSIGNED) >= 400 THEN 1
    ELSE 0
  END
`;

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Idempotent : on ne touche que les `erreur=0` (valeur par défaut).
    // Why: si un log a déjà été marqué `erreur=1` manuellement ou par actionLogger,
    // on respecte cette valeur.
    const sql = `
      UPDATE logs_actions
      SET erreur = ${ERREUR_CASE}
      WHERE SendBy IS NOT NULL
        AND created_on < :cutoff
        AND erreur = 0
    `;
    const [, meta] = await queryInterface.sequelize.query(sql, {
      replacements: { cutoff: CUTOFF_DATE },
    });
    console.log(`Backfill logs_actions.erreur : ${meta?.affectedRows ?? '?'} lignes mises à jour (cutoff=${CUTOFF_DATE}).`);
  },

  down: async (queryInterface, Sequelize) => {
    // Rollback : remettre erreur=false pour la fenêtre antérieure au cutoff uniquement.
    // (Les logs créés après ont leur erreur set par actionLogger.js, on n'y touche pas.)
    const sql = `
      UPDATE logs_actions
      SET erreur = FALSE
      WHERE SendBy IS NOT NULL
        AND created_on < :cutoff
    `;
    const [, meta] = await queryInterface.sequelize.query(sql, {
      replacements: { cutoff: CUTOFF_DATE },
    });
    console.log(`Rollback : ${meta?.affectedRows ?? '?'} lignes remises à erreur=false.`);
  },
};
