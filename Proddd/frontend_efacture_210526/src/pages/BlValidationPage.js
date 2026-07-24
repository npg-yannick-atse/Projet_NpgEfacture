import React, { useEffect, useState, useCallback } from 'react';
import axios from 'axios';
import {
  Box, Paper, Typography, Table, TableHead, TableBody, TableRow, TableCell,
  Button, Chip, Alert, CircularProgress, Stack, Tooltip, TextField,
  InputAdornment, IconButton, Divider, ToggleButton, ToggleButtonGroup,
  TableContainer, Checkbox,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import RefreshIcon from '@mui/icons-material/Refresh';
import LocalShippingIcon from '@mui/icons-material/LocalShipping';
import StorefrontIcon from '@mui/icons-material/Storefront';
import AccountBalanceIcon from '@mui/icons-material/AccountBalance';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import PrintIcon from '@mui/icons-material/Print';
import ListAltIcon from '@mui/icons-material/ListAlt';
import { API_ENDPOINTS } from '../config/api';
import { getAuthHeaders } from '../utils/authHeaders';
import { useAuth } from '../contexts/AuthContext';

// Helpers d'état (3 étapes séquentielles).
const isLogiDone   = (s) => s === 'valide_logistique' || s === 'valide_commercial' || s === 'valide';
const isCommDone   = (s) => s === 'valide_commercial' || s === 'valide';
const isComptaDone = (s) => s === 'valide';

// On affiche TOUJOURS les trois validations séparément, jamais un statut combiné "complet".
const ValidationBadges = ({ statut }) => {
  const logi = isLogiDone(statut);
  const comm = isCommDone(statut);
  const compta = isComptaDone(statut);
  const badge = (done, ok, ko) => (
    <Chip size="small" color={done ? 'success' : 'default'} variant={done ? 'filled' : 'outlined'} label={done ? ok : ko} />
  );
  return (
    <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
      {badge(logi, 'Logistique validée', 'Logistique en attente')}
      {badge(comm, 'Commercial validée', 'Commercial en attente')}
      {badge(compta, 'Comptabilité validée', 'Comptabilité en attente')}
    </Stack>
  );
};

const fmtDate = (d) => (d ? new Date(d).toLocaleString('fr-FR') : '—');

const fmtMontant = (n) => {
  if (n === null || n === undefined || n === '') return '—';
  const v = Number(n);
  if (Number.isNaN(v)) return '—';
  return `${Math.round(v).toLocaleString('fr-FR', { useGrouping: true })} FCFA`;
};

// Date du jour au format YYYY-MM-DD (locale, pour les champs date).
const todayStr = () => {
  const d = new Date();
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
};

const BlValidationPage = () => {
  const { user, hasPermission } = useAuth();
  const canLogistique = hasPermission('bl.validate_logistique');
  const canCommercial = hasPermission('bl.validate_commercial');
  const canComptabilite = hasPermission('bl.validate_comptabilite');

  const headers = getAuthHeaders();

  const [search, setSearch] = useState('');
  const [invoice, setInvoice] = useState(null); // résultat de la recherche
  const [matches, setMatches] = useState([]); // si un BL correspond à plusieurs factures
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  // Recherche en masse (plusieurs n° de facture ou de BL).
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkText, setBulkText] = useState('');
  const [bulkResults, setBulkResults] = useState([]);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkSelected, setBulkSelected] = useState(() => new Set()); // n° factures cochées
  const [bulkPrinting, setBulkPrinting] = useState(false);

  const [history, setHistory] = useState([]);
  const [histFilter, setHistFilter] = useState('all');
  const [histLoading, setHistLoading] = useState(false);
  // Par défaut : les validations du jour (filtrage par date côté serveur).
  const [histStart, setHistStart] = useState(todayStr());
  const [histEnd, setHistEnd] = useState(todayStr());
  const [histSearch, setHistSearch] = useState(''); // recherche n° facture ou n° BL

  const showInfo = (m) => { setInfo(m); setTimeout(() => setInfo(''), 5000); };

  const loadHistory = useCallback(async () => {
    setHistLoading(true);
    try {
      // Filtrage (date / statut / recherche) effectué CÔTÉ SERVEUR.
      const params = {};
      if (histFilter !== 'all') params.statut = histFilter;
      if (histSearch && histSearch.trim()) {
        // Recherche par n° de facture OU n° de BL : on cherche sur tout l'historique
        // (sans contrainte de date, sinon on raterait les BL d'autres jours).
        params.search = histSearch.trim();
      } else {
        if (histStart) params.startDate = histStart;
        if (histEnd) params.endDate = histEnd;
      }
      const res = await axios.get(API_ENDPOINTS.BL_VALIDATIONS.LIST, { headers, params });
      setHistory(res.data.data || []);
    } catch (e) {
      const status = e.response?.status ? `[${e.response.status}] ` : '';
      setError(`Historique: ${status}${e.response?.data?.message || e.response?.data?.error || e.message}`);
      setHistory([]);
    } finally {
      setHistLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [histFilter, histStart, histEnd, histSearch]);

  useEffect(() => { loadHistory(); }, [loadHistory]);

  const fetchInvoice = async (value) => {
    setLoading(true);
    setError('');
    setInvoice(null);
    setMatches([]);
    try {
      const res = await axios.get(API_ENDPOINTS.BL_VALIDATIONS.INVOICE(value), { headers });
      const data = res.data.data;
      if (data?.multiple) {
        setMatches(data.matches || []);
      } else {
        setInvoice(data);
      }
    } catch (err) {
      setError(err.response?.data?.message || err.response?.data?.error || err.message);
    } finally {
      setLoading(false);
    }
  };

  const doSearch = (e) => {
    if (e) e.preventDefault();
    const value = search.trim();
    if (!value) return;
    fetchInvoice(value);
  };

  const selectMatch = (numero) => {
    setSearch(numero);
    fetchInvoice(numero);
  };

  // Recherche en masse : plusieurs n° de facture ou de BL (séparés par espace/virgule/retour ligne).
  const runBulk = async () => {
    const terms = [...new Set(bulkText.split(/[\s,;]+/).map((t) => t.trim()).filter(Boolean))];
    if (!terms.length) return;
    setBulkLoading(true);
    setError('');
    setBulkSelected(new Set());
    try {
      const results = await Promise.all(terms.map(async (term) => {
        try {
          const res = await axios.get(API_ENDPOINTS.BL_VALIDATIONS.INVOICE(term), { headers });
          const d = res.data.data;
          if (d?.multiple) return { term, multiple: true, matches: d.matches || [] };
          return { term, ...d };
        } catch (e) {
          return { term, error: true };
        }
      }));
      setBulkResults(results);
    } finally {
      setBulkLoading(false);
    }
  };

  const refreshInvoice = async (numero) => {
    try {
      const res = await axios.get(API_ENDPOINTS.BL_VALIDATIONS.INVOICE(numero), { headers });
      setInvoice(res.data.data);
    } catch { /* noop */ }
  };

  const postValidation = (numero, level) => {
    const urlByLevel = {
      logistique: API_ENDPOINTS.BL_VALIDATIONS.VALIDATE_LOGISTIQUE(numero),
      commercial: API_ENDPOINTS.BL_VALIDATIONS.VALIDATE_COMMERCIAL(numero),
      comptabilite: API_ENDPOINTS.BL_VALIDATIONS.VALIDATE_COMPTABILITE(numero),
    };
    return axios.post(urlByLevel[level], {}, { headers });
  };

  const validate = async (level) => {
    if (!invoice) return;
    const numero = invoice.numero_facture;
    setBusy(true);
    setError('');
    try {
      const res = await postValidation(numero, level);
      showInfo(res.data.message || 'Validation enregistrée.');
      await refreshInvoice(numero);
      loadHistory();
    } catch (err) {
      setError(err.response?.data?.message || err.response?.data?.error || err.message);
    } finally {
      setBusy(false);
    }
  };

  // Validation depuis une ligne de la recherche en masse : valide puis rafraîchit la ligne.
  const validateRow = async (numero, level) => {
    setBusy(true);
    setError('');
    try {
      const res = await postValidation(numero, level);
      showInfo(res.data.message || 'Validation enregistrée.');
      const r = await axios.get(API_ENDPOINTS.BL_VALIDATIONS.INVOICE(numero), { headers });
      const nd = r.data.data;
      setBulkResults((prev) => prev.map((row) => (row.numero_facture === numero ? { ...row, ...nd } : row)));
      if (invoice && invoice.numero_facture === numero) setInvoice(nd);
      loadHistory();
    } catch (err) {
      setError(err.response?.data?.message || err.response?.data?.error || err.message);
    } finally {
      setBusy(false);
    }
  };

  // Imprimer la facture FNE : log + traçage + ouverture du token (même logique qu'App.js).
  const printFne = async (row) => {
    const token = row?.fne_token;
    if (!token) { setError('Aucune facture FNE disponible à imprimer pour ce numéro.'); return; }
    try {
      await axios.post(API_ENDPOINTS.LOGS.PRINT, {
        username: user?.username || 'Unknown',
        numeroFacture: row.numero_facture,
      }, { headers });
    } catch { /* non bloquant */ }
    try {
      await axios.post(API_ENDPOINTS.BL_VALIDATIONS.RECORD_PRINT(row.numero_facture), {}, { headers });
    } catch { /* non bloquant */ }
    // Le backend rend la facture FNE en PDF (Playwright) → impression possible sans internet sur le poste.
    window.open(API_ENDPOINTS.FNE.PRINT_PROXY(row.numero_facture), '_blank');
    loadHistory();
    if (invoice && invoice.numero_facture === row.numero_facture) refreshInvoice(row.numero_facture);
  };

  // Sélection multiple (recherche en masse) pour impression groupée.
  const getPrintableNumeros = () => bulkResults
    .filter((r) => !r.multiple && !r.error && r.found && r.fne_token)
    .map((r) => r.numero_facture);

  const toggleSelect = (numero) => setBulkSelected((prev) => {
    const n = new Set(prev);
    if (n.has(numero)) n.delete(numero); else n.add(numero);
    return n;
  });
  const toggleSelectAll = () => setBulkSelected((prev) => {
    const all = getPrintableNumeros();
    const allSel = all.length > 0 && all.every((x) => prev.has(x));
    return new Set(allSel ? [] : all);
  });

  const printSelected = async () => {
    const numeros = [...bulkSelected];
    if (!numeros.length) return;
    setBulkPrinting(true);
    setError('');
    try {
      const res = await axios.post(API_ENDPOINTS.FNE.PRINT_MULTI, { numeros }, { headers, responseType: 'blob' });
      const url = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
      window.open(url, '_blank');
      // Journaliser l'impression de chaque facture.
      numeros.forEach((n) => {
        axios.post(API_ENDPOINTS.LOGS.PRINT, { username: user?.username || 'Unknown', numeroFacture: n }, { headers }).catch(() => {});
        axios.post(API_ENDPOINTS.BL_VALIDATIONS.RECORD_PRINT(n), {}, { headers }).catch(() => {});
      });
      loadHistory();
    } catch (e) {
      setError("Erreur lors de l'impression groupée.");
    } finally {
      setBulkPrinting(false);
    }
  };

  const v = invoice?.validation;
  const statut = v?.statut || 'en_attente';
  const logistiqueDone = isLogiDone(statut);
  const commercialDone = isCommDone(statut);
  const comptabiliteDone = isComptaDone(statut);

  return (
    <Box p={3}>
      <Box mb={2}>
        <Typography variant="h5" fontWeight={600}>Statut Facture — Validation réception BL</Typography>
        <Typography variant="body2" color="text.secondary">
          Recherchez une facture (par n° ou par BL), puis validez la réception du BL.
          Validation séquentielle : Logistique → Commercial → Comptabilité.
        </Typography>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}
      {info  && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setInfo('')}>{info}</Alert>}

      {/* Recherche */}
      <Paper variant="outlined" sx={{ p: 2, mb: 3 }}>
        <form onSubmit={doSearch}>
          <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap" useFlexGap>
            <TextField
              size="small"
              label="Numéro de facture ou de BL"
              placeholder="N° facture (ex: 0090012345) ou n° BL (ex: 1300078513)"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              sx={{ minWidth: 420, flexGrow: 1 }}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment>
                ),
                endAdornment: search && (
                  <InputAdornment position="end">
                    <IconButton size="small" onClick={() => setSearch('')}>×</IconButton>
                  </InputAdornment>
                ),
              }}
            />
            <Button type="submit" variant="contained" disabled={loading || !search.trim()}>
              {loading ? 'Recherche…' : 'Rechercher'}
            </Button>
            <Button
              variant="outlined"
              startIcon={<ListAltIcon />}
              onClick={() => setBulkOpen((o) => !o)}
            >
              Recherche en masse
            </Button>
          </Stack>
        </form>

        {/* Recherche en masse */}
        {bulkOpen && (
          <Box sx={{ mt: 2 }}>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              Collez plusieurs numéros de facture <b>ou</b> de BL (un par ligne, ou séparés par des virgules/espaces).
            </Typography>
            <TextField
              multiline
              minRows={3}
              fullWidth
              size="small"
              placeholder={"0090012345\n1300078513\n8000065529"}
              value={bulkText}
              onChange={(e) => setBulkText(e.target.value)}
            />
            <Stack direction="row" spacing={2} sx={{ mt: 1 }}>
              <Button variant="contained" onClick={runBulk} disabled={bulkLoading || !bulkText.trim()}>
                {bulkLoading ? 'Recherche…' : 'Rechercher en masse'}
              </Button>
              {bulkResults.length > 0 && (
                <Button onClick={() => { setBulkResults([]); setBulkText(''); }}>Effacer</Button>
              )}
            </Stack>
          </Box>
        )}
      </Paper>

      {/* Résultats recherche en masse : une ligne par facture, détails en colonnes + validations */}
      {bulkResults.length > 0 && (
        <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 1 }} flexWrap="wrap" useFlexGap>
          <Button
            variant="contained"
            startIcon={<PrintIcon />}
            disabled={bulkSelected.size === 0 || bulkPrinting}
            onClick={printSelected}
          >
            {bulkPrinting ? 'Génération du PDF…' : `Imprimer la sélection (${bulkSelected.size})`}
          </Button>
          <Typography variant="body2" color="text.secondary">
            Coche les factures à imprimer puis « Imprimer la sélection » (regroupées dans un seul PDF).
          </Typography>
        </Stack>
      )}

      {bulkResults.length > 0 && (
        <TableContainer component={Paper} variant="outlined" sx={{ mb: 3 }}>
          <Table size="small">
            <TableHead>
              <TableRow sx={{ bgcolor: '#f5f5f5' }}>
                <TableCell padding="checkbox">
                  {(() => {
                    const all = getPrintableNumeros();
                    const allSel = all.length > 0 && all.every((n) => bulkSelected.has(n));
                    const someSel = all.some((n) => bulkSelected.has(n));
                    return <Checkbox size="small" checked={allSel} indeterminate={someSel && !allSel} onChange={toggleSelectAll} />;
                  })()}
                </TableCell>
                <TableCell>Recherché</TableCell>
                <TableCell>N° Facture</TableCell>
                <TableCell>Numéro BL</TableCell>
                <TableCell>Client</TableCell>
                <TableCell>Date</TableCell>
                <TableCell>Point de vente</TableCell>
                <TableCell align="right">Montant</TableCell>
                <TableCell>Réf. FNE</TableCell>
                <TableCell>Validations</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {bulkResults.map((r, idx) => {
                const s = r.validation?.statut || 'en_attente';
                const ok = !r.multiple && !r.error && r.found;
                return (
                  <TableRow key={`${r.term}-${idx}`} hover>
                    <TableCell padding="checkbox">
                      {ok && r.fne_token && (
                        <Checkbox
                          size="small"
                          checked={bulkSelected.has(r.numero_facture)}
                          onChange={() => toggleSelect(r.numero_facture)}
                        />
                      )}
                    </TableCell>
                    <TableCell sx={{ fontFamily: 'monospace', fontSize: 12 }}>{r.term}</TableCell>
                    {r.multiple ? (
                      <TableCell colSpan={8} sx={{ color: 'warning.main' }}>
                        Plusieurs factures pour ce BL : {r.matches.join(', ')}
                      </TableCell>
                    ) : !ok ? (
                      <TableCell colSpan={8} sx={{ color: 'text.secondary' }}>
                        {r.error ? 'Erreur' : 'Non téléchargée / introuvable'}
                      </TableCell>
                    ) : (
                      <>
                        <TableCell sx={{ fontFamily: 'monospace' }}>{r.numero_facture}</TableCell>
                        <TableCell sx={{ fontFamily: 'monospace', fontSize: 12 }}>{r.bl_text || '—'}</TableCell>
                        <TableCell sx={{ fontSize: 12 }}>{r.client || '—'}</TableCell>
                        <TableCell sx={{ fontSize: 12, whiteSpace: 'nowrap' }}>{r.date ? new Date(r.date).toLocaleDateString('fr-FR') : '—'}</TableCell>
                        <TableCell sx={{ fontSize: 12 }}>{r.point_of_sale || '—'}</TableCell>
                        <TableCell align="right" sx={{ fontSize: 12, whiteSpace: 'nowrap' }}>{fmtMontant(r.total)}</TableCell>
                        <TableCell sx={{ fontFamily: 'monospace', fontSize: 12 }}>{r.fne_reference || '—'}</TableCell>
                        <TableCell><ValidationBadges statut={s} /></TableCell>
                      </>
                    )}
                    <TableCell align="right">
                      {ok && (
                        <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                          <Tooltip title={!canLogistique ? 'Permission logistique manquante' : isLogiDone(s) ? 'Logistique déjà validée' : 'Valider Logistique'}>
                            <span>
                              <IconButton size="small" color="primary"
                                disabled={busy || !canLogistique || isLogiDone(s)}
                                onClick={() => validateRow(r.numero_facture, 'logistique')}>
                                <LocalShippingIcon fontSize="small" />
                              </IconButton>
                            </span>
                          </Tooltip>
                          <Tooltip title={!canCommercial ? 'Permission commercial manquante' : !isLogiDone(s) ? 'Logistique d\'abord' : isCommDone(s) ? 'Commercial déjà validé' : 'Valider Commercial'}>
                            <span>
                              <IconButton size="small" color="secondary"
                                disabled={busy || !canCommercial || !isLogiDone(s) || isCommDone(s)}
                                onClick={() => validateRow(r.numero_facture, 'commercial')}>
                                <StorefrontIcon fontSize="small" />
                              </IconButton>
                            </span>
                          </Tooltip>
                          <Tooltip title={!canComptabilite ? 'Permission comptabilité manquante' : !isCommDone(s) ? 'Commercial d\'abord' : isComptaDone(s) ? 'Comptabilité déjà validée' : 'Valider Comptabilité'}>
                            <span>
                              <IconButton size="small" color="success"
                                disabled={busy || !canComptabilite || !isCommDone(s) || isComptaDone(s)}
                                onClick={() => validateRow(r.numero_facture, 'comptabilite')}>
                                <AccountBalanceIcon fontSize="small" />
                              </IconButton>
                            </span>
                          </Tooltip>
                          <Tooltip title={r.fne_token ? 'Imprimer la facture FNE' : 'Aucune facture FNE disponible'}>
                            <span>
                              <IconButton size="small" disabled={!r.fne_token} onClick={() => printFne(r)}>
                                <PrintIcon fontSize="small" />
                              </IconButton>
                            </span>
                          </Tooltip>
                          <Tooltip title="Nombre d'impressions">
                            <Chip size="small" color={r.validation?.print_count > 0 ? 'primary' : 'default'}
                              icon={<PrintIcon />} label={r.validation?.print_count || 0} />
                          </Tooltip>
                        </Stack>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {/* Plusieurs factures pour un même BL → choix */}
      {matches.length > 0 && !loading && (
        <Paper variant="outlined" sx={{ p: 2, mb: 3 }}>
          <Typography variant="body2" sx={{ mb: 1 }}>
            Plusieurs factures correspondent à ce BL — choisissez :
          </Typography>
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
            {matches.map((m) => (
              <Button key={m} size="small" variant="outlined" onClick={() => selectMatch(m)} sx={{ fontFamily: 'monospace' }}>
                {m}
              </Button>
            ))}
          </Stack>
        </Paper>
      )}

      {/* Carte facture */}
      {loading && <Box textAlign="center" py={3}><CircularProgress /></Box>}

      {invoice && !loading && !invoice.found && (
        <Alert severity="warning" sx={{ mb: 3 }}>
          La facture <b>{invoice.numero_facture}</b> n'a pas été téléchargée dans l'application — validation impossible.
        </Alert>
      )}

      {invoice && !loading && invoice.found && (
        <Paper variant="outlined" sx={{ p: 3, mb: 3 }}>
          <Stack direction="row" justifyContent="space-between" alignItems="flex-start" mb={2}>
            <Typography variant="h6" sx={{ fontFamily: 'monospace' }}>{invoice.numero_facture}</Typography>
            <Stack spacing={1} alignItems="flex-end">
              {!invoice.fne_reference && (
                <Chip color="warning" variant="outlined" label="Facture téléchargée en attente d'envoi" />
              )}
              <ValidationBadges statut={statut} />
            </Stack>
          </Stack>

          <Box sx={{ bgcolor: '#f5f5f5', p: 2, borderRadius: 1, mb: 2 }}>
            <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', fontSize: 10, display: 'block', mb: 1 }}>
              Détails de la facture
            </Typography>
            <Stack spacing={0.5}>
              {invoice.searched_bl && (
                <Typography variant="body2" color="primary">
                  <b>Trouvée via BL :</b> <span style={{ fontFamily: 'monospace' }}>{invoice.searched_bl}</span>
                </Typography>
              )}
              <Typography variant="body2">
                <b>N° facture :</b> <span style={{ fontFamily: 'monospace' }}>{invoice.numero_facture}</span>
              </Typography>
              <Typography variant="body2">
                <b>Numéro BL :</b> <span style={{ fontFamily: 'monospace' }}>{invoice.bl_text || '—'}</span>
              </Typography>
              <Typography variant="body2">
                <b>Client :</b> {invoice.client || '—'}
              </Typography>
              <Typography variant="body2">
                <b>Date :</b> {invoice.date ? new Date(invoice.date).toLocaleDateString('fr-FR') : '—'}
              </Typography>
              <Typography variant="body2">
                <b>Point de vente :</b> {invoice.point_of_sale || '—'}
              </Typography>
              <Typography variant="body2">
                <b>Montant total :</b> {fmtMontant(invoice.total)}
              </Typography>
              <Typography variant="body2">
                <b>Référence FNE :</b> {invoice.fne_reference || '—'}
              </Typography>
              <Typography variant="body2">
                <b>Date d'envoi FNE :</b> {fmtDate(invoice.fne_send_date)}
              </Typography>
            </Stack>
          </Box>

          {/* Suivi des trois validations */}
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} mb={2}>
            <Paper variant="outlined" sx={{ p: 2, flex: 1, borderColor: logistiqueDone ? 'success.light' : undefined }}>
              <Stack direction="row" spacing={1} alignItems="center" mb={1}>
                <LocalShippingIcon fontSize="small" color={logistiqueDone ? 'success' : 'disabled'} />
                <Typography variant="subtitle2">1. Logistique</Typography>
                {logistiqueDone && <CheckCircleIcon fontSize="small" color="success" />}
              </Stack>
              {logistiqueDone ? (
                <Typography variant="body2" color="text.secondary">
                  Par <b>{v.logistique_valide_by}</b><br />{fmtDate(v.logistique_valide_on)}
                </Typography>
              ) : (
                <Typography variant="body2" color="text.secondary">En attente</Typography>
              )}
            </Paper>

            <Paper variant="outlined" sx={{ p: 2, flex: 1, borderColor: commercialDone ? 'success.light' : undefined }}>
              <Stack direction="row" spacing={1} alignItems="center" mb={1}>
                <StorefrontIcon fontSize="small" color={commercialDone ? 'success' : 'disabled'} />
                <Typography variant="subtitle2">2. Commercial</Typography>
                {commercialDone && <CheckCircleIcon fontSize="small" color="success" />}
              </Stack>
              {commercialDone ? (
                <Typography variant="body2" color="text.secondary">
                  Par <b>{v.commercial_valide_by}</b><br />{fmtDate(v.commercial_valide_on)}
                </Typography>
              ) : (
                <Typography variant="body2" color="text.secondary">
                  {logistiqueDone ? 'À valider' : 'En attente (logistique d\'abord)'}
                </Typography>
              )}
            </Paper>

            <Paper variant="outlined" sx={{ p: 2, flex: 1, borderColor: comptabiliteDone ? 'success.light' : undefined }}>
              <Stack direction="row" spacing={1} alignItems="center" mb={1}>
                <AccountBalanceIcon fontSize="small" color={comptabiliteDone ? 'success' : 'disabled'} />
                <Typography variant="subtitle2">3. Comptabilité</Typography>
                {comptabiliteDone && <CheckCircleIcon fontSize="small" color="success" />}
              </Stack>
              {comptabiliteDone ? (
                <Typography variant="body2" color="text.secondary">
                  Par <b>{v.comptabilite_valide_by}</b><br />{fmtDate(v.comptabilite_valide_on)}
                </Typography>
              ) : (
                <Typography variant="body2" color="text.secondary">
                  {commercialDone ? 'À valider' : 'En attente (commercial d\'abord)'}
                </Typography>
              )}
            </Paper>
          </Stack>

          {/* Boutons de validation */}
          <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap>
            <Tooltip title={!canLogistique ? 'Permission bl.validate_logistique manquante' : logistiqueDone ? 'Déjà validé' : 'Valider (Logistique)'}>
              <span>
                <Button variant="contained" color="primary" startIcon={<LocalShippingIcon />}
                  disabled={busy || !canLogistique || logistiqueDone} onClick={() => validate('logistique')}>
                  Valider Logistique
                </Button>
              </span>
            </Tooltip>

            <Tooltip title={!canCommercial ? 'Permission bl.validate_commercial manquante' : commercialDone ? 'Déjà validé' : !logistiqueDone ? 'La logistique doit valider avant' : 'Valider (Commercial)'}>
              <span>
                <Button variant="contained" color="secondary" startIcon={<StorefrontIcon />}
                  disabled={busy || !canCommercial || commercialDone || !logistiqueDone} onClick={() => validate('commercial')}>
                  Valider Commercial
                </Button>
              </span>
            </Tooltip>

            <Tooltip title={!canComptabilite ? 'Permission bl.validate_comptabilite manquante' : comptabiliteDone ? 'Déjà validé' : !commercialDone ? 'Le commercial doit valider avant' : 'Valider (Comptabilité)'}>
              <span>
                <Button variant="contained" color="success" startIcon={<AccountBalanceIcon />}
                  disabled={busy || !canComptabilite || comptabiliteDone || !commercialDone} onClick={() => validate('comptabilite')}>
                  Valider Comptabilité
                </Button>
              </span>
            </Tooltip>

            <Tooltip title={invoice.fne_token ? 'Imprimer la facture FNE' : 'Aucune facture FNE disponible'}>
              <span>
                <Button variant="outlined" startIcon={<PrintIcon />} disabled={!invoice.fne_token} onClick={() => printFne(invoice)}>
                  Imprimer FNE
                </Button>
              </span>
            </Tooltip>

            {/* Pointage : nombre d'impressions */}
            <Tooltip title="Nombre d'impressions de cette facture">
              <Chip
                size="small"
                color={invoice.validation?.print_count > 0 ? 'primary' : 'default'}
                icon={<PrintIcon />}
                label={`${invoice.validation?.print_count || 0} impression(s)`}
              />
            </Tooltip>
          </Stack>
        </Paper>
      )}

      <Divider sx={{ my: 3 }} />

      {/* Historique */}
      <Stack direction="row" justifyContent="space-between" alignItems="center" mb={2} flexWrap="wrap" useFlexGap>
        <Typography variant="h6" fontWeight={600}>Historique des validations</Typography>
        <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap" useFlexGap>
          <TextField type="date" size="small" label="Du" InputLabelProps={{ shrink: true }} value={histStart} onChange={(e) => setHistStart(e.target.value)} />
          <TextField type="date" size="small" label="Au" InputLabelProps={{ shrink: true }} value={histEnd} onChange={(e) => setHistEnd(e.target.value)} />
          <ToggleButtonGroup value={histFilter} exclusive size="small" onChange={(e, val) => val && setHistFilter(val)}>
            <ToggleButton value="all">Tous</ToggleButton>
            <ToggleButton value="valide_logistique">Logistique</ToggleButton>
            <ToggleButton value="valide_commercial">Commercial</ToggleButton>
            <ToggleButton value="valide">Comptabilité</ToggleButton>
          </ToggleButtonGroup>
          <TextField
            size="small"
            placeholder="Rechercher (n° facture ou n° BL)"
            value={histSearch}
            onChange={(e) => setHistSearch(e.target.value)}
            sx={{ minWidth: 260 }}
            InputProps={{
              startAdornment: (<InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment>),
              endAdornment: histSearch && (
                <InputAdornment position="end">
                  <IconButton size="small" onClick={() => setHistSearch('')}>×</IconButton>
                </InputAdornment>
              ),
            }}
          />
          <Button startIcon={<RefreshIcon />} onClick={loadHistory}>Rafraîchir</Button>
        </Stack>
      </Stack>

      {histLoading ? (
        <Box textAlign="center" py={3}><CircularProgress size={28} /></Box>
      ) : history.length === 0 ? (
        <Alert severity="info">Aucune validation enregistrée.</Alert>
      ) : (
        <TableContainer component={Paper} variant="outlined">
          <Table size="small">
            <TableHead>
              <TableRow sx={{ bgcolor: '#f5f5f5' }}>
                <TableCell>N° Facture</TableCell>
                <TableCell>Réf. FNE</TableCell>
                <TableCell>Numéro BL</TableCell>
                <TableCell>Validations</TableCell>
                <TableCell>Logistique</TableCell>
                <TableCell>Commercial</TableCell>
                <TableCell>Comptabilité</TableCell>
                <TableCell>Imprimé</TableCell>
                <TableCell align="right">Action</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {history.map((h) => (
                <TableRow key={h.numero_facture} hover>
                  <TableCell sx={{ fontFamily: 'monospace' }}>{h.numero_facture}</TableCell>
                  <TableCell sx={{ fontFamily: 'monospace', fontSize: 12 }}>{h.fne_reference || '—'}</TableCell>
                  <TableCell sx={{ fontFamily: 'monospace', fontSize: 12 }}>{h.numero_bl || '—'}</TableCell>
                  <TableCell><ValidationBadges statut={h.statut} /></TableCell>
                  <TableCell sx={{ fontSize: 12 }}>
                    {h.logistique_valide_by
                      ? <>{h.logistique_valide_by}<br /><span style={{ color: '#888' }}>{fmtDate(h.logistique_valide_on)}</span></>
                      : '—'}
                  </TableCell>
                  <TableCell sx={{ fontSize: 12 }}>
                    {h.commercial_valide_by
                      ? <>{h.commercial_valide_by}<br /><span style={{ color: '#888' }}>{fmtDate(h.commercial_valide_on)}</span></>
                      : '—'}
                  </TableCell>
                  <TableCell sx={{ fontSize: 12 }}>
                    {h.comptabilite_valide_by
                      ? <>{h.comptabilite_valide_by}<br /><span style={{ color: '#888' }}>{fmtDate(h.comptabilite_valide_on)}</span></>
                      : '—'}
                  </TableCell>
                  <TableCell sx={{ fontSize: 12 }}>
                    {h.imprime_by
                      ? <>{h.imprime_by}<br /><span style={{ color: '#888' }}>{fmtDate(h.imprime_on)}</span></>
                      : '—'}
                  </TableCell>
                  <TableCell align="right">
                    <Stack direction="row" spacing={1} alignItems="center" justifyContent="flex-end">
                      <Tooltip title="Nombre d'impressions">
                        <Chip size="small" color={h.print_count > 0 ? 'primary' : 'default'}
                          icon={<PrintIcon />} label={h.print_count || 0} />
                      </Tooltip>
                      <Tooltip title={h.fne_token ? 'Imprimer la facture FNE' : 'Aucune facture FNE disponible'}>
                        <span>
                          <IconButton size="small" color="primary" disabled={!h.fne_token} onClick={() => printFne(h)}>
                            <PrintIcon fontSize="small" />
                          </IconButton>
                        </span>
                      </Tooltip>
                    </Stack>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Box>
  );
};

export default BlValidationPage;
