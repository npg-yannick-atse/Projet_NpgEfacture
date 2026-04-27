'use strict';

/**
 * Table invoice_types : catalogue des types de facture affichés sur l'Accueil.
 * Chaque type porte un code stable, un libellé, une icône MUI, une couleur, un ordre.
 *
 * Le champ downloaded_invoices.invoice_type_code est la valeur persistée
 * au moment du téléchargement (choisie via le menu de l'Accueil).
 */
const SEED = [
  { code: 'NPG_SIEGE_FACTURATION', label: 'NPG Siège Facturation', icon_name: 'Storefront',  color_hex: '#1976d2', display_order: 1 },
  { code: 'NPG_SALE',              label: 'NPG Sale',              icon_name: 'LocalMall',   color_hex: '#9c27b0', display_order: 2 },
  { code: 'SURCCUSALE',            label: 'Surccusale',            icon_name: 'Business',    color_hex: '#2e7d32', display_order: 3 },
  { code: 'FACTURE_EXPORT',        label: 'Facture Export',        icon_name: 'UploadFile',  color_hex: '#ed6c02', display_order: 4 },
];

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // 1. Table catalogue
    await queryInterface.createTable('invoice_types', {
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
        comment: 'Code stable utilisé en base (ex: NPG_SIEGE_FACTURATION)',
      },
      label: {
        type: Sequelize.STRING(120),
        allowNull: false,
        comment: 'Libellé affiché sur l\'Accueil',
      },
      icon_name: {
        type: Sequelize.STRING(50),
        allowNull: true,
        comment: 'Nom de l\'icône MUI (ex: Storefront)',
      },
      color_hex: {
        type: Sequelize.STRING(10),
        allowNull: true,
        defaultValue: '#1976d2',
        comment: 'Couleur de la carte (#RRGGBB)',
      },
      display_order: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 100,
      },
      active: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW,
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW,
      },
    });

    // 2. Colonne sur downloaded_invoices
    await queryInterface.addColumn('downloaded_invoices', 'invoice_type_code', {
      type: Sequelize.STRING(60),
      allowNull: true,
      comment: 'Code du type choisi au téléchargement (référence invoice_types.code)',
    });

    await queryInterface.addIndex('downloaded_invoices', ['invoice_type_code']);

    // 3. Seed initial
    await queryInterface.bulkInsert('invoice_types', SEED.map(r => ({
      ...r,
      active: true,
      created_at: new Date(),
      updated_at: new Date(),
    })));

    // 4. Backfill : pour les lignes existantes, dériver invoice_type_code depuis data.point_of_sale
    //    (on utilise JSON_EXTRACT / JSON_UNQUOTE car downloaded_invoices.data est du JSON MySQL TEXT)
    try {
      await queryInterface.sequelize.query(`
        UPDATE downloaded_invoices
        SET invoice_type_code = CASE
          WHEN JSON_UNQUOTE(JSON_EXTRACT(data, '$[0].point_of_sale')) IN ('NPG_SIEGE_FACTURATION','NPG','NPG_SALE','SURCCUSALE','FACTURE_EXPORT')
            THEN CASE
              WHEN JSON_UNQUOTE(JSON_EXTRACT(data, '$[0].point_of_sale')) = 'NPG'
                THEN 'NPG_SIEGE_FACTURATION'
              ELSE JSON_UNQUOTE(JSON_EXTRACT(data, '$[0].point_of_sale'))
            END
          ELSE invoice_type_code
        END
        WHERE invoice_type_code IS NULL;
      `);
    } catch (e) {
      console.warn('Backfill invoice_type_code non appliqué (non bloquant):', e.message);
    }
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeIndex('downloaded_invoices', ['invoice_type_code']);
    await queryInterface.removeColumn('downloaded_invoices', 'invoice_type_code');
    await queryInterface.dropTable('invoice_types');
  },
};
