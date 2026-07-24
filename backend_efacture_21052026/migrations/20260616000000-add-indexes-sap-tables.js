'use strict';

/**
 * Ajoute les index manquants sur les tables SAP.
 *
 * Contexte : ces tables sont créées par `sequelize.sync()` (sans `alter`), donc
 * aucun index secondaire n'a jamais été posé — seule la PK `id` existait. Or le
 * téléchargement d'UNE facture exécute ~5 SELECT + 1 DELETE sur sap_komv_condition
 * filtrés par KNUMV, plus des lookups par VBELN sur les autres tables. Sans index,
 * chacun fait un FULL TABLE SCAN d'une table qui grossit à chaque téléchargement
 * → latence qui empire avec le temps (constatée à ~50s/facture en prod).
 *
 * sap_komv_condition : index composite (KNUMV, KSCHL). Le préfixe KNUMV sert aussi
 * les requêtes filtrant KNUMV seul (DELETE, MWAL en masse) ; KSCHL accélère le
 * filtrage par type de condition (ZREM, ZR01, ZPR0, MWAS...).
 *
 * MySQL/InnoDB ajoute un index secondaire en ALGORITHM=INPLACE, LOCK=NONE par
 * défaut (5.6+) : pas de blocage des lectures/écritures pendant la création.
 * À lancer de préférence hors heure de pointe quand même (coût CPU/IO ponctuel).
 */

// addIndex throw si l'index existe déjà ("Duplicate key name") ; on rend la
// migration ré-exécutable en avalant uniquement cette erreur.
const safeAddIndex = async (queryInterface, table, fields, name) => {
  try {
    await queryInterface.addIndex(table, fields, { name });
    console.log(`Index créé : ${name} sur ${table}(${fields.join(', ')})`);
  } catch (e) {
    if (/Duplicate key name|already exists/i.test(e.message)) {
      console.log(`Index déjà présent, ignoré : ${name}`);
    } else {
      throw e;
    }
  }
};

const safeRemoveIndex = async (queryInterface, table, name) => {
  try {
    await queryInterface.removeIndex(table, name);
  } catch (e) {
    if (/check that column\/key exists|doesn't exist|does not exist/i.test(e.message)) {
      console.log(`Index absent, rien à retirer : ${name}`);
    } else {
      throw e;
    }
  }
};

const INDEXES = [
  ['sap_komv_condition', ['KNUMV', 'KSCHL'], 'idx_komv_knumv_kschl'],
  ['sap_vbrk_header', ['VBELN'], 'idx_vbrk_vbeln'],
  ['sap_vbrk_header', ['KNUMV'], 'idx_vbrk_knumv'],
  ['sap_vbrp_item', ['VBELN'], 'idx_vbrp_vbeln'],
  ['sap_vbpa_partner', ['VBELN'], 'idx_vbpa_vbeln'],
  ['sap_reference_cmde', ['VBELN'], 'idx_refcmde_vbeln'],
];

module.exports = {
  up: async (queryInterface) => {
    for (const [table, fields, name] of INDEXES) {
      await safeAddIndex(queryInterface, table, fields, name);
    }
  },

  down: async (queryInterface) => {
    for (const [table, , name] of INDEXES) {
      await safeRemoveIndex(queryInterface, table, name);
    }
  },
};
