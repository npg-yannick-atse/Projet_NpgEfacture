const { Op } = require('sequelize');
const db = require('../models');
const { runJob, getConfig, requestStop, isRunning } = require('../services/autoDownloadJob');

const { AutoDownloadRun } = db;

exports.getConfig = async (req, res) => {
  try {
    const cfg = await getConfig();
    res.json({ success: true, data: cfg, running: isRunning() });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
};

exports.updateConfig = async (req, res) => {
  try {
    const cfg = await getConfig();
    const { enabled, mode, daily_time, interval_minutes, point_of_sale } = req.body;
    const patch = { updated_at: new Date() };
    if (enabled !== undefined) patch.enabled = !!enabled;
    if (mode && ['daily', 'interval'].includes(mode)) patch.mode = mode;
    if (daily_time !== undefined) patch.daily_time = daily_time;
    if (interval_minutes !== undefined) patch.interval_minutes = parseInt(interval_minutes, 10) || null;
    if (point_of_sale !== undefined) patch.point_of_sale = point_of_sale;
    await cfg.update(patch);
    // Si on désactive le job, on arrête aussi un éventuel tour en cours.
    let stoppedNow = false;
    if (patch.enabled === false) stoppedNow = requestStop();
    res.json({
      success: true,
      data: cfg,
      message: stoppedNow ? 'Job désactivé et arrêt du tour en cours demandé.' : 'Configuration enregistrée.',
    });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
};

exports.runNow = async (req, res) => {
  try {
    const username = (req.auth && req.auth.username) || 'admin';
    // Lancement asynchrone : le job peut être long, on ne bloque pas la requête.
    runJob(`manuel:${username}`).catch((e) => console.error('[AUTO-DOWNLOAD] runNow:', e.message));
    res.json({ success: true, message: 'Job de téléchargement lancé.' });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
};

exports.stop = (req, res) => {
  const ok = requestStop();
  res.json({ success: true, stopped: ok, message: ok ? 'Arrêt du job demandé.' : 'Aucun job en cours.' });
};

exports.listRuns = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const where = {};
    if (startDate || endDate) {
      where.started_at = {};
      if (startDate) { const s = new Date(startDate); s.setHours(0, 0, 0, 0); where.started_at[Op.gte] = s; }
      if (endDate) { const e = new Date(endDate); e.setHours(23, 59, 59, 999); where.started_at[Op.lte] = e; }
    }
    const runs = await AutoDownloadRun.findAll({ where, order: [['started_at', 'DESC']], limit: 100, raw: true });
    res.json({ success: true, data: runs });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
};
