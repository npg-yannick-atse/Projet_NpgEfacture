import React, { useEffect, useState, useCallback } from 'react';
import axios from 'axios';
import {
  Box, Paper, Typography, Table, TableHead, TableBody, TableRow, TableCell,
  Button, IconButton, Select, MenuItem, Checkbox, Dialog, DialogTitle,
  DialogContent, DialogActions, TextField, Alert, CircularProgress,
  FormGroup, FormControlLabel, Chip, Tooltip, Stack, Tabs, Tab, Switch,
  Autocomplete, Divider,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import SaveIcon from '@mui/icons-material/Save';
import EditIcon from '@mui/icons-material/Edit';
import { API_ENDPOINTS } from '../config/api';
import { getAuthHeaders } from '../utils/authHeaders';
import { useAuth } from '../contexts/AuthContext';
import { useNotify } from '../contexts/NotificationContext';
import * as MuiIcons from '@mui/icons-material';

const ICON_OPTIONS = ['Storefront', 'LocalMall', 'Business', 'UploadFile', 'Receipt', 'AccountBalance', 'Factory', 'Inventory', 'Payments', 'ShoppingCart'];

// ─────────── SOUS-COMPOSANT : gestion utilisateurs ───────────
const UsersPanel = () => {
  const { user, updatePermissions } = useAuth();
  const { confirm } = useNotify();
  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  const [addOpen, setAddOpen] = useState(false);
  const [addUserType, setAddUserType] = useState('utilisateur');
  const [addSelectedUser, setAddSelectedUser] = useState(null);
  const [addBusy, setAddBusy] = useState(false);
  const [ldapUsers, setLdapUsers] = useState([]);
  const [ldapLoading, setLdapLoading] = useState(false);
  const [ldapError, setLdapError] = useState('');

  const [rolesOpen, setRolesOpen] = useState(false);
  const [rolesTarget, setRolesTarget] = useState(null);
  const [rolesSelected, setRolesSelected] = useState(new Set());
  const [rolesBusy, setRolesBusy] = useState(false);

  const headers = getAuthHeaders();

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [usersRes, rolesRes] = await Promise.all([
        axios.get(API_ENDPOINTS.SETTINGS.USERS, { headers }),
        axios.get(API_ENDPOINTS.SETTINGS.ROLES, { headers }),
      ]);
      setUsers(usersRes.data.data || []);
      setRoles(rolesRes.data.data || []);
    } catch (e) { setError(e.response?.data?.message || e.message); }
    finally { setLoading(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { load(); }, [load]);
  const showInfo = (msg) => { setInfo(msg); setTimeout(() => setInfo(''), 4000); };

  // Charge la liste LDAP à l'ouverture du dialogue "Ajouter"
  const openAddDialog = async () => {
    setAddSelectedUser(null);
    setAddUserType('utilisateur');
    setLdapError('');
    setAddOpen(true);

    setLdapLoading(true);
    try {
      const res = await axios.get(API_ENDPOINTS.SETTINGS.LDAP_USERS, { headers });
      setLdapUsers(res.data.data || []);
    } catch (e) {
      setLdapError(e.response?.data?.message || e.message);
      setLdapUsers([]);
    } finally {
      setLdapLoading(false);
    }
  };

  const submitAdd = async () => {
    if (!addSelectedUser) { setError('Veuillez sélectionner un utilisateur'); return; }
    setAddBusy(true); setError('');
    try {
      await axios.post(API_ENDPOINTS.SETTINGS.USERS, {
        id_user: addSelectedUser.id_user,
        username: addSelectedUser.username || null,
        user_type: addUserType,
      }, { headers });
      setAddOpen(false);
      setAddSelectedUser(null);
      showInfo(`${addSelectedUser.username || addSelectedUser.id_user} ajouté.`);
      load();
    } catch (e) { setError(e.response?.data?.message || e.message); }
    finally { setAddBusy(false); }
  };

  const changeType = async (u, newType) => {
    if (u.user_type === newType) return;
    setError('');
    try {
      await axios.put(API_ENDPOINTS.SETTINGS.USER_TYPE(u.id_user), { user_type: newType }, { headers });
      showInfo(`Type de ${u.username || u.id_user} : ${newType}`);
      load();
    } catch (e) { setError(e.response?.data?.message || e.message); }
  };

  const removeUser = async (u) => {
    const ok = await confirm({
      severity: 'error',
      title: 'Retirer un utilisateur',
      message: `Retirer ${u.username || u.id_user} ?`,
      confirmText: 'Retirer',
    });
    if (!ok) return;
    setError('');
    try {
      await axios.delete(API_ENDPOINTS.SETTINGS.USER(u.id_user), { headers });
      showInfo('Utilisateur retiré.');
      load();
    } catch (e) { setError(e.response?.data?.message || e.message); }
  };

  const openRoles = (u) => {
    setRolesTarget(u);
    setRolesSelected(new Set(u.permissions || []));
    setRolesOpen(true);
  };
  const toggleRole = (code) => {
    setRolesSelected(prev => { const n = new Set(prev); n.has(code) ? n.delete(code) : n.add(code); return n; });
  };
  const saveRoles = async () => {
    if (!rolesTarget) return;
    setRolesBusy(true); setError('');
    try {
      const codes = Array.from(rolesSelected);
      await axios.put(API_ENDPOINTS.SETTINGS.USER_ROLES(rolesTarget.id_user), { codes }, { headers });
      showInfo(`Rôles de ${rolesTarget.username || rolesTarget.id_user} mis à jour.`);
      if (user?.id_user === rolesTarget.id_user || user?.userData?.id_user === rolesTarget.id_user) {
        updatePermissions({ permissions: codes });
      }
      setRolesOpen(false);
      load();
    } catch (e) { setError(e.response?.data?.message || e.message); }
    finally { setRolesBusy(false); }
  };

  if (loading) return <Box p={4} textAlign="center"><CircularProgress /></Box>;

  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="center" mb={2}>
        <Typography variant="h6">Utilisateurs</Typography>
        <Button variant="contained" startIcon={<AddIcon />} onClick={openAddDialog}>
          Ajouter un utilisateur
        </Button>
      </Stack>

      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}
      {info && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setInfo('')}>{info}</Alert>}

      <Paper variant="outlined">
        <Table size="small">
          <TableHead>
            <TableRow sx={{ bgcolor: '#f5f5f5' }}>
              <TableCell>id_user</TableCell>
              <TableCell>Username</TableCell>
              <TableCell>Type</TableCell>
              <TableCell>Rôles cochés</TableCell>
              <TableCell align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {users.map(u => (
              <TableRow key={u.id_user} hover>
                <TableCell>{u.id_user}</TableCell>
                <TableCell>{u.username || <em style={{ color: '#999' }}>(inconnu)</em>}</TableCell>
                <TableCell>
                  <Select size="small" value={u.user_type} onChange={(e) => changeType(u, e.target.value)}>
                    <MenuItem value="admin">Administrateur</MenuItem>
                    <MenuItem value="utilisateur">Utilisateur</MenuItem>
                  </Select>
                </TableCell>
                <TableCell>
                  {(u.permissions || []).length === 0
                    ? <Chip size="small" label="aucun" variant="outlined" />
                    : (u.permissions || []).map(code => (
                        <Chip key={code} size="small" label={code} sx={{ mr: 0.5, mb: 0.5 }} />
                      ))}
                </TableCell>
                <TableCell align="right">
                  <Tooltip title="Gérer les rôles">
                    <IconButton size="small" onClick={() => openRoles(u)}><EditIcon fontSize="small" /></IconButton>
                  </Tooltip>
                  <Tooltip title="Retirer">
                    <IconButton size="small" color="error" onClick={() => removeUser(u)}>
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Paper>

      <Dialog open={addOpen} onClose={() => setAddOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Ajouter un utilisateur depuis LDAP</DialogTitle>
        <DialogContent>
          <Stack spacing={2} mt={1}>
            {ldapError && <Alert severity="error">{ldapError}</Alert>}

            <Autocomplete
              options={ldapUsers}
              loading={ldapLoading}
              value={addSelectedUser}
              onChange={(e, v) => setAddSelectedUser(v)}
              getOptionLabel={(o) => o ? `${o.name || '(sans nom)'} — ${o.username || '?'}` : ''}
              isOptionEqualToValue={(a, b) => a?.id_user === b?.id_user}
              getOptionDisabled={(o) => o.already_added}
              filterOptions={(opts, { inputValue }) => {
                const q = inputValue.toLowerCase();
                return opts.filter(u =>
                  (u.username || '').toLowerCase().includes(q) ||
                  (u.name || '').toLowerCase().includes(q) ||
                  String(u.id_user).includes(q) ||
                  (u.matricule || '').toLowerCase().includes(q)
                ).slice(0, 100);
              }}
              renderOption={(props, option) => (
                <Box component="li" {...props} sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start !important', opacity: option.already_added ? 0.5 : 1 }}>
                  <Typography variant="body2" fontWeight={500}>
                    {option.name || '(sans nom)'}
                    {option.already_added && (
                      <Chip label="déjà ajouté" size="small" sx={{ ml: 1, height: 16, fontSize: 10 }} />
                    )}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'monospace' }}>
                    {option.username || '?'} · id={option.id_user}{option.matricule ? ` · mat.${option.matricule}` : ''}{option.email ? ` · ${option.email}` : ''}
                  </Typography>
                </Box>
              )}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="Rechercher un utilisateur LDAP"
                  placeholder="Nom, login ou id…"
                  InputProps={{
                    ...params.InputProps,
                    endAdornment: (
                      <>
                        {ldapLoading ? <CircularProgress size={16} /> : null}
                        {params.InputProps.endAdornment}
                      </>
                    ),
                  }}
                />
              )}
            />

            {addSelectedUser && (
              <Paper variant="outlined" sx={{ p: 1.5, bgcolor: '#f9fafb' }}>
                <Typography variant="caption" color="text.secondary">Sélection</Typography>
                <Typography variant="body2"><b>{addSelectedUser.username}</b> — {addSelectedUser.name}</Typography>
                <Typography variant="caption" color="text.secondary">id_user: {addSelectedUser.id_user}</Typography>
              </Paper>
            )}

            <Divider />

            <Box>
              <Typography variant="caption" color="text.secondary" mb={0.5} display="block">
                Type de compte
              </Typography>
              <Select fullWidth size="small" value={addUserType} onChange={(e) => setAddUserType(e.target.value)}>
                <MenuItem value="utilisateur">Utilisateur</MenuItem>
                <MenuItem value="admin">Administrateur</MenuItem>
              </Select>
            </Box>
            <Typography variant="caption" color="text.secondary">
              Aucun rôle coché par défaut — clique sur le crayon après création pour les affecter.
            </Typography>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAddOpen(false)} disabled={addBusy}>Annuler</Button>
          <Button onClick={submitAdd} variant="contained" disabled={addBusy || !addSelectedUser}>
            {addBusy ? 'Ajout…' : 'Ajouter'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={rolesOpen} onClose={() => setRolesOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>
          Rôles de {rolesTarget?.username || rolesTarget?.id_user}
          <Typography variant="caption" display="block" color="text.secondary">
            Type : {rolesTarget?.user_type === 'admin' ? 'Administrateur' : 'Utilisateur'}
          </Typography>
        </DialogTitle>
        <DialogContent>
          {/* Bouton "Full" — coche/décoche toutes les permissions */}
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1, pb: 1, borderBottom: '1px solid #eee' }}>
            <Typography variant="body2" color="text.secondary">
              {rolesSelected.size} / {roles.length} permission{roles.length > 1 ? 's' : ''} cochée{rolesSelected.size > 1 ? 's' : ''}
            </Typography>
            <FormControlLabel
              control={
                <Checkbox
                  checked={roles.length > 0 && rolesSelected.size === roles.length}
                  indeterminate={rolesSelected.size > 0 && rolesSelected.size < roles.length}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setRolesSelected(new Set(roles.map(r => r.code)));
                    } else {
                      setRolesSelected(new Set());
                    }
                  }}
                />
              }
              label={<Typography variant="body2" fontWeight={600}>Full (tout cocher)</Typography>}
            />
          </Box>

          <FormGroup>
            {roles.map(r => (
              <FormControlLabel
                key={r.code}
                control={<Checkbox checked={rolesSelected.has(r.code)} onChange={() => toggleRole(r.code)} />}
                label={
                  <Box>
                    <Typography variant="body2" fontWeight={500}>{r.label}</Typography>
                    <Typography variant="caption" color="text.secondary">{r.code}</Typography>
                  </Box>
                }
              />
            ))}
          </FormGroup>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRolesOpen(false)} disabled={rolesBusy}>Annuler</Button>
          <Button onClick={saveRoles} variant="contained" startIcon={<SaveIcon />} disabled={rolesBusy}>
            {rolesBusy ? 'Enregistrement…' : 'Enregistrer'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

// ─────────── SOUS-COMPOSANT : gestion types de facture ───────────
const InvoiceTypesPanel = () => {
  const { confirm } = useNotify();
  const [types, setTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null); // null = création, sinon type
  const [form, setForm] = useState({ code: '', label: '', icon_name: 'Storefront', color_hex: '#1976d2', display_order: 100, active: true });
  const [busy, setBusy] = useState(false);

  const headers = getAuthHeaders();

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const res = await axios.get(`${API_ENDPOINTS.INVOICE_TYPES.BASE}?all=1`, { headers });
      setTypes(res.data.data || []);
    } catch (e) { setError(e.response?.data?.message || e.message); }
    finally { setLoading(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { load(); }, [load]);
  const showInfo = (m) => { setInfo(m); setTimeout(() => setInfo(''), 4000); };

  const openCreate = () => {
    setEditing(null);
    setForm({ code: '', label: '', icon_name: 'Storefront', color_hex: '#1976d2', display_order: 100, active: true });
    setDialogOpen(true);
  };
  const openEdit = (t) => {
    setEditing(t);
    setForm({
      code: t.code,
      label: t.label,
      icon_name: t.icon_name || 'Storefront',
      color_hex: t.color_hex || '#1976d2',
      display_order: t.display_order,
      active: !!t.active,
    });
    setDialogOpen(true);
  };

  const submit = async () => {
    setBusy(true); setError('');
    try {
      if (editing) {
        await axios.put(API_ENDPOINTS.INVOICE_TYPES.BY_ID(editing.id), {
          label: form.label,
          icon_name: form.icon_name,
          color_hex: form.color_hex,
          display_order: parseInt(form.display_order, 10),
          active: form.active,
        }, { headers });
        showInfo('Type mis à jour.');
      } else {
        await axios.post(API_ENDPOINTS.INVOICE_TYPES.BASE, {
          code: form.code.trim(),
          label: form.label,
          icon_name: form.icon_name,
          color_hex: form.color_hex,
          display_order: parseInt(form.display_order, 10),
          active: form.active,
        }, { headers });
        showInfo('Type créé.');
      }
      setDialogOpen(false);
      load();
    } catch (e) { setError(e.response?.data?.message || e.message); }
    finally { setBusy(false); }
  };

  const remove = async (t) => {
    const ok = await confirm({
      severity: 'error',
      title: 'Supprimer un type',
      message: `Supprimer le type "${t.label}" ?`,
      confirmText: 'Supprimer',
    });
    if (!ok) return;
    try {
      const res = await axios.delete(API_ENDPOINTS.INVOICE_TYPES.BY_ID(t.id), { headers });
      showInfo(res.data.softDeleted ? res.data.message : 'Type supprimé.');
      load();
    } catch (e) { setError(e.response?.data?.message || e.message); }
  };

  const toggleActive = async (t) => {
    try {
      await axios.put(API_ENDPOINTS.INVOICE_TYPES.BY_ID(t.id), { active: !t.active }, { headers });
      load();
    } catch (e) { setError(e.response?.data?.message || e.message); }
  };

  if (loading) return <Box p={4} textAlign="center"><CircularProgress /></Box>;

  const IconPreview = MuiIcons[form.icon_name] || MuiIcons.Label;

  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="center" mb={2}>
        <Typography variant="h6">Types de facture</Typography>
        <Button variant="contained" startIcon={<AddIcon />} onClick={openCreate}>Nouveau type</Button>
      </Stack>

      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}
      {info && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setInfo('')}>{info}</Alert>}

      <Paper variant="outlined">
        <Table size="small">
          <TableHead>
            <TableRow sx={{ bgcolor: '#f5f5f5' }}>
              <TableCell>Ordre</TableCell>
              <TableCell>Icône</TableCell>
              <TableCell>Code</TableCell>
              <TableCell>Libellé</TableCell>
              <TableCell>Couleur</TableCell>
              <TableCell align="center">Actif</TableCell>
              <TableCell align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {types.map(t => {
              const Icon = MuiIcons[t.icon_name] || MuiIcons.Label;
              return (
                <TableRow key={t.id} hover sx={{ opacity: t.active ? 1 : 0.5 }}>
                  <TableCell>{t.display_order}</TableCell>
                  <TableCell><Icon sx={{ color: t.color_hex || '#1976d2' }} /></TableCell>
                  <TableCell sx={{ fontFamily: 'monospace' }}>{t.code}</TableCell>
                  <TableCell>{t.label}</TableCell>
                  <TableCell>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Box sx={{ width: 20, height: 20, borderRadius: 1, bgcolor: t.color_hex || '#1976d2', border: '1px solid #ddd' }} />
                      <Typography variant="caption">{t.color_hex}</Typography>
                    </Box>
                  </TableCell>
                  <TableCell align="center">
                    <Switch size="small" checked={!!t.active} onChange={() => toggleActive(t)} />
                  </TableCell>
                  <TableCell align="right">
                    <IconButton size="small" onClick={() => openEdit(t)}><EditIcon fontSize="small" /></IconButton>
                    <IconButton size="small" color="error" onClick={() => remove(t)}><DeleteIcon fontSize="small" /></IconButton>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Paper>

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editing ? `Modifier : ${editing.code}` : 'Nouveau type de facture'}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} mt={1}>
            <TextField
              label="Code" fullWidth required disabled={!!editing}
              value={form.code}
              onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase().replace(/\s/g, '_') })}
              helperText={editing ? 'Le code ne peut pas être modifié.' : 'Ex: NPG_SALE (MAJUSCULES + underscores)'}
            />
            <TextField label="Libellé" fullWidth required
              value={form.label}
              onChange={(e) => setForm({ ...form, label: e.target.value })}
            />
            <Stack direction="row" spacing={2} alignItems="center">
              <Select
                fullWidth value={form.icon_name}
                onChange={(e) => setForm({ ...form, icon_name: e.target.value })}
                renderValue={(v) => {
                  const I = MuiIcons[v] || MuiIcons.Label;
                  return <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}><I /><Typography>{v}</Typography></Box>;
                }}
              >
                {ICON_OPTIONS.map(name => {
                  const I = MuiIcons[name] || MuiIcons.Label;
                  return (
                    <MenuItem key={name} value={name}>
                      <I sx={{ mr: 1 }} /> {name}
                    </MenuItem>
                  );
                })}
              </Select>
              <IconPreview sx={{ fontSize: 36, color: form.color_hex }} />
            </Stack>
            <TextField
              label="Couleur (hex)" fullWidth type="color"
              value={form.color_hex}
              onChange={(e) => setForm({ ...form, color_hex: e.target.value })}
            />
            <TextField
              label="Ordre d'affichage" type="number" fullWidth
              value={form.display_order}
              onChange={(e) => setForm({ ...form, display_order: e.target.value })}
            />
            <FormControlLabel
              control={<Switch checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />}
              label={form.active ? 'Actif (visible sur l\'Accueil)' : 'Désactivé'}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)} disabled={busy}>Annuler</Button>
          <Button onClick={submit} variant="contained" startIcon={<SaveIcon />} disabled={busy}>
            {busy ? 'Enregistrement…' : (editing ? 'Mettre à jour' : 'Créer')}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

// ─────────── PAGE PRINCIPALE ───────────
const SettingsPage = () => {
  const [tab, setTab] = useState(0);
  return (
    <Box p={3}>
      <Typography variant="h5" fontWeight={600} mb={2}>Paramètres</Typography>
      <Paper variant="outlined" sx={{ mb: 2 }}>
        <Tabs value={tab} onChange={(e, v) => setTab(v)}>
          <Tab label="Utilisateurs" />
          <Tab label="Types de facture" />
        </Tabs>
      </Paper>
      <Box>
        {tab === 0 && <UsersPanel />}
        {tab === 1 && <InvoiceTypesPanel />}
      </Box>
    </Box>
  );
};

export default SettingsPage;
