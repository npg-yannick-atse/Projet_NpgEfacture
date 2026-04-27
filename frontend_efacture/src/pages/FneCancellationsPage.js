import React, { useEffect, useState, useCallback } from 'react';
import axios from 'axios';
import {
  Box, Paper, Typography, Table, TableHead, TableBody, TableRow, TableCell,
  Button, IconButton, Chip, Dialog, DialogTitle, DialogContent, DialogActions,
  TextField, Alert, CircularProgress, Stack, Tooltip, Collapse,
  ToggleButton, ToggleButtonGroup,
} from '@mui/material';
import DeleteForeverIcon from '@mui/icons-material/DeleteForever';
import RefreshIcon from '@mui/icons-material/Refresh';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import { API_ENDPOINTS } from '../config/api';
import { getAuthHeaders } from '../utils/authHeaders';
import { useAuth } from '../contexts/AuthContext';

const categoryColor = (cat) => ({
  DIFFERENT_REFERENCE: 'error',
  SAME_REFERENCE:      'default',
  MIXED:               'warning',
  NO_REFERENCE:        'info',
}[cat] || 'default');

const categoryLabel = (cat) => ({
  DIFFERENT_REFERENCE: 'Références différentes',
  SAME_REFERENCE:      'Même référence',
  MIXED:               'Mixte',
  NO_REFERENCE:        'Sans référence',
}[cat] || cat);

