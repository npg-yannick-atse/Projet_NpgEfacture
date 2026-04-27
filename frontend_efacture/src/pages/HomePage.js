import React, { useEffect, useState, useCallback } from 'react';
import axios from 'axios';
import {
  Box, Typography, Card, CardActionArea, Grid,
  CircularProgress, Alert,
} from '@mui/material';
import * as MuiIcons from '@mui/icons-material';
import { API_ENDPOINTS } from '../config/api';
import { getAuthHeaders } from '../utils/authHeaders';

/**
 * Accueil : grille de cartes pro, chargée dynamiquement depuis /api/invoice-types.
 * Chaque carte = 1 type, avec icône, gradient de couleur et compteur du mois en cours.
 */
const HomePage = ({ onSelectType }) => {
  const [types, setTypes] = useState([]);
  const [stats, setStats] = useState({ downloaded: {}, errors: {} });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const headers = getAuthHeaders();

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [typesRes, statsRes] = await Promise.all([
        axios.get(API_ENDPOINTS.INVOICE_TYPES.BASE, { headers }),
        axios.get(API_ENDPOINTS.INVOICE_TYPES.STATS, { headers }),
      ]);
      setTypes(typesRes.data.data || []);
      setStats(statsRes.data.data || { downloaded: {}, errors: {} });
    } catch (e) {
      setError(e.response?.data?.message || e.message);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return <Box p={6} textAlign="center"><CircularProgress /></Box>;
  }

  // Dégradé depuis la couleur de base (version plus foncée en bas-droite)
  const gradientFor = (hex) => {
    // Fallback si hex invalide
    const base = /^#[0-9a-f]{6}$/i.test(hex || '') ? hex : '#1976d2';
    // Nuance plus sombre (approximation simple)
    const darken = (h) => {
      const n = parseInt(h.slice(1), 16);
      const r = Math.max(0, ((n >> 16) & 0xff) - 40);
      const g = Math.max(0, ((n >> 8)  & 0xff) - 40);
      const b = Math.max(0, (n         & 0xff) - 40);
      return `#${[r, g, b].map(x => x.toString(16).padStart(2, '0')).join('')}`;
    };
    return `linear-gradient(135deg, ${base} 0%, ${darken(base)} 100%)`;
  };

  return (
    <Box
      sx={{
        height: 'calc(100vh - 64px - 48px)', // viewport - AppBar - padding du main (p:3)
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'flex-start',
        pt: 6,
        px: 3,
        boxSizing: 'border-box',
      }}
    >
      <Box sx={{ mb: 5, textAlign: 'center' }}>
        <Typography variant="h4" fontWeight={700} sx={{ mb: 0.5 }}>
          Bienvenue
        </Typography>
        <Typography variant="body1" color="text.secondary">
          Choisissez un type de facturation pour démarrer
        </Typography>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 3, maxWidth: 1000, width: '100%' }}>{error}</Alert>}

      {types.length === 0 ? (
        <Alert severity="info" sx={{ maxWidth: 1000, width: '100%' }}>
          Aucun type de facture actif. Un administrateur doit en créer dans Paramètres → Types de facture.
        </Alert>
      ) : (
        <Grid container spacing={3} justifyContent="center" sx={{ maxWidth: 1100 }}>
          {types.map(t => {
            const Icon = MuiIcons[t.icon_name] || MuiIcons.Receipt;
            const downloadedCount = stats.downloaded?.[t.code] || 0;
            const errorCount = stats.errors?.[t.code] || 0;
            return (
              <Grid item xs={12} sm={6} md={3} key={t.id} sx={{ display: 'flex' }}>
                <Card
                  elevation={0}
                  sx={{
                    borderRadius: 3,
                    overflow: 'hidden',
                    width: '100%',
                    height: 290,
                    display: 'flex',
                    flexDirection: 'column',
                    background: gradientFor(t.color_hex),
                    color: '#fff',
                    boxShadow: '0 4px 14px rgba(0,0,0,0.10)',
                    transition: 'transform 0.25s ease, box-shadow 0.25s ease',
                    '&:hover': {
                      transform: 'translateY(-6px)',
                      boxShadow: '0 14px 30px rgba(0,0,0,0.22)',
                    },
                  }}
                >
                  <CardActionArea
                    onClick={() => onSelectType(t.code)}
                    sx={{
                      height: '100%',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'stretch',
                      p: 2.5,
                      '& .MuiCardActionArea-focusHighlight': { display: 'none' },
                    }}
                  >
                    {/* Header : icône dans un carré blanc translucide */}
                    <Box sx={{ display: 'flex', alignItems: 'center', width: '100%', mb: 'auto' }}>
                      <Box
                        sx={{
                          width: 56,
                          height: 56,
                          borderRadius: 2,
                          bgcolor: 'rgba(255,255,255,0.2)',
                          backdropFilter: 'blur(4px)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0,
                        }}
                      >
                        <Icon sx={{ fontSize: 32, color: '#fff' }} />
                      </Box>
                    </Box>

                    {/* Stats : 2 lignes — total téléchargées + total erreurs */}
                    <Box sx={{ width: '100%', display: 'flex', gap: 1, mt: 1, mb: 1 }}>
                      <Box
                        sx={{
                          flex: 1,
                          bgcolor: 'rgba(255,255,255,0.2)',
                          backdropFilter: 'blur(4px)',
                          borderRadius: 1.5,
                          px: 1,
                          py: 0.6,
                          color: '#fff',
                        }}
                      >
                        <Typography variant="caption" sx={{ fontSize: 10, opacity: 0.85, display: 'block', lineHeight: 1.1 }}>
                          Téléchargées
                        </Typography>
                        <Typography variant="h6" sx={{ fontWeight: 700, fontSize: 20, lineHeight: 1.1 }}>
                          {downloadedCount}
                        </Typography>
                      </Box>
                      <Box
                        sx={{
                          flex: 1,
                          bgcolor: errorCount > 0 ? 'rgba(244,67,54,0.85)' : 'rgba(255,255,255,0.15)',
                          backdropFilter: 'blur(4px)',
                          borderRadius: 1.5,
                          px: 1,
                          py: 0.6,
                          color: '#fff',
                        }}
                      >
                        <Typography variant="caption" sx={{ fontSize: 10, opacity: 0.85, display: 'block', lineHeight: 1.1 }}>
                          En erreur
                        </Typography>
                        <Typography variant="h6" sx={{ fontWeight: 700, fontSize: 20, lineHeight: 1.1 }}>
                          {errorCount}
                        </Typography>
                      </Box>
                    </Box>

                    {/* Footer : titre + code */}
                    <Box sx={{ width: '100%', mt: 'auto' }}>
                      <Typography
                        variant="subtitle1"
                        fontWeight={700}
                        sx={{
                          color: '#fff',
                          lineHeight: 1.3,
                          mb: 0.5,
                          display: '-webkit-box',
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: 'vertical',
                          overflow: 'hidden',
                          minHeight: 42,
                          textShadow: '0 1px 2px rgba(0,0,0,0.15)',
                        }}
                      >
                        {t.label}
                      </Typography>
                      <Typography
                        variant="caption"
                        sx={{
                          color: 'rgba(255,255,255,0.85)',
                          fontFamily: 'monospace',
                          fontWeight: 500,
                          fontSize: 11,
                          letterSpacing: 0.3,
                        }}
                      >
                        {t.code}
                      </Typography>
                    </Box>
                  </CardActionArea>
                </Card>
              </Grid>
            );
          })}
        </Grid>
      )}
    </Box>
  );
};

export default HomePage;
