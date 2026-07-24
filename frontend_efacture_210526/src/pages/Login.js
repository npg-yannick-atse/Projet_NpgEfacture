import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import {
  Paper,
  TextField,
  Button,
  Typography,
  Box,
  Alert,
  CircularProgress,
  InputAdornment,
  IconButton,
  Fade,
  Avatar
} from '@mui/material';
import {
  Person as PersonIcon,
  Lock as LockIcon,
  Visibility,
  VisibilityOff,
  Login as LoginIcon
} from '@mui/icons-material';
import { useAuth } from '../contexts/AuthContext';
import { API_ENDPOINTS } from '../config/api';

const Login = () => {
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await axios.post(API_ENDPOINTS.AUTH.LOGIN, {
        username,
        password
      });

      if (response.data.success) {
        login(null, response.data.user);
        navigate('/');
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Échec de la connexion. Veuillez vérifier vos identifiants.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #1e3a8a 0%, #3b82f6 50%, #93c5fd 100%)',
        padding: 3,
        position: 'relative',
        overflow: 'hidden',
        '&::before': {
          content: '""',
          position: 'absolute',
          width: '500px',
          height: '500px',
          background: 'rgba(255, 255, 255, 0.1)',
          borderRadius: '50%',
          top: '-10%',
          right: '-10%',
          filter: 'blur(80px)',
        },
        '&::after': {
          content: '""',
          position: 'absolute',
          width: '300px',
          height: '300px',
          background: 'rgba(59, 130, 246, 0.2)',
          borderRadius: '50%',
          bottom: '-5%',
          left: '-5%',
          filter: 'blur(60px)',
        }
      }}
    >
      <Fade in={true} timeout={800}>
        <Paper
          elevation={24}
          sx={{
            padding: { xs: 4, sm: 6 },
            width: '100%',
            maxWidth: 450,
            borderRadius: 4,
            background: 'rgba(255, 255, 255, 0.85)',
            backdropFilter: 'blur(20px)',
            border: '1px solid rgba(255, 255, 255, 0.3)',
            boxShadow: '0 8px 32px 0 rgba(31, 38, 135, 0.37)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center'
          }}
        >
          <Avatar
            sx={{
              m: 1,
              bgcolor: 'primary.main',
              width: 56,
              height: 56,
              boxShadow: '0 4px 20px rgba(0,0,0,0.1)'
            }}
          >
            <LoginIcon fontSize="large" />
          </Avatar>

          <Typography
            component="h1"
            variant="h4"
            sx={{
              mb: 1,
              fontWeight: 800,
              color: '#1e3a8a',
              textAlign: 'center',
              letterSpacing: '-0.5px'
            }}
          >
            E_Facture
          </Typography>

          <Typography
            variant="subtitle1"
            sx={{
              mb: 4,
              color: 'text.secondary',
              textAlign: 'center',
              fontWeight: 500
            }}
          >
            Gestion Intelligente des Factures SAP
          </Typography>

          {error && (
            <Fade in={!!error}>
              <Alert
                severity="error"
                sx={{
                  mb: 3,
                  width: '100%',
                  borderRadius: 2,
                  boxShadow: '0 2px 10px rgba(211, 47, 47, 0.1)'
                }}
              >
                {error}
              </Alert>
            </Fade>
          )}

          <Box component="form" onSubmit={handleSubmit} sx={{ width: '100%' }}>
            <TextField
              margin="normal"
              required
              fullWidth
              id="username"
              label="Nom d'utilisateur"
              name="username"
              autoComplete="username"
              autoFocus
              variant="outlined"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <PersonIcon color="primary" sx={{ opacity: 0.7 }} />
                  </InputAdornment>
                ),
                sx: { borderRadius: 2.5 }
              }}
            />
            <TextField
              margin="normal"
              required
              fullWidth
              name="password"
              label="Mot de passe"
              type={showPassword ? 'text' : 'password'}
              id="password"
              autoComplete="current-password"
              variant="outlined"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <LockIcon color="primary" sx={{ opacity: 0.7 }} />
                  </InputAdornment>
                ),
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton
                      onClick={() => setShowPassword(!showPassword)}
                      edge="end"
                    >
                      {showPassword ? <VisibilityOff /> : <Visibility />}
                    </IconButton>
                  </InputAdornment>
                ),
                sx: { borderRadius: 2.5 }
              }}
            />

            <Button
              type="submit"
              fullWidth
              variant="contained"
              disabled={loading}
              sx={{
                mt: 4,
                mb: 2,
                py: 1.8,
                borderRadius: 2.5,
                fontSize: '1.1rem',
                fontWeight: 700,
                textTransform: 'none',
                boxShadow: '0 10px 20px rgba(59, 130, 246, 0.3)',
                transition: 'all 0.3s ease',
                '&:hover': {
                  transform: 'translateY(-2px)',
                  boxShadow: '0 15px 25px rgba(59, 130, 246, 0.4)',
                }
              }}
            >
              {loading ? (
                <CircularProgress size={26} color="inherit" />
              ) : (
                'Se connecter au portail'
              )}
            </Button>

            <Typography variant="body2" color="text.secondary" align="center" sx={{ mt: 2, opacity: 0.8 }}>
              © {new Date().getFullYear()} Gandour - Version 1.2
            </Typography>
          </Box>
        </Paper>
      </Fade>
    </Box>
  );
};

export default Login;