const FneCancellationsPage = () => {
  const { hasPermission } = useAuth();
  const canCancel = hasPermission('fne.cancel_duplicate');

  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [expanded, setExpanded] = useState({}); // numero_facture -> bool
  const [filter, setFilter] = useState('pending'); // 'all' | 'pending' | 'treated'

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmTarget, setConfirmTarget] = useState(null); // { numero_facture, fne_invoice_id, fne_reference }
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const headers = getAuthHeaders();

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await axios.get(API_ENDPOINTS.FNE.DUPLICATES, { headers });
      setGroups(res.data.data || []);
    } catch (e) {
      setError(e.response?.data?.message || e.message);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { load(); }, [load]);

  const showInfo = (m) => { setInfo(m); setTimeout(() => setInfo(''), 5000); };

  const openConfirm = (numero_facture, entry) => {
    setConfirmTarget({
      numero_facture,
      fne_invoice_id: entry.fne_invoice_id,
      fne_reference: entry.fne_reference,
    });
    setReason('');
    setConfirmOpen(true);
  };

  const submitCancel = async () => {
    if (!confirmTarget) return;
    setBusy(true);
    setError('');
    try {
      const res = await axios.post(API_ENDPOINTS.FNE.CANCEL_DUPLICATE, {
        fne_invoice_id: confirmTarget.fne_invoice_id,
        reason: reason || null,
      }, { headers });
      showInfo(res.data.message || 'Annulation effectuée.');
      setConfirmOpen(false);
      load();
    } catch (e) {
      setError(e.response?.data?.message || e.response?.data?.error || e.message);
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <Box p={4} textAlign="center"><CircularProgress /></Box>;

  return (
    <Box p={3}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" mb={2}>
        <Box>
          <Typography variant="h5" fontWeight={600}>Annulations FNE — Doublons</Typography>
          <Typography variant="body2" color="text.secondary">
            Factures envoyées plusieurs fois à la FNE. Priorité : "Références différentes" (deux stickers consommés).
          </Typography>
        </Box>
        <Button startIcon={<RefreshIcon />} onClick={load}>Rafraîchir</Button>
      </Stack>

      {!canCancel && (
        <Alert severity="info" sx={{ mb: 2 }}>
          Mode consultation : votre rôle <code>fne.cancel_duplicate</code> n'est pas activé, les boutons d'annulation sont désactivés.
        </Alert>
      )}
      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}
      {info  && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setInfo('')}>{info}</Alert>}

      {/* Filtre statut */}
      <Stack direction="row" spacing={2} alignItems="center" mb={2}>
        <Typography variant="body2" color="text.secondary">Afficher :</Typography>
        <ToggleButtonGroup
          value={filter}
          exclusive
          size="small"
          onChange={(e, v) => v && setFilter(v)}
        >
          <ToggleButton value="pending">
            Non traités ({groups.filter(g => !g.treated).length})
          </ToggleButton>
          <ToggleButton value="treated">
            Traités ({groups.filter(g => g.treated).length})
          </ToggleButton>
          <ToggleButton value="all">
            Tous ({groups.length})
          </ToggleButton>
        </ToggleButtonGroup>
      </Stack>

      {(() => {
        const filteredGroups = groups.filter(g => {
          if (filter === 'treated') return g.treated;
          if (filter === 'pending') return !g.treated;
          return true;
        });

        if (groups.length === 0) {
          return <Alert severity="success">Aucun doublon FNE détecté.</Alert>;
        }
        if (filteredGroups.length === 0) {
          return <Alert severity="info">Aucun doublon dans cette catégorie.</Alert>;
        }

        return (
        <Paper variant="outlined">
          <Table size="small">
            <TableHead>
              <TableRow sx={{ bgcolor: '#f5f5f5' }}>
                <TableCell width={40}></TableCell>
                <TableCell>N° Facture SAP</TableCell>
                <TableCell>Catégorie</TableCell>
                <TableCell align="center">Nb signatures</TableCell>
                <TableCell>Statut</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredGroups.map(g => {
                const isOpen = !!expanded[g.numero_facture];
                return (
                  <React.Fragment key={g.numero_facture}>
                    <TableRow hover>
                      <TableCell>
                        <IconButton size="small" onClick={() => setExpanded(e => ({ ...e, [g.numero_facture]: !isOpen }))}>
                          {isOpen ? <ExpandMoreIcon /> : <ChevronRightIcon />}
                        </IconButton>
                      </TableCell>
                      <TableCell sx={{ fontFamily: 'monospace' }}>{g.numero_facture}</TableCell>
                      <TableCell>
                        <Chip
                          size="small"
                          color={categoryColor(g.category)}
                          label={categoryLabel(g.category)}
                          icon={g.category === 'DIFFERENT_REFERENCE' ? <WarningAmberIcon /> : undefined}
                        />
                      </TableCell>
                      <TableCell align="center">{g.nb_entries}</TableCell>
                      <TableCell>
                        {g.treated
                          ? <Chip size="small" color="success" label="Traité" />
                          : g.has_any_cancelled
                            ? <Chip size="small" color="warning" label="Partiel" />
                            : <Chip size="small" variant="outlined" label="À traiter" />}
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell colSpan={5} sx={{ p: 0, border: 'none' }}>
                        <Collapse in={isOpen} unmountOnExit>
                          <Box p={2} bgcolor="#fafafa">
                            <Table size="small">
                              <TableHead>
                                <TableRow>
                                  <TableCell>fne_invoice_id</TableCell>
                                  <TableCell>Référence FNE</TableCell>
                                  <TableCell>NCC</TableCell>
                                  <TableCell>Créée le</TableCell>
                                  <TableCell>Statut</TableCell>
                                  <TableCell>Réf. avoir d'annulation</TableCell>
                                  <TableCell align="right">Action</TableCell>
                                </TableRow>
                              </TableHead>
                              <TableBody>
                                {g.entries.map((e, idx) => {
                                  const isOriginal = idx === 0; // 1ère cert = l'originale à conserver
                                  const disabled = !canCancel || e.cancelled || g.entries.length < 2 || isOriginal;
                                  const tooltipText = !canCancel
                                    ? 'Permission fne.cancel_duplicate manquante'
                                    : isOriginal
                                      ? 'Signature originale — ne peut pas être annulée (on garde toujours la 1ère)'
                                      : e.cancelled
                                        ? 'Déjà annulée'
                                        : 'Annuler cette signature FNE (refund 100%)';
                                  return (
                                    <TableRow
                                      key={e.fne_invoice_id}
                                      sx={{ bgcolor: isOriginal ? '#f0f4f8' : 'inherit' }}
                                    >
                                      <TableCell sx={{ fontFamily: 'monospace', fontSize: 12 }}>{e.fne_invoice_id}</TableCell>
                                      <TableCell>{e.fne_reference || '—'}</TableCell>
                                      <TableCell>{e.fne_ncc || '—'}</TableCell>
                                      <TableCell>{e.created_at ? new Date(e.created_at).toLocaleString('fr-FR') : '—'}</TableCell>
                                      <TableCell>
                                        {e.cancelled ? (
                                          <Chip size="small" color="success" label="Annulée" />
                                        ) : isOriginal ? (
                                          <Chip size="small" color="primary" variant="outlined" label="Originale" />
                                        ) : (
                                          <Chip size="small" variant="outlined" label="Active" />
                                        )}
                                      </TableCell>
                                      <TableCell sx={{ fontFamily: 'monospace', fontSize: 12 }}>
                                        {e.cancellation_reference ? (
                                          <Tooltip title={`Annulée le ${e.cancelled_at ? new Date(e.cancelled_at).toLocaleString('fr-FR') : '?'} par ${e.cancelled_by || '?'}${e.cancellation_reason ? ` — ${e.cancellation_reason}` : ''}`}>
                                            <span style={{ color: '#2e7d32', fontWeight: 600 }}>
                                              {e.cancellation_reference}
                                            </span>
                                          </Tooltip>
                                        ) : '—'}
                                      </TableCell>
                                      <TableCell align="right">
                                        <Tooltip title={tooltipText}>
                                          <span>
                                            <Button
                                              size="small"
                                              color="error"
                                              variant="outlined"
                                              startIcon={<DeleteForeverIcon />}
                                              disabled={disabled}
                                              onClick={() => openConfirm(g.numero_facture, e)}
                                            >
                                              Annuler
                                            </Button>
                                          </span>
                                        </Tooltip>
                                      </TableCell>
                                    </TableRow>
                                  );
                                })}
                              </TableBody>
                            </Table>
                          </Box>
                        </Collapse>
                      </TableCell>
                    </TableRow>
                  </React.Fragment>
                );
              })}
            </TableBody>
          </Table>
        </Paper>
        );
      })()}

      <Dialog open={confirmOpen} onClose={() => !busy && setConfirmOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ color: 'error.main' }}>
          <WarningAmberIcon sx={{ verticalAlign: 'middle', mr: 1 }} />
          Confirmer l'annulation FNE
        </DialogTitle>
        <DialogContent>
          {confirmTarget && (
            <Stack spacing={1.5} mt={1}>
              <Typography variant="body2">
                Tu vas envoyer un <b>avoir 100%</b> à la FNE pour neutraliser cette signature.
              </Typography>
              <Box sx={{ bgcolor: '#f5f5f5', p: 1.5, borderRadius: 1, fontFamily: 'monospace', fontSize: 13 }}>
                <div>Facture SAP : <b>{confirmTarget.numero_facture}</b></div>
                <div>fne_invoice_id : {confirmTarget.fne_invoice_id}</div>
                <div>fne_reference : {confirmTarget.fne_reference || '—'}</div>
              </Box>
              <Alert severity="warning" variant="outlined">
                Cette opération <b>consomme un sticker FNE supplémentaire</b> et est irréversible côté DGI.
              </Alert>
              <TextField
                label="Raison (optionnelle)"
                multiline rows={2} fullWidth
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Ex: Doublon suite à timeout réseau le 2026-01-15"
              />
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmOpen(false)} disabled={busy}>Annuler</Button>
          <Button onClick={submitCancel} color="error" variant="contained" disabled={busy}>
            {busy ? 'Envoi…' : 'Confirmer l\'annulation'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default FneCancellationsPage;
