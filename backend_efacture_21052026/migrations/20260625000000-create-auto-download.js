'use strict';

/**
 * Téléchargement automatique des factures SAP (job planifié).
 *  - auto_download_config : 1 seule ligne (id=1) = configuration du job.
 *  - auto_download_runs   : historique des exécutions.
 */

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('auto_download_config', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
      enabled: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      mode: { type: Sequelize.ENUM('daily', 'interval'), allowNull: false, defaultValue: 'daily' },
      daily_time: { type: Sequelize.STRING(5), allowNull: true, defaultValue: '06:00' }, // HH:MM
      interval_minutes: { type: Sequelize.INTEGER, allowNull: true, defaultValue: 120 },
      point_of_sale: { type: Sequelize.STRING(100), allowNull: true, defaultValue: 'NPG_SIEGE_FACTURATION' },
      last_run_at: { type: Sequelize.DATE, allowNull: true },
      last_status: { type: Sequelize.STRING(20), allowNull: true },
      last_message: { type: Sequelize.TEXT, allowNull: true },
      last_downloaded_count: { type: Sequelize.INTEGER, allowNull: true, defaultValue: 0 },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
      updated_at: { type: Sequelize.DATE, allowNull: true },
    });

    await queryInterface.createTable('auto_download_runs', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
      started_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
      finished_at: { type: Sequelize.DATE, allowNull: true },
      status: { type: Sequelize.ENUM('running', 'success', 'error'), allowNull: false, defaultValue: 'running' },
      triggered_by: { type: Sequelize.STRING(50), allowNull: true }, // 'scheduler' | 'manuel:<user>'
      range_start: { type: Sequelize.STRING(10), allowNull: true },
      range_end: { type: Sequelize.STRING(10), allowNull: true },
      found_count: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      downloaded_count: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      skipped_count: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      error_count: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      message: { type: Sequelize.TEXT, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
    });
    await queryInterface.addIndex('auto_download_runs', ['started_at'], { name: 'idx_auto_runs_started' });

    // Ligne de config par défaut (id=1)
    await queryInterface.bulkInsert('auto_download_config', [{
      id: 1, enabled: false, mode: 'daily', daily_time: '06:00', interval_minutes: 120,
      point_of_sale: 'NPG_SIEGE_FACTURATION', last_downloaded_count: 0, created_at: new Date(),
    }]);
  },

  down: async (queryInterface) => {
    await queryInterface.dropTable('auto_download_runs');
    await queryInterface.dropTable('auto_download_config');
  },
};
