import React, { useState } from 'react';
import axios from 'axios';
import * as XLSX from 'xlsx';
import {
  Box, Paper, Typography, Table, TableHead, TableBody, TableRow, TableCell,
  Button, Alert, CircularProgress, Stack, TextField, InputAdornment, IconButton,
  TableContainer, ToggleButton, ToggleButtonGroup, Chip,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import DownloadIcon from '@mui/icons-material/Download';
import { API_ENDPOINTS } from '../config/api';
import { getAuthHeaders } from '../utils/authHeaders';
import { useAuth } from '../contexts/AuthContext';

const todayStr = () => {
  const d = new Date();
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
};
const fmtMontant = (n) => {
  if (n === null || n === undefined || n === '') return '—';
  const v = Number(n);
  if (Number.isNaN(v)) return '—';
  return v.toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
};

// Colonnes de l'export Excel, dans l'ordre exact demandé.
const EXCEL_COLUMNS = [
  ['Code Client Sap', 'code_client_sap'],
  ['Nom1', 'nom1'],
  ['Compte contribuable', 'compte_contribuable'],
  ['Ancien Code SI', 'ancien_code_si'],
  ['Date Facturation', 'date_facturation'],
  ['Numero Bl', 'numero_bl'],
  ['Numero Facture', 'numero_facture'],
  ['Montant facture', 'montant_facture'],
  ['Total à payer', 'total_a_payer'],
  ['mois facture', 'mois_facture'],
  ['Numero de sticker', 'numero_sticker'],
];

const FactureAccessPage = () => {
  const { isAdmin, hasPermission } = useAuth();
  const headers = getAuthHeaders();

  const [mode, setMode] = useState('dates'); // 'dates' | 'numero'
  const [startDate, setStartDate] = useState(todayStr());
  const [endDate, setEndDate] = useState(todayStr());
  const [numero, setNumero] = useState('');

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [truncated, setTruncated] = useState(false);
  const [searched, setSearched] = useState(false);

  const search = async () => {
    setLoading(true);
    setError('');
    setTruncated(false);
    try {
      const params = {};
      if (mode === 'numero') {
        if (!numero.trim()) { setError('Saisir un numéro de facture.'); setLoading(false); return; }
        params.numero = numero.trim();
      } else {
        if (startDate) params.startDate = startDate;
        if (endDate) params.endDate = endDate;
      }
      const res = await axios.get(API_ENDPOINTS.FACTURE_ACCESS.LIST, { headers, params });
      setRows(res.data.data || []);
      setTruncated(!!res.data.truncated);
      setSearched(true);
    } catch (e) {
      setError(e.response?.data?.message || e.response?.data?.error || e.message);
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  const exportExcel = () => {
    if (!rows.length) return;
    const aoa = [EXCEL_COLUMNS.map(([label]) => label)];
    for (const r of rows) {
      aoa.push(EXCEL_COLUMNS.map(([, key]) => {
        const v = r[key];
        return (v === null || v === undefined) ? '' : v;
      }));
    }
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Factures');
    const suffix = mode === 'numero' ? numero.trim() : `${startDate}_${endDate}`;
    XLSX.writeFile(wb, `facture_access_${suffix}.xlsx`);
  };

  if (!isAdmin() && !hasPermission('facture_access.view')) {
    return <Box p={3}><Alert severity="error">Accès non autorisé.</Alert></Box>;
  }

  return (
    <Box p={3}>
      <Box mb={2}>
        <Typography variant="h5" fontWeight={600}>Facture Access</Typography>
        <Typography variant="body2" color="text.secondary">
          Registre des factures certifiées — recherche par plage de dates ou par numéro, export Excel.
        </Typography>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}

      <Paper variant="outlined" sx={{ p: 2, mb: 3 }}>
        <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap" useFlexGap>
          <ToggleButtonGroup value={mode} exclusive size="small" onChange={(e, val) => val && setMode(val)}>
            <ToggleButton value="dates">Plage de dates</ToggleButton>
            <ToggleButton value="numero">Numéro de facture</ToggleButton>
          </ToggleButtonGroup>

          {mode === 'dates' ? (
            <>
              <TextField type="date" size="small" label="Du" InputLabelProps={{ shrink: true }} value={startDate} onChange={(e) => setStartDate(e.target.value)} />
              <TextField type="date" size="small" label="Au" InputLabelProps={{ shrink: true }} value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </>
          ) : (
            <TextField
              size="small"
              label="Numéro de facture"
              placeholder="ex: 8000066645"
              value={numero}
              onChange={(e) => setNumero(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') search(); }}
              sx={{ minWidth: 260 }}
              InputProps={{
                startAdornment: (<InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment>),
                endAdornment: numero && (<InputAdornment position="end"><IconButton size="small" onClick={() => setNumero('')}>×</IconButton></InputAdornment>),
              }}
            />
          )}

          <Button variant="contained" onClick={search} disabled={loading} startIcon={<SearchIcon />}>
            {loading ? 'Recherche…' : 'Rechercher'}
          </Button>

          <Box sx={{ flexGrow: 1 }} />

          <Button variant="outlined" color="success" startIcon={<DownloadIcon />} onClick={exportExcel} disabled={!rows.length}>
            Extraire Excel ({rows.length})
          </Button>
        </Stack>
      </Paper>

      {truncated && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          Résultat tronqué (limite atteinte). Réduisez la plage de dates pour tout récupérer.
        </Alert>
      )}

      {loading ? (
        <Box textAlign="center" py={4}><CircularProgress size={30} /></Box>
      ) : !searched ? (
        <Alert severity="info">Choisissez une plage de dates ou un numéro, puis « Rechercher ».</Alert>
      ) : rows.length === 0 ? (
        <Alert severity="info">Aucune facture trouvée pour ce critère.</Alert>
      ) : (
        <>
          <Stack direction="row" alignItems="center" spacing={2} sx={{ mb: 1 }}>
            <Chip label={`${rows.length} facture(s)`} color="primary" size="small" />
          </Stack>
          <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: '65vh' }}>
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow>
                  <TableCell sx={{ bgcolor: '#dceaf5', fontWeight: 600, whiteSpace: 'nowrap' }}>Type</TableCell>
                  {EXCEL_COLUMNS.map(([label]) => (
                    <TableCell key={label} sx={{ bgcolor: '#dceaf5', fontWeight: 600, whiteSpace: 'nowrap' }}>{label}</TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.map((r, i) => (
                  <TableRow key={`${r.numero_facture}-${i}`} hover>
                    <TableCell>
                      <Chip size="small" label={r.type === 'avoir' ? 'Avoir' : 'Facture'}
                        color={r.type === 'avoir' ? 'warning' : 'default'}
                        variant={r.type === 'avoir' ? 'filled' : 'outlined'} />
                    </TableCell>
                    <TableCell sx={{ fontFamily: 'monospace' }}>{r.code_client_sap || '—'}</TableCell>
                    <TableCell>{r.nom1 || '—'}</TableCell>
                    <TableCell sx={{ fontFamily: 'monospace' }}>{r.compte_contribuable || '—'}</TableCell>
                    <TableCell>—</TableCell>
                    <TableCell>{r.date_facturation || '—'}</TableCell>
                    <TableCell sx={{ fontFamily: 'monospace' }}>{r.numero_bl || '—'}</TableCell>
                    <TableCell sx={{ fontFamily: 'monospace' }}>{r.numero_facture || '—'}</TableCell>
                    <TableCell align="right">{fmtMontant(r.montant_facture)}</TableCell>
                    <TableCell align="right">{fmtMontant(r.total_a_payer)}</TableCell>
                    <TableCell>{r.mois_facture || '—'}</TableCell>
                    <TableCell sx={{ fontFamily: 'monospace', fontSize: 12 }}>{r.numero_sticker || '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </>
      )}
    </Box>
  );
};

export default FactureAccessPage;
