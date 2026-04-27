import React from 'react';
import { Drawer, List, ListItem, ListItemButton, ListItemIcon, ListItemText, Divider, Typography, Box } from '@mui/material';
import ListAltIcon from '@mui/icons-material/ListAlt';
import AssignmentReturnIcon from '@mui/icons-material/AssignmentReturn';
import HomeIcon from '@mui/icons-material/Home';
import SettingsIcon from '@mui/icons-material/Settings';
import DeleteForeverIcon from '@mui/icons-material/DeleteForever';
import { useAuth } from '../contexts/AuthContext';

const Sidebar = ({
  onHomeClick,
  onListClick,
  onSentInvoicesClick,
  onSettingsClick,
  onFneCancellationsClick,
}) => {
  const { isAdmin, hasPermission } = useAuth();
  const showSettings = isAdmin();
  const showCancellations = hasPermission('audit.view') || hasPermission('fne.cancel_duplicate');

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
        <ListItem disablePadding>
          <ListItemButton onClick={onHomeClick}>
            <ListItemIcon><HomeIcon /></ListItemIcon>
            <ListItemText primary="Accueil" />
          </ListItemButton>
        </ListItem>

        <ListItem disablePadding>
          <ListItemButton onClick={onListClick}>
            <ListItemIcon><ListAltIcon /></ListItemIcon>
            <ListItemText primary="Factures Téléchargées" />
          </ListItemButton>
        </ListItem>

        <ListItem disablePadding>
          <ListItemButton onClick={onSentInvoicesClick}>
            <ListItemIcon><AssignmentReturnIcon /></ListItemIcon>
            <ListItemText primary="Factures Envoyées" />
          </ListItemButton>
        </ListItem>

        {(showSettings || showCancellations) && (
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
