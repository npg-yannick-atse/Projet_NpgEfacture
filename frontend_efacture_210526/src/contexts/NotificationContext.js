import React, { createContext, useContext, useState, useCallback } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  Button,
  Box,
} from '@mui/material';
import InfoIcon from '@mui/icons-material/Info';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';

const NotificationContext = createContext(null);

const SEVERITY_META = {
  info:     { color: '#1976d2', Icon: InfoIcon,         defaultTitle: 'Information' },
  success:  { color: '#2e7d32', Icon: CheckCircleIcon,  defaultTitle: 'Succès' },
  warning:  { color: '#ed6c02', Icon: WarningAmberIcon, defaultTitle: 'Avertissement' },
  error:    { color: '#d32f2f', Icon: ErrorOutlineIcon, defaultTitle: 'Erreur' },
  question: { color: '#1976d2', Icon: HelpOutlineIcon,  defaultTitle: 'Confirmation' },
};

function detectSeverity(message) {
  const m = (message || '').toString().toLowerCase();
  if (/erreur|impossible|échec|bloqu|introuv|n'existe|non trouvé|ne peut|non disponible|technique/.test(m)) return 'error';
  if (/avec succès|réussi|copié|effectuée?\s+avec\s+succès|mises?\s+à\s+jour\s+avec\s+succès/.test(m)) return 'success';
  if (/déjà|attention|veuillez|astuce|⚠/.test(m)) return 'warning';
  return 'info';
}

export function NotificationProvider({ children }) {
  const [queue, setQueue] = useState([]);

  const enqueue = useCallback(
    (item) =>
      new Promise((resolve) => {
        setQueue((q) => [...q, { ...item, resolve, _id: Date.now() + Math.random() }]);
      }),
    []
  );

  const notify = useCallback(
    (opts) => {
      if (typeof opts === 'string') opts = { message: opts };
      return enqueue({ kind: 'notify', ...opts });
    },
    [enqueue]
  );

  const confirm = useCallback(
    (opts) => {
      if (typeof opts === 'string') opts = { message: opts };
      return enqueue({ kind: 'confirm', ...opts });
    },
    [enqueue]
  );

  const current = queue[0];
  const close = (result) => {
    if (!current) return;
    current.resolve(result);
    setQueue((q) => q.slice(1));
  };

  const severity = current
    ? current.severity ||
      (current.kind === 'confirm' ? 'question' : detectSeverity(current.message))
    : 'info';
  const meta = SEVERITY_META[severity] || SEVERITY_META.info;
  const Icon = meta.Icon;

  return (
    <NotificationContext.Provider value={{ notify, confirm }}>
      {children}
      <Dialog
        open={!!current}
        onClose={() => close(current?.kind === 'confirm' ? false : undefined)}
        maxWidth="sm"
        fullWidth
        PaperProps={{ sx: { borderTop: `4px solid ${meta.color}`, borderRadius: 2 } }}
      >
        {current && (
          <>
            <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1, pb: 1 }}>
              <Icon sx={{ color: meta.color }} />
              <Box component="span" sx={{ fontWeight: 600 }}>
                {current.title || meta.defaultTitle}
              </Box>
            </DialogTitle>
            <DialogContent dividers>
              <DialogContentText
                component="div"
                sx={{
                  whiteSpace: 'pre-wrap',
                  color: 'text.primary',
                  fontSize: '0.95rem',
                  lineHeight: 1.55,
                }}
              >
                {current.message}
              </DialogContentText>
            </DialogContent>
            <DialogActions sx={{ px: 3, py: 2 }}>
              {current.kind === 'confirm' ? (
                <>
                  <Button onClick={() => close(false)} color="inherit">
                    {current.cancelText || 'Annuler'}
                  </Button>
                  <Button
                    onClick={() => close(true)}
                    variant="contained"
                    sx={{
                      bgcolor: meta.color,
                      '&:hover': { bgcolor: meta.color, filter: 'brightness(0.9)' },
                    }}
                    autoFocus
                  >
                    {current.confirmText || 'Confirmer'}
                  </Button>
                </>
              ) : (
                <Button
                  onClick={() => close()}
                  variant="contained"
                  sx={{
                    bgcolor: meta.color,
                    '&:hover': { bgcolor: meta.color, filter: 'brightness(0.9)' },
                  }}
                  autoFocus
                >
                  OK
                </Button>
              )}
            </DialogActions>
          </>
        )}
      </Dialog>
    </NotificationContext.Provider>
  );
}

export function useNotify() {
  const ctx = useContext(NotificationContext);
  if (!ctx) {
    throw new Error('useNotify must be used within a NotificationProvider');
  }
  return ctx;
}
