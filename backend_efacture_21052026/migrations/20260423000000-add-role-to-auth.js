'use strict';

/**
 * Modèle de droits :
 *   - auth.user_type ∈ {admin, utilisateur}
 *   - roles : catalogue de permissions (code + libellé)
 *   - user_roles : many-to-many auth ↔ roles
 *   - Règle : l'admin doit avoir les rôles cochés explicitement comme un
 *     utilisateur normal (pas de bypass implicite). Seules les opérations
 *     d'ADMINISTRATION (gestion users/rôles) exigent user_type='admin'.
 */
const ROLES_SEED = [
  ['invoice.download',       'Télécharger les factures SAP'],
  ['invoice.send',           'Envoyer les factures à la FNE'],
  ['invoice.delete',         'Supprimer une facture téléchargée'],
  ['invoice.edit_inline',    'Modifier des champs inline (email, POS…)'],
  ['refund.send',            'Envoyer les avoirs à la FNE'],
  ['fne.cancel_duplicate',   'Annuler un doublon FNE'],
  ['audit.view',             'Consulter les audits (doublons, incomplets)'],
  ['pos.manage',             'Gérer les points de vente'],
  ['template.import',        'Importer depuis Excel / template'],
  ['sent.view',              'Voir les factures envoyées'],
  ['downloaded.view',        'Voir les factures téléchargées'],
  ['logs.view',              'Consulter les journaux d\'action'],
];

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // 1) Colonnes sur auth
    await queryInterface.addColumn('auth', 'username', {
      type: Sequelize.STRING(100),
      allowNull: true,
      comment: 'Username LDAP pour affichage lisible',
    });

    await queryInterface.addColumn('auth', 'user_type', {
      type: Sequelize.ENUM('admin', 'utilisateur'),
      allowNull: false,
      defaultValue: 'utilisateur',
      comment: 'Type de compte : admin = accès Paramètres, utilisateur = accès aux rôles cochés uniquement',
    });

    await queryInterface.addIndex('auth', ['user_type']);

    // 2) Table roles (catalogue de permissions)
    await queryInterface.createTable('roles', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false,
      },
      code: {
        type: Sequelize.STRING(60),
        allowNull: false,
        unique: true,
        comment: 'Code stable utilisé par le code applicatif (ex: fne.cancel_duplicate)',
      },
      label: {
        type: Sequelize.STRING(200),
        allowNull: false,
        comment: 'Libellé lisible affiché dans l\'UI',
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW,
      },
    });

    // 3) Table user_roles (jointure)
    await queryInterface.createTable('user_roles', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false,
      },
      id_user: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'auth', key: 'id_user' },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
      },
      role_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'roles', key: 'id' },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
      },
      granted_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW,
      },
      granted_by: {
        type: Sequelize.STRING(100),
        allowNull: true,
        comment: 'Username de l\'admin qui a accordé le rôle',
      },
    });

    await queryInterface.addIndex('user_roles', ['id_user', 'role_id'], {
      unique: true,
      name: 'uniq_user_role',
    });
    await queryInterface.addIndex('user_roles', ['role_id']);

    // 4) Seed du catalogue
    await queryInterface.bulkInsert('roles', ROLES_SEED.map(([code, label]) => ({
      code, label, created_at: new Date(),
    })));
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('user_roles');
    await queryInterface.dropTable('roles');
    await queryInterface.removeIndex('auth', ['user_type']);
    await queryInterface.removeColumn('auth', 'user_type');
    await queryInterface.removeColumn('auth', 'username');

    // MySQL : nettoyer l'enum orphelin
    try {
      await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_auth_user_type";');
    } catch (e) { /* noop pour MySQL */ }
  },
};
