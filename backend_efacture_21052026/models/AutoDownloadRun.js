const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const AutoDownloadRun = sequelize.define('AutoDownloadRun', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
    started_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    finished_at: { type: DataTypes.DATE, allowNull: true },
    status: { type: DataTypes.ENUM('running', 'success', 'error'), allowNull: false, defaultValue: 'running' },
    triggered_by: { type: DataTypes.STRING(50), allowNull: true },
    range_start: { type: DataTypes.STRING(10), allowNull: true },
    range_end: { type: DataTypes.STRING(10), allowNull: true },
    found_count: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    downloaded_count: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    skipped_count: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    error_count: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    message: { type: DataTypes.TEXT, allowNull: true },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  }, {
    tableName: 'auto_download_runs',
    timestamps: false,
    indexes: [{ name: 'idx_auto_runs_started', fields: ['started_at'] }],
  });

  return AutoDownloadRun;
};
