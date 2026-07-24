import React, { useEffect, useState, useCallback } from 'react';
import axios from 'axios';
import {
  Box, Paper, Typography, Stack, Switch, FormControlLabel, TextField, Button,
  ToggleButton, ToggleButtonGroup, Alert, CircularProgress, Table, TableHead,
  TableBody, TableRow, TableCell, TableContainer, Chip, Divider,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import StopIcon from '@mui/icons-material/Stop';
import SaveIcon from '@mui/icons-material/Save';
import { API_ENDPOINTS } from '../config/api';
import { getAuthHeaders } from '../utils/authHeaders';

const fmtDate = (d) => (d ? new Date(d).toLocaleString('fr-FR') : '—');

const todayStr = () => {
  const d = new Date();
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
};

const statusChip = (s) => {
  const map = { running: ['info', 'En cours'], success: ['success', 'Succès'], error: ['error', 'Erreur'] };
  const [color, label] = map[s] || ['default', s || '—'];
  return <Chip size="small" color={color} label={label} />;
};

const AutoDownloadPage = () => {
  const headers = getAuthHeaders();

  const [cfg, setCfg] = useState(null);
  const [runs, setRuns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [running, setRunning] = useState(false);
  // État "dernière exécution" tenu à jour par l'auto-refresh (sans toucher au formulaire).
  const [lastRun, setLastRun] = useState({ last_status: null, last_run_at: null, last_message: null });
  // Filtre de l'historique : par défaut le jour courant.
  const [runStart, setRunStart] = useState(todayStr());
  const [runEnd, setRunEnd] = useState(todayStr());

  const showInfo = (m) => { setInfo(m); setTimeout(() => setInfo(''), 5000); };

  const loadRuns = useCallback(async () => {
    try {
      const params = {};
      if (runStart) params.startDate = runStart;
      if (runEnd) params.endDate = runEnd;
      const r = await axios.get(API_ENDPOINTS.AUTO_DOWNLOAD.RUNS, { headers, params });
      setRuns(r.data.data || []);
    } catch (e) { /* non bloquant */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runStart, runEnd]);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const r = await axios.get(API_ENDPOINTS.AUTO_DOWNLOAD.CONFIG, { headers });
      setCfg(r.data.data);
      setRunning(!!r.data.running);
      setLastRun({ last_status: r.data.data.last_status, last_run_at: r.data.data.last_run_at, last_message: r.data.data.last_message });
      await loadRuns();
    } catch (e) {
      setError(e.response?.data?.error || e.response?.data?.message || e.message);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadRuns]);

  useEffect(() => { load(); }, [load]);

  // Auto-refresh : tant que le job tourne, on rafraîchit l'état + l'historique
  // toutes les 5 s (toutes les 20 s sinon, pour détecter un tour lancé par le
  // planificateur). Silencieux : n'écrase PAS le formulaire de configuration.
  const refreshSilently = useCallback(async () => {
    try {
      const r = await axios.get(API_ENDPOINTS.AUTO_DOWNLOAD.CONFIG, { headers });
      setRunning(!!r.data.running);
      setLastRun({ last_status: r.data.data.last_status, last_run_at: r.data.data.last_run_at, last_message: r.data.data.last_message });
    } catch (e) { /* non bloquant */ }
    loadRuns();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadRuns]);

  useEffect(() => {
    // Auto-refresh UNIQUEMENT pendant qu'un job tourne (sinon ça réinitialise/gêne
    // la sélection des dates du filtre). Au repos : pas de polling.
    if (!running) return undefined;
    const id = setInterval(refreshSilently, 5000);
    return () => clearInterval(id);
  }, [running, refreshSilently]);

  const setField = (k, v) => setCfg((c) => ({ ...c, [k]: v }));

  const save = async () => {
    setSaving(true); setError('');
    try {
      const r = await axios.put(API_ENDPOINTS.AUTO_DOWNLOAD.CONFIG, {
        enabled: cfg.enabled,
        mode: cfg.mode,
        daily_time: cfg.daily_time,
        interval_minutes: cfg.interval_minutes,
        point_of_sale: cfg.point_of_sale,
      }, { headers });
      setCfg(r.data.data);
      showInfo('Configuration enregistrée.');
    } catch (e) {
      setError(e.response?.data?.error || e.response?.data?.message || e.message);
    } finally {
      setSaving(false);
    }
  };

  // Activer/désactiver est persisté IMMÉDIATEMENT (sinon au refresh la valeur en base revient).
  const toggleEnabled = async (value) => {
    setCfg((c) => ({ ...c, enabled: value }));
    try {
      await axios.put(API_ENDPOINTS.AUTO_DOWNLOAD.CONFIG, { enabled: value }, { headers });
      showInfo(value ? 'Job activé.' : 'Job désactivé.');
      if (!value) setRunning(false);
    } catch (e) {
      setCfg((c) => ({ ...c, enabled: !value })); // revert si échec
      setError(e.response?.data?.error || e.response?.data?.message || e.message);
    }
  };

  const runNow = async () => {
    setError('');
    try {
      const r = await axios.post(API_ENDPOINTS.AUTO_DOWNLOAD.RUN_NOW, {}, { headers });
      showInfo(r.data.message || 'Job lancé. Rafraîchis dans quelques instants.');
      setRunning(true);
      setTimeout(() => { loadRuns(); load(); }, 4000);
    } catch (e) {
      setError(e.response?.data?.error || e.response?.data?.message || e.message);
    }
  };

  const stopJob = async () => {
    setError('');
    try {
      const r = await axios.post(API_ENDPOINTS.AUTO_DOWNLOAD.STOP, {}, { headers });
      showInfo(r.data.message || 'Arrêt demandé.');
      setTimeout(() => { loadRuns(); load(); }, 2000);
    } catch (e) {
      setError(e.response?.data?.error || e.response?.data?.message || e.message);
    }
  };

  if (loading) return <Box p={4} textAlign="center"><CircularProgress /></Box>;
  if (!cfg) return <Box p={3}><Alert severity="error">{error || 'Impossible de charger la configuration.'}</Alert></Box>;

  return (
    <Box p={3}>
      <Typography variant="h5" fontWeight={600} gutterBottom>Téléchargement automatique des factures</Typography>
      <Typography variant="body2" color="text.secondary" mb={2}>
        Un job planifié va chercher les factures dans SAP (depuis le dernier passage) et les télécharge
        automatiquement dans « Factures Téléchargées ». L'envoi à la FNE reste manuel.
      </Typography>

      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}
      {info && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setInfo('')}>{info}</Alert>}

      <Paper variant="outlined" sx={{ p: 3, mb: 3 }}>
        <Stack spacing={2}>
          <FormControlLabel
            control={<Switch checked={!!cfg.enabled} onChange={(e) => toggleEnabled(e.target.checked)} />}
            label={cfg.enabled ? 'Job activé' : 'Job désactivé'}
          />

          <Box>
            <Typography variant="body2" color="text.secondary" mb={0.5}>Fréquence</Typography>
            <ToggleButtonGroup
              exclusive size="small" value={cfg.mode}
              onChange={(e, v) => v && setField('mode', v)}
            >
              <ToggleButton value="daily">Chaque jour à heure fixe</ToggleButton>
              <ToggleButton value="interval">Toutes les X minutes</ToggleButton>
            </ToggleButtonGroup>
          </Box>

          {cfg.mode === 'daily' ? (
            <TextField
              type="time" label="Heure d'exécution" size="small" sx={{ maxWidth: 200 }}
              InputLabelProps={{ shrink: true }}
              value={cfg.daily_time || '06:00'}
              onChange={(e) => setField('daily_time', e.target.value)}
            />
          ) : (
            <TextField
              type="number" label="Intervalle (minutes)" size="small" sx={{ maxWidth: 200 }}
              inputProps={{ min: 1 }}
              value={cfg.interval_minutes || 120}
              onChange={(e) => setField('interval_minutes', e.target.value)}
            />
          )}

          <TextField
            label="Point de vente (tag des factures téléchargées)" size="small" sx={{ maxWidth: 360 }}
            value={cfg.point_of_sale || ''}
            onChange={(e) => setField('point_of_sale', e.target.value)}
          />

          <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap" useFlexGap>
            <Button variant="contained" startIcon={<SaveIcon />} onClick={save} disabled={saving}>
              {saving ? 'Enregistrement…' : 'Enregistrer'}
            </Button>
            <Button variant="outlined" startIcon={<PlayArrowIcon />} onClick={runNow} disabled={running}>
              Lancer maintenant
            </Button>
            {running && (
              <Button variant="contained" color="error" startIcon={<StopIcon />} onClick={stopJob}>
                Arrêter le job en cours
              </Button>
            )}
            {running && <Chip size="small" color="info" label="Job en cours…" />}
          </Stack>
        </Stack>
      </Paper>

      <Paper variant="outlined" sx={{ p: 2, mb: 3 }}>
        <Typography variant="subtitle2" color="text.secondary">Dernière exécution</Typography>
        <Stack direction="row" spacing={2} alignItems="center" mt={1} flexWrap="wrap" useFlexGap>
          {statusChip(lastRun.last_status)}
          <Typography variant="body2">{fmtDate(lastRun.last_run_at)}</Typography>
          <Typography variant="body2" color="text.secondary">{lastRun.last_message || '—'}</Typography>
        </Stack>
      </Paper>

      <Divider sx={{ my: 2 }} />

      <Stack direction="row" justifyContent="space-between" alignItems="center" mb={1} flexWrap="wrap" useFlexGap>
        <Typography variant="h6" fontWeight={600}>Historique des exécutions</Typography>
        <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap" useFlexGap>
          <TextField type="date" size="small" label="Du" InputLabelProps={{ shrink: true }} value={runStart} onChange={(e) => setRunStart(e.target.value)} />
          <TextField type="date" size="small" label="Au" InputLabelProps={{ shrink: true }} value={runEnd} onChange={(e) => setRunEnd(e.target.value)} />
          <Button startIcon={<RefreshIcon />} onClick={loadRuns}>Rafraîchir</Button>
        </Stack>
      </Stack>

      {runs.length === 0 ? (
        <Alert severity="info">Aucune exécution enregistrée.</Alert>
      ) : (
        <TableContainer component={Paper} variant="outlined">
          <Table size="small">
            <TableHead>
              <TableRow sx={{ bgcolor: '#f5f5f5' }}>
                <TableCell>Démarré</TableCell>
                <TableCell>Statut</TableCell>
                <TableCell>Déclenché par</TableCell>
                <TableCell>Période</TableCell>
                <TableCell align="right">Trouvées</TableCell>
                <TableCell align="right">Téléchargées</TableCell>
                <TableCell align="right">Ignorées</TableCell>
                <TableCell align="right">Erreurs</TableCell>
                <TableCell>Message</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {runs.map((r) => (
                <TableRow key={r.id} hover>
                  <TableCell sx={{ fontSize: 12 }}>{fmtDate(r.started_at)}</TableCell>
                  <TableCell>{statusChip(r.status)}</TableCell>
                  <TableCell sx={{ fontSize: 12 }}>{r.triggered_by || '—'}</TableCell>
                  <TableCell sx={{ fontSize: 12 }}>{r.range_start} → {r.range_end}</TableCell>
                  <TableCell align="right">{r.found_count}</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 600 }}>{r.downloaded_count}</TableCell>
                  <TableCell align="right">{r.skipped_count}</TableCell>
                  <TableCell align="right" sx={{ color: r.error_count ? 'error.main' : undefined }}>{r.error_count}</TableCell>
                  <TableCell sx={{ fontSize: 12 }}>{r.message || '—'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Box>
  );
};

export default AutoDownloadPage;
