'use strict';

/**
 * Ajoute un index sur logs_actions.SendOn.
 *
 * La page "Factures envoyées" (getSentInvoices) trie par SendOn DESC
 * (WHERE SendBy IS NOT NULL ORDER BY SendOn DESC). Sans index sur SendOn,
 * MySQL fait un filesort sur l'ensemble des logs envoyés. L'index donne à
 * l'optimiseur la possibilité d'éviter ce tri.
 *
 * Online DDL (ALGORITHM=INPLACE, LOCK=NONE) par défaut → pas de blocage.
 */

module.exports = {
  up: async (queryInterface) => {
    try {
      await queryInterface.addIndex('logs_actions', ['SendOn'], { name: 'idx_logs_sendon' });
      console.log('Index créé : idx_logs_sendon sur logs_actions(SendOn)');
    } catch (e) {
      if (/Duplicate key name|already exists/i.test(e.message)) {
        console.log('Index déjà présent, ignoré : idx_logs_sendon');
      } else {
        throw e;
      }
    }
  },

  down: async (queryInterface) => {
    try {
      await queryInterface.removeIndex('logs_actions', 'idx_logs_sendon');
    } catch (e) {
      if (/check that column\/key exists|doesn't exist|does not exist/i.test(e.message)) {
        console.log('Index absent, rien à retirer : idx_logs_sendon');
      } else {
        throw e;
      }
    }
  },
};
