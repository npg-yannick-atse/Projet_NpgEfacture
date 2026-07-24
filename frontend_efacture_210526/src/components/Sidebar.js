import React from 'react';
import { Drawer, List, ListItem, ListItemButton, ListItemIcon, ListItemText, Divider, Typography, Box } from '@mui/material';
import ListAltIcon from '@mui/icons-material/ListAlt';
import AssignmentReturnIcon from '@mui/icons-material/AssignmentReturn';
import HomeIcon from '@mui/icons-material/Home';
import SettingsIcon from '@mui/icons-material/Settings';
import DeleteForeverIcon from '@mui/icons-material/DeleteForever';
import FactCheckIcon from '@mui/icons-material/FactCheck';
import CloudDownloadIcon from '@mui/icons-material/CloudDownload';
import BlockIcon from '@mui/icons-material/Block';
import ReportProblemIcon from '@mui/icons-material/ReportProblem';
import { useAuth } from '../contexts/AuthContext';

const Sidebar = ({
  onHomeClick,
  onListClick,
  onSentInvoicesClick,
  onProblemInvoicesClick,
  onSettingsClick,
  onFneCancellationsClick,
  onBlValidationClick,
  onAutoDownloadClick,
  onNonFneClick,
}) => {
  const { isAdmin, hasPermission } = useAuth();
  const showSettings = isAdmin();
  const showCancellations = hasPermission('audit.view') || hasPermission('fne.cancel_duplicate');
  const showBlValidation = hasPermission('bl.view')
    || hasPermission('bl.validate_logistique')
    || hasPermission('bl.validate_commercial')
    || hasPermission('bl.validate_comptabilite');
  const showNonFne = isAdmin() || hasPermission('non_fne.view') || hasPermission('non_fne.manage') || hasPermission('non_fne.delete');
  // Accès aux écrans métier selon les rôles (un utilisateur BL-only ne verra que "Statut Facture").
  const showHome = hasPermission('invoice.download');
  const showDownloaded = hasPermission('downloaded.view');
  const showSent = hasPermission('sent.view');
  const showProblem = isAdmin() || hasPermission('problem.view');

  return (
    <Drawer
      variant="permanent"
      sx={{
        width: 240,
        flexShrink: 0,
        '& .MuiDrawer-paper': {
          width: 240,
          boxSizing: 'border-box',
          marginTop: '64px',
          backgroundColor: '#f5f5f5',
        },
      }}
    >
      <List>
        {showHome && (
          <ListItem disablePadding>
            <ListItemButton onClick={onHomeClick}>
              <ListItemIcon><HomeIcon /></ListItemIcon>
              <ListItemText primary="Accueil" />
            </ListItemButton>
          </ListItem>
        )}

        {showDownloaded && (
          <ListItem disablePadding>
            <ListItemButton onClick={onListClick}>
              <ListItemIcon><ListAltIcon /></ListItemIcon>
              <ListItemText primary="Factures Téléchargées" />
            </ListItemButton>
          </ListItem>
        )}

        {showSent && (
          <ListItem disablePadding>
            <ListItemButton onClick={onSentInvoicesClick}>
              <ListItemIcon><AssignmentReturnIcon /></ListItemIcon>
              <ListItemText primary="Factures Envoyées" />
            </ListItemButton>
          </ListItem>
        )}

        {showProblem && (
          <ListItem disablePadding>
            <ListItemButton onClick={onProblemInvoicesClick}>
              <ListItemIcon><ReportProblemIcon sx={{ color: '#ed6c02' }} /></ListItemIcon>
              <ListItemText primary="Factures Problème" />
            </ListItemButton>
          </ListItem>
        )}

        {showBlValidation && (
          <ListItem disablePadding>
            <ListItemButton onClick={onBlValidationClick}>
              <ListItemIcon><FactCheckIcon /></ListItemIcon>
              <ListItemText primary="Statut Facture" />
            </ListItemButton>
          </ListItem>
        )}

        {(showSettings || showCancellations || showNonFne) && (
          <>
            <Divider sx={{ my: 1 }} />
            <Box sx={{ px: 2, pt: 0.5, pb: 0.5 }}>
              <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', fontSize: 10 }}>
                Administration
              </Typography>
            </Box>
          </>
        )}

        {showCancellations && (
          <ListItem disablePadding>
            <ListItemButton onClick={onFneCancellationsClick}>
              <ListItemIcon><DeleteForeverIcon /></ListItemIcon>
              <ListItemText primary="Annulations FNE" />
            </ListItemButton>
          </ListItem>
        )}

        {showSettings && (
          <ListItem disablePadding>
            <ListItemButton onClick={onAutoDownloadClick}>
              <ListItemIcon><CloudDownloadIcon /></ListItemIcon>
              <ListItemText primary="Téléchargement auto" />
            </ListItemButton>
          </ListItem>
        )}

        {showNonFne && (
          <ListItem disablePadding>
            <ListItemButton onClick={onNonFneClick}>
              <ListItemIcon><BlockIcon /></ListItemIcon>
              <ListItemText primary="Factures Non FNE" />
            </ListItemButton>
          </ListItem>
        )}

        {showSettings && (
          <ListItem disablePadding>
            <ListItemButton onClick={onSettingsClick}>
              <ListItemIcon><SettingsIcon /></ListItemIcon>
              <ListItemText primary="Paramètres" />
            </ListItemButton>
          </ListItem>
        )}
      </List>
    </Drawer>
  );
};

export default Sidebar;
