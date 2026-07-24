const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const AutoDownloadConfig = sequelize.define('AutoDownloadConfig', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
    enabled: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    mode: { type: DataTypes.ENUM('daily', 'interval'), allowNull: false, defaultValue: 'daily' },
    daily_time: { type: DataTypes.STRING(5), allowNull: true, defaultValue: '06:00' },
    interval_minutes: { type: DataTypes.INTEGER, allowNull: true, defaultValue: 120 },
    point_of_sale: { type: DataTypes.STRING(100), allowNull: true, defaultValue: 'NPG_SIEGE_FACTURATION' },
    last_run_at: { type: DataTypes.DATE, allowNull: true },
    last_status: { type: DataTypes.STRING(20), allowNull: true },
    last_message: { type: DataTypes.TEXT, allowNull: true },
    last_downloaded_count: { type: DataTypes.INTEGER, allowNull: true, defaultValue: 0 },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, allowNull: true },
  }, {
    tableName: 'auto_download_config',
    timestamps: false,
  });

  return AutoDownloadConfig;
};
