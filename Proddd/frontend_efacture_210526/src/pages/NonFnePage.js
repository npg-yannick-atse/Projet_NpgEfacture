import React, { useEffect, useState, useCallback } from 'react';
import axios from 'axios';
import {
  Box, Paper, Typography, Stack, TextField, Button, Alert, CircularProgress,
  Table, TableHead, TableBody, TableRow, TableCell, TableContainer, Chip, IconButton,
  Tooltip, InputAdornment, Divider,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteForeverIcon from '@mui/icons-material/DeleteForever';
import RefreshIcon from '@mui/icons-material/Refresh';
import SearchIcon from '@mui/icons-material/Search';
import BlockIcon from '@mui/icons-material/Block';
import { API_ENDPOINTS } from '../config/api';
import { getAuthHeaders } from '../utils/authHeaders';
import { useAuth } from '../contexts/AuthContext';

const fmtDate = (d) => (d ? new Date(d).toLocaleString('fr-FR') : '—');

const pad = (n) => String(n).padStart(2, '0');
const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

const kindChip = (k) => {
  const map = {
    non_fne: ['error', 'Non FNE (manuel)'],
    avoir: ['warning', 'Avoir'],
    probleme: ['default', 'Problème'],
  };
  const [color, label] = map[k] || ['default', k || '—'];
  return <Chip size="small" color={color} label={label} />;
};

const NonFnePage = () => {
  const headers = getAuthHeaders();
  const { hasPermission, isAdmin } = useAuth();
  const canManage = isAdmin() || hasPermission('non_fne.manage');
  const canDelete = isAdmin() || hasPermission('non_fne.delete');

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [search, setSearch] = useState('');
  const [startDate, setStartDate] = useState(todayStr());
  const [endDate, setEndDate] = useState(todayStr());

  // Formulaire d'ajout
  const [numero, setNumero] = useState('');
  const [client, setClient] = useState('');
  const [motif, setMotif] = useState('');
  const [saving, setSaving] = useState(false);
  const [checking, setChecking] = useState(false);
  const [checkStatus, setCheckStatus] = useState(null); // { severity, text }

  const showInfo = (m) => { setInfo(m); setTimeout(() => setInfo(''), 5000); };

  // Vérifier la facture dans SAP : existence + nom client + statut (envoyée/téléchargée).
  const verify = async () => {
    const n = numero.trim();
    if (!n) { setError('Numéro de facture requis.'); return; }
    setChecking(true); setError(''); setCheckStatus(null);
    try {
      const r = await axios.post(API_ENDPOINTS.NON_FNE.CHECK, { numero_facture: n }, { headers });
      const d = r.data || {};
      if (!d.exists) {
        setClient('');
        setCheckStatus({ severity: 'error', text: `La facture ${n} n'existe pas dans SAP.` });
        return;
      }
      setClient(d.clientName || '');
      const nom = d.clientName || '—';
      if (d.alreadySent) {
        setCheckStatus({ severity: 'warning', text: `Client : ${nom} — ⚠ déjà ENVOYÉE à la FNE : l'enregistrement sera bloqué.` });
      } else if (d.alreadyDownloaded) {
        setCheckStatus({ severity: 'warning', text: `Client : ${nom} — ⚠ déjà TÉLÉCHARGÉE : l'enregistrement sera bloqué.` });
      } else {
        setCheckStatus({ severity: 'success', text: `Facture trouvée dans SAP — Client : ${nom}` });
      }
    } catch (e) {
      setError(e.response?.data?.message || e.response?.data?.error || e.message);
    } finally {
      setChecking(false);
    }
  };

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const params = {};
      if (search.trim()) params.search = search.trim();
      if (startDate) params.startDate = startDate;
      if (endDate) params.endDate = endDate;
      const r = await axios.get(API_ENDPOINTS.NON_FNE.BASE, { headers, params });
      setRows(r.data.data || []);
    } catch (e) {
      setError(e.response?.data?.message || e.response?.data?.error || e.message);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, startDate, endDate]);

  useEffect(() => { load(); }, [load]);

  const add = async () => {
    const n = numero.trim();
    if (!n) { setError('Numéro de facture requis.'); return; }
    setSaving(true); setError('');
    try {
      const r = await axios.post(API_ENDPOINTS.NON_FNE.BASE, {
        numero_facture: n, client: client.trim(), detail: motif.trim(),
      }, { headers });
      showInfo(r.data.message || 'Facture enregistrée.');
      setNumero(''); setClient(''); setMotif(''); setCheckStatus(null);
      load();
    } catch (e) {
      setError(e.response?.data?.message || e.response?.data?.error || e.message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async (num) => {
    setError('');
    try {
      await axios.delete(API_ENDPOINTS.NON_FNE.BY_NUMERO(num), { headers });
      showInfo('Facture retirée de la liste.');
      load();
    } catch (e) {
      setError(e.response?.data?.message || e.response?.data?.error || e.message);
    }
  };

  return (
    <Box p={3}>
      <Typography variant="h5" fontWeight={600} gutterBottom>Factures Non FNE</Typography>
      <Typography variant="body2" color="text.secondary" mb={2}>
        Factures à <b>ne pas envoyer à la FNE</b>. Elles sont enregistrées et le job de
        téléchargement automatique les <b>ignore</b> (elles ne seront pas re-téléchargées).
      </Typography>

      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}
      {info && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setInfo('')}>{info}</Alert>}

      {/* Formulaire d'ajout — visible uniquement avec la permission de gestion */}
      {canManage && (
      <Paper variant="outlined" sx={{ p: 2, mb: 3 }}>
        <Typography variant="subtitle2" color="text.secondary" mb={1}>Ajouter une facture</Typography>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems={{ md: 'center' }}>
          <TextField
            size="small" label="Numéro de facture *" value={numero}
            onChange={(e) => { setNumero(e.target.value); setClient(''); setCheckStatus(null); }}
            sx={{ minWidth: 200 }}
          />
          <Button
            variant="outlined" onClick={verify} disabled={checking || !numero.trim()}
            startIcon={checking ? <CircularProgress size={16} /> : <SearchIcon />}
          >
            {checking ? 'Vérif…' : 'Vérifier'}
          </Button>
          <TextField
            size="small" label="Client (SAP)" value={client}
            InputProps={{ readOnly: true }} placeholder="Cliquez sur Vérifier"
            sx={{ minWidth: 240 }}
          />
          <TextField
            size="small" label="Motif (optionnel)" value={motif}
            onChange={(e) => setMotif(e.target.value)} sx={{ flexGrow: 1, minWidth: 200 }}
          />
          <Button variant="contained" startIcon={<AddIcon />} onClick={add} disabled={saving || !numero.trim()}>
            {saving ? 'Ajout…' : 'Ajouter'}
          </Button>
        </Stack>
        {checkStatus && (
          <Alert severity={checkStatus.severity} sx={{ mt: 2 }} onClose={() => setCheckStatus(null)}>
            {checkStatus.text}
          </Alert>
        )}
      </Paper>
      )}

      <Divider sx={{ my: 2 }} />

      <Stack direction="row" justifyContent="space-between" alignItems="center" mb={2} flexWrap="wrap" useFlexGap>
        <Typography variant="h6" fontWeight={600}>Liste des factures signalées</Typography>
        <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap" useFlexGap>
          <TextField
            size="small" placeholder="Rechercher (n° facture)" value={search}
            onChange={(e) => setSearch(e.target.value)} sx={{ minWidth: 220 }}
            InputProps={{
              startAdornment: (<InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment>),
              endAdornment: search && (
                <InputAdornment position="end"><IconButton size="small" onClick={() => setSearch('')}>×</IconButton></InputAdornment>
              ),
            }}
          />
          <TextField
            size="small" type="date" label="Du" value={startDate}
            onChange={(e) => setStartDate(e.target.value)} InputLabelProps={{ shrink: true }} sx={{ width: 160 }}
          />
          <TextField
            size="small" type="date" label="Au" value={endDate}
            onChange={(e) => setEndDate(e.target.value)} InputLabelProps={{ shrink: true }} sx={{ width: 160 }}
          />
          <Button size="small" onClick={() => { setStartDate(''); setEndDate(''); }}>Tout afficher</Button>
          <Button startIcon={<RefreshIcon />} onClick={load}>Rafraîchir</Button>
        </Stack>
      </Stack>

      {loading ? (
        <Box textAlign="center" py={3}><CircularProgress size={28} /></Box>
      ) : rows.length === 0 ? (
        <Alert severity="info" icon={<BlockIcon />}>Aucune facture pour les critères sélectionnés.</Alert>
      ) : (
        <TableContainer component={Paper} variant="outlined">
          <Table size="small">
            <TableHead>
              <TableRow sx={{ bgcolor: '#f5f5f5' }}>
                <TableCell>N° Facture</TableCell>
                <TableCell>Client</TableCell>
                <TableCell>Type</TableCell>
                <TableCell>Motif / Détail</TableCell>
                <TableCell>Enregistré par</TableCell>
                <TableCell>Enregistré le</TableCell>
                {canDelete && <TableCell align="right">Action</TableCell>}
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.numero_facture} hover>
                  <TableCell sx={{ fontFamily: 'monospace' }}>{r.numero_facture}</TableCell>
                  <TableCell sx={{ fontSize: 13 }}>{r.client || '—'}</TableCell>
                  <TableCell>{kindChip(r.kind)}</TableCell>
                  <TableCell sx={{ fontSize: 12 }}>{r.detail || '—'}</TableCell>
                  <TableCell sx={{ fontSize: 12 }}>{r.created_by || '—'}</TableCell>
                  <TableCell sx={{ fontSize: 12 }}>{fmtDate(r.created_at)}</TableCell>
                  {canDelete && (
                  <TableCell align="right">
                    <Tooltip title="Retirer de la liste">
                      <IconButton size="small" color="error" onClick={() => remove(r.numero_facture)}>
                        <DeleteForeverIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Box>
  );
};

export default NonFnePage;
