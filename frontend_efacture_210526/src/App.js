import React, { useState, useRef, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { API_ENDPOINTS } from './config/api';
import {
  AppBar,
  Box,
  Container,
  Typography,
  TextField,
  Button,
  Table,
  TableBody,
  TableCell as MuiTableCell,
  TableContainer,
  TableHead,
  TableRow,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Paper,
  Toolbar,
  CircularProgress,
  FormControl,
  Select,
  MenuItem,
  InputAdornment,
  Chip,
  Checkbox,
  FormControlLabel,
  LinearProgress,
  TableSortLabel,
  TablePagination,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Tooltip,
  Alert,

  InputLabel
} from '@mui/material';
import DownloadIcon from '@mui/icons-material/Download';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import DeleteIcon from '@mui/icons-material/Delete';
import VisibilityIcon from '@mui/icons-material/Visibility';
import SendIcon from '@mui/icons-material/Send';
import PrintIcon from '@mui/icons-material/Print';
import LogoutIcon from '@mui/icons-material/Logout';
import EditIcon from '@mui/icons-material/Edit';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import SearchIcon from '@mui/icons-material/Search';
import ArrowDropDownIcon from '@mui/icons-material/ArrowDropDown';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import HomeIcon from '@mui/icons-material/Home';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import UndoIcon from '@mui/icons-material/Undo';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import ReportProblemIcon from '@mui/icons-material/ReportProblem';

import Sidebar from './components/Sidebar';
import Login from './pages/Login';
import SettingsPage from './pages/SettingsPage';
import FneCancellationsPage from './pages/FneCancellationsPage';
import BlValidationPage from './pages/BlValidationPage';
import AutoDownloadPage from './pages/AutoDownloadPage';
import NonFnePage from './pages/NonFnePage';
import HomePage from './pages/HomePage';
import { useAuth } from './contexts/AuthContext';
import { useNotify } from './contexts/NotificationContext';
import axios from 'axios';
import { Grid } from '@mui/material';
import * as XLSX from 'xlsx';

// ─── N°Dossier : helpers pour les factures EXPORT regroupées par dossier ───
// Le numéro est stocké dans le payload `data` (premier item) au moment de
// l'import Excel. On accepte plusieurs alias pour rester robuste.
const DOSSIER_KEY_ALIASES = [
  'numero_dossier', 'numeroDossier', 'N°Dossier', 'NoDossier',
  'no_dossier', 'n_dossier', 'dossier', 'Dossier', 'NDossier'
];
const normalizeDossierKey = (s) => (s || '').toString().toLowerCase()
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9]/g, '');
const NORMALIZED_DOSSIER_ALIASES = DOSSIER_KEY_ALIASES.map(normalizeDossierKey);

const readDossierFromObject = (obj) => {
  if (!obj || typeof obj !== 'object') return null;
  for (const alias of DOSSIER_KEY_ALIASES) {
    const v = obj[alias];
    if (v !== undefined && v !== null && String(v).trim() !== '') return String(v).trim();
  }
  for (const key of Object.keys(obj)) {
    if (NORMALIZED_DOSSIER_ALIASES.includes(normalizeDossierKey(key))) {
      const v = obj[key];
      if (v !== undefined && v !== null && String(v).trim() !== '') return String(v).trim();
    }
  }
  return null;
};

// Lit le N°Dossier depuis une ligne de la table téléchargées (data peut être array, ou {data: array}, ou objet)
const getNumeroDossier = (invoice) => {
  if (!invoice) return null;
  let raw = invoice.data;
  if (typeof raw === 'string') {
    try { raw = JSON.parse(raw); } catch { raw = null; }
  }
  if (Array.isArray(raw)) {
    for (const item of raw) {
      const v = readDossierFromObject(item);
      if (v) return v;
    }
    return null;
  }
  if (raw && typeof raw === 'object') {
    const direct = readDossierFromObject(raw);
    if (direct) return direct;
    if (Array.isArray(raw.data)) {
      for (const item of raw.data) {
        const v = readDossierFromObject(item);
        if (v) return v;
      }
    }
  }
  return null;
};

// Lit le N°Dossier depuis une facture envoyée.
// 1) Cherche d'abord dans api_response (cas où le payload FNE a remonté le dossier)
// 2) Sinon fallback sur la facture téléchargée correspondante (downloadedInvoices)
//    car c'est là que vit la donnée d'origine après l'import Excel.
const getNumeroDossierSent = (sent, downloadedInvoices) => {
  if (!sent) return null;
  let resp = sent.api_response;
  if (typeof resp === 'string') {
    try { resp = JSON.parse(resp); } catch { resp = null; }
  }
  const fromResp = readDossierFromObject(resp);
  if (fromResp) return fromResp;
  if (!Array.isArray(downloadedInvoices) || downloadedInvoices.length === 0) return null;
  const numero = sent.numero_facture;
  if (!numero) return null;
  const match = downloadedInvoices.find(d =>
    d.numero === numero ||
    d.numeroFacture === numero ||
    (d.computedDetails && d.computedDetails.numeroFacture === numero)
  );
  return match ? getNumeroDossier(match) : null;
};

// Composant pour l'en-tête du tableau
const TableHeaderCell = ({ children, align = 'left' }) => (
  <th style={{
    padding: '12px 16px',
    textAlign: align,
    borderRight: '1px solid #e0e0e0',
    borderBottom: '1px solid #e0e0e0',
    backgroundColor: '#f5f5f5',
    fontWeight: 600,
    whiteSpace: 'nowrap'
  }}>
    {children}
  </th>
);

// Composant pour les cellules du tableau
const TableCell = ({ children, align = 'left' }) => (
  <MuiTableCell style={{
    padding: '12px 16px',
    textAlign: align,
    borderRight: '1px solid #e0e0e0',
    borderBottom: '1px solid #e0e0e0',
    verticalAlign: 'top'
  }}>
    {children}
  </MuiTableCell>
);

// Fonction pour formater les montants avec points comme séparateur décimal
// Fonction pour formater les montants avec points comme séparateur décimal
const formatMontant = (nombre) => {
  if (!nombre) return '0';
  // Diviser par 10 car SAP stocke les montants multipliés par 10
  const montantCorrige = Number(nombre) / 10;
  // Formater avec séparateur de milliers sans décimales
  return Math.round(montantCorrige).toLocaleString('fr-FR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
    useGrouping: true
  }).replace(/\s/g, ' ');
};

// Fonction spéciale pour le TOTAL HT (même format que formatMontant)
const formatTotalHT = (nombre) => {
  if (nombre === undefined || nombre === null) return '0.000';
  // Utiliser le même format que formatMontant mais sans conversion
  return formatMontant(nombre);
};

// Formateur simple sans division pour les montants (utilisé pour les factures importées)
const formatMontantSimple = (nombre) => {
  if (nombre === undefined || nombre === null || nombre === '') return '0';
  // Nettoyer la chaîne si c'est déjà formaté (enlever espaces)
  const cleanStr = String(nombre).replace(/[\s\u00A0]/g, '').replace(',', '.');
  const n = Number(cleanStr);
  const safe = isNaN(n) ? 0 : n;
  return Math.round(safe).toLocaleString('fr-FR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
    useGrouping: true
  }).replace(/\s/g, ' ');
};

// Composant pour les cellules éditables (défini à l'extérieur mais sans hooks)
const EditableCell = ({ value, fieldName, invoiceNumber, lineNumber, onEdit, isEditing, editingValue, onEditStart, onEditChange, onEditEnd, isDisabled = false, isDetailView = false, isError = false }) => {
  const cellRef = useRef(null);

  const handleDoubleClick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (isDisabled) return;
    console.log('Double-click detected on field:', fieldName, 'Current value:', value);
    console.log('Calling onEditStart with:', fieldName, value);
    // Appeler directement onEditStart sans passer par la fonction intermédiaire
    onEditStart(fieldName, value);
  };



  const handleKeyDown = (e) => {
    if (isDisabled) return;
    if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      onEditEnd(editingValue);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      onEditEnd(null); // null pour annuler
    }
  };

  const handleBlur = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (isDisabled) return;
    onEditEnd(editingValue);
  };

  const handleChange = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (isDisabled) return;
    onEditChange(e.target.value);
  };

  useEffect(() => {
    console.log('EditableCell isEditing changed:', isEditing, 'fieldName:', fieldName);
    if (isEditing && cellRef.current) {
      const input = cellRef.current.querySelector('input');
      if (input) {
        input.focus();
        input.select();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEditing]);

  return (
    <TableCell
      sx={{
        padding: '8px 12px',
        border: isEditing ? '2px solid #1976d2' : isError ? '2px solid #d32f2f' : 'none',
        position: 'relative',
        backgroundColor: isError ? '#fff5f5' : (isDisabled ? '#f5f5f5' : 'inherit'),
        opacity: isDisabled ? 0.7 : 1
      }}
      ref={cellRef}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        {isEditing ? (
          <TextField
            value={editingValue}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            onBlur={handleBlur}
            size="small"
            variant="outlined"
            sx={{
              flex: 1,
              '& .MuiOutlinedInput-root': {
                padding: '4px 8px'
              }
            }}
            autoFocus
          />
        ) : (
          <>
            <span
              style={{
                flex: 1,
                display: 'block',
                minHeight: '20px',
                cursor: (isDisabled || !isDetailView) ? 'default' : 'pointer',
                color: isDisabled ? '#666' : 'inherit',
                paddingRight: isDetailView ? '24px' : '8px',
                position: 'relative'
              }}
              onClick={isDetailView ? handleDoubleClick : undefined}
            >
              {value}

            </span>
            {!isDisabled && isDetailView && (
              <IconButton
                size="small"
                onClick={handleDoubleClick}
                sx={{
                  opacity: 0.6,
                  '&:hover': { opacity: 1 },
                  padding: '2px'
                }}
                title="Modifier"
              >
                <EditIcon sx={{ fontSize: 16 }} />
              </IconButton>
            )}
            {isError && !isEditing && (
              <ErrorOutlineIcon color="error" sx={{ fontSize: 18 }} />
            )}
          </>
        )}
      </Box>
    </TableCell>
  );
};

// Composant pour les cellules éditables avec liste déroulante
const EditableSelectCell = ({ value, fieldName, invoiceNumber, lineNumber, onEdit, isEditing, editingValue, onEditStart, onEditChange, onEditEnd, options, isDisabled = false, isDetailView = false, isError = false }) => {
  const cellRef = useRef(null);

  // Fonction pour obtenir le label à afficher à partir de la valeur
  const getDisplayLabel = (val) => {
    if (options && options.length > 0 && typeof options[0] === 'object') {
      const option = options.find(opt => opt.value === val);
      return option ? option.label : val;
    }
    return val;
  };

  const handleClick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (isDisabled || !isDetailView) return;
    console.log('Click detected on select field:', fieldName, 'Current value:', value);
    onEditStart(fieldName, value);
  };

  const handleKeyDown = (e) => {
    if (isDisabled) return;
    if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      onEditEnd(editingValue);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      onEditEnd(null); // null pour annuler
    }
  };

  const handleChange = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (isDisabled) return;
    const newValue = e.target.value;
    onEditChange(newValue);
    // Sauvegarder automatiquement quand une valeur est sélectionnée
    setTimeout(() => onEditEnd(newValue), 0);
  };

  useEffect(() => {
    console.log('EditableSelectCell isEditing changed:', isEditing, 'fieldName:', fieldName);
    if (isEditing && cellRef.current) {
      const select = cellRef.current.querySelector('select');
      if (select) {
        select.focus();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEditing]);

  return (
    <TableCell
      sx={{
        padding: '8px 12px',
        border: isEditing ? '2px solid #1976d2' : isError ? '2px solid #d32f2f' : 'none',
        position: 'relative',
        backgroundColor: isError ? '#fff5f5' : (isDisabled ? '#f5f5f5' : 'inherit'),
        opacity: isDisabled ? 0.7 : 1
      }}
      ref={cellRef}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        {isEditing ? (
          <FormControl size="small" sx={{ flex: 1 }}>
            <Select
              value={editingValue}
              onChange={handleChange}
              onKeyDown={handleKeyDown}
              sx={{
                '& .MuiSelect-select': {
                  padding: '4px 8px'
                }
              }}
              autoFocus
            >
              {options.map((option) => {
                const optionValue = typeof option === 'object' ? option.value : option;
                const optionLabel = typeof option === 'object' ? option.label : option;
                return (
                  <MenuItem key={optionValue} value={optionValue}>
                    {optionLabel}
                  </MenuItem>
                );
              })}
            </Select>
          </FormControl>
        ) : (
          <>
            <span
              style={{
                flex: 1,
                display: 'block',
                minHeight: '20px',
                cursor: (isDisabled || !isDetailView) ? 'default' : 'pointer',
                color: isDisabled ? '#666' : 'inherit'
              }}
              onClick={handleClick}
            >
              {getDisplayLabel(value)}
            </span>
            {!isDisabled && isDetailView && (
              <IconButton
                size="small"
                onClick={handleClick}
                sx={{
                  opacity: 0.6,
                  '&:hover': { opacity: 1 },
                  padding: '2px'
                }}
                title="Sélectionner"
              >
                <ArrowDropDownIcon sx={{ fontSize: 16 }} />
              </IconButton>
            )}
            {isError && !isEditing && (
              <ErrorOutlineIcon color="error" sx={{ fontSize: 18 }} />
            )}
          </>
        )}
      </Box>
    </TableCell>
  );
};

// Fonction pour afficher les détails d'une facture
const FactureDisplay = ({
  facture,
  refCallback,
  fieldModifications: initialFieldModifications,
  handleInlineEdit: parentHandleInlineEdit,
  pendingModifications,
  setPendingModifications,
  applyAllModifications,
  editingCell,
  editValue,
  handleEditStart: parentHandleEditStart,
  handleEditChange: parentHandleEditChange,
  handleEditEnd: parentHandleEditEnd,
  sentInvoices = [],
  isDetailView = false,
  validationErrors = {}
}) => {
  // Options pour les listes déroulantes
  const templateOptions = [
    { value: 'B2B', label: 'B2B (Entreprise)' },
    { value: 'B2C', label: 'B2C (Consommateur final)' },
    { value: 'B2F', label: 'B2F (Client International)' },
    { value: 'B2G', label: 'B2G (Etat et collectivités)' }
  ];
  const paymentMethodOptions = ['card', 'check', 'cash', 'mobile-money', 'transfer', 'deferred'];
  const pointOfSaleOptions = ['NPG', 'NPG_SALE', 'NPG_SIEGE_FACTURATION'];
  // Utiliser directement les états du parent - pas d'état local
  // pour éviter les conflits de synchronisation

  // Fonction pour vérifier si une facture a été envoyée
  const isInvoiceSent = (invoiceNumber) => {
    return sentInvoices.some(sentInvoice =>
      sentInvoice.numero_facture === invoiceNumber
    );
  };



  // Fonction pour obtenir la valeur modifiée d'un champ
  const getModifiedValue = (invoiceNumber, fieldName, defaultValue) => {
    const key = `${invoiceNumber}_${fieldName}`;
    console.log(`getModifiedValue - key: ${key}, defaultValue: ${defaultValue}`);
    console.log(`initialFieldModifications:`, initialFieldModifications);
    console.log(`pendingModifications:`, pendingModifications);

    // Utiliser directement l'état du parent
    if (initialFieldModifications && initialFieldModifications[key]) {
      console.log(`Found in initialFieldModifications: ${initialFieldModifications[key]}`);
      return initialFieldModifications[key];
    }
    // Ensuite vérifier dans pendingModifications (modifications en attente)
    if (pendingModifications && pendingModifications[key]) {
      console.log(`Found in pendingModifications: ${pendingModifications[key].newValue}`);
      return pendingModifications[key].newValue;
    }
    // Sinon utiliser la valeur par défaut
    console.log(`Using defaultValue: ${defaultValue}`);
    return defaultValue;
  };

  // Pas de console.log pour les données brutes

  if (!facture || !facture.data || (!facture.data.data && !Array.isArray(facture.data)) || (facture.data.data && facture.data.data.length === 0 && !Array.isArray(facture.data))) {
    return <Typography>Aucune donnée de facture disponible</Typography>;
  }

  // S'assurer que les données sont bien un tableau et extraire les lignes de facture
  let lignesFacture = [];

  // Facture standard : s'assurer que les données sont bien au bon format
  if (Array.isArray(facture.data?.data)) {
    lignesFacture = facture.data.data;
  } else if (facture.data?.data) {
    lignesFacture = [facture.data.data];
  } else if (Array.isArray(facture.data)) {
    lignesFacture = facture.data;
  } else if (facture.data) {
    lignesFacture = [facture.data];
  }

  // Exclure les entrées de métadonnées (résolution d'avoir) qui ne sont pas de vraies lignes d'article
  lignesFacture = lignesFacture.filter(ligne => ligne && !ligne._avoirResolution);

  // Normalisation spécifique pour les factures importées depuis un template (source === 'template_import')
  if (lignesFacture.length > 0 && lignesFacture[0].source === 'template_import') {
    lignesFacture = lignesFacture.map((ligne) => ({
      ...ligne,
      // Numéro de facture et nom client viennent de l'en-tête de facture
      numeroFacture: ligne.numeroFacture ?? facture.numero ?? 'N/A',
      nomClient: ligne.nomClient ?? facture.client ?? 'Client inconnu',

      // Coordonnées client (template snake_case -> camelCase utilisé par le tableau)
      clientEmail: ligne.clientEmail ?? ligne.client_email ?? '',
      clientPhone: ligne.clientPhone ?? ligne.client_phone ?? '',
      clientNCC: ligne.clientNCC ?? ligne.client_ncc ?? '',

      // Champs business
      Template: ligne.Template ?? ligne.template ?? '',
      PaymentMethod: ligne.PaymentMethod ?? ligne.payment_method ?? '',
      PointOfSale: ligne.PointOfSale ?? ligne.point_of_sale ?? '',

      // Quantité / prix / TVA / remises
      quantite: ligne.quantite ?? ligne.quantity ?? 0,
      PU_HT: ligne.PU_HT ?? ligne.pu_ht ?? 0,
      TVA: ligne.TVA ?? ligne.tva ?? 0,
      OtherTaxName: (ligne.OtherTaxPct || ligne.other_tax_pct) ? 'AIRSI' : (ligne.OtherTaxName ?? ligne.other_tax_name ?? ''),
      OtherTaxPct: ligne.OtherTaxPct ?? ligne.other_tax_pct ?? 0,
      Rem_Pct: ligne.Rem_Pct ?? ligne.rem_pct ?? 0,

      // Message commercial
      commercialMessage: ligne.commercialMessage ?? ligne.commercial_message ?? '',

      // Nouveaux champs pour Export
      foreignCurrency: ligne.foreignCurrency ?? ligne.foreign_currency ?? '',
      foreignCurrencyRate: ligne.foreignCurrencyRate ?? ligne.foreign_currency_rate ?? 0
    }));
  }

  // Normalisation générale pour s'assurer que les champs attendus par le tableau existent
  lignesFacture = lignesFacture.map(ligne => ({
    ...ligne,
    PU_HT: ligne.PU_HT ?? ligne.pu_ht ?? ligne.prixUnitaireHT ?? ligne.prix_unitaire_ht ?? ligne.prixUnitaire_HT ?? 0,
    OtherTaxPct: ligne.OtherTaxPct ?? ligne.other_tax_pct ?? ligne.otherTaxPct ?? 0,
    Rem_Pct: ligne.Rem_Pct ?? ligne.rem_pct ?? ligne.remisePct ?? 0,
    TVA: ligne.TVA ?? ligne.tva ?? 0,
    quantite: ligne.quantite ?? ligne.quantity ?? 0,
    unite: ligne.unite ?? ligne.VRKME ?? ligne.MEINS ?? '',
    designation: ligne.designation ?? ligne.ARKTX ?? ligne.designation ?? '',
    PaymentMethod: ligne.PaymentMethod || 'deferred',
    PointOfSale: ligne.PointOfSale || 'NPG_SIEGE_FACTURATION',
    OtherTaxName: (ligne.OtherTaxPct || ligne.other_tax_pct || ligne.otherTaxPct) ? 'AIRSI' : (ligne.OtherTaxName || ligne.other_tax_name || ligne.otherTaxName || '')
  }));

  // Appliquer les modifications inline aux données avant affichage
  lignesFacture = lignesFacture.map(ligne => {
    const modifiedLigne = { ...ligne };
    const invoiceNumber = ligne.numeroFacture;

    if (invoiceNumber && initialFieldModifications) {
      // Appliquer chaque modification si elle existe
      if (initialFieldModifications[`${invoiceNumber}_ClientEmail`]) {
        modifiedLigne.clientEmail = initialFieldModifications[`${invoiceNumber}_ClientEmail`];
      }
      if (initialFieldModifications[`${invoiceNumber}_ClientPhone`]) {
        modifiedLigne.clientPhone = initialFieldModifications[`${invoiceNumber}_ClientPhone`];
      }
      if (initialFieldModifications[`${invoiceNumber}_Template`]) {
        modifiedLigne.template = initialFieldModifications[`${invoiceNumber}_Template`];
      }
      if (initialFieldModifications[`${invoiceNumber}_PaymentMethod`]) {
        modifiedLigne.paymentMethod = initialFieldModifications[`${invoiceNumber}_PaymentMethod`];
      }
      if (initialFieldModifications[`${invoiceNumber}_InvoiceType`]) {
        modifiedLigne.invoiceType = initialFieldModifications[`${invoiceNumber}_InvoiceType`];
      }
      if (initialFieldModifications[`${invoiceNumber}_isRne`]) {
        modifiedLigne.isRne = initialFieldModifications[`${invoiceNumber}_isRne`];
      }
      if (initialFieldModifications[`${invoiceNumber}_PointOfSale`]) {
        modifiedLigne.pointOfSale = initialFieldModifications[`${invoiceNumber}_PointOfSale`];
      }
    }

    return modifiedLigne;
  });

  // Extraire les totaux depuis facture.totaux s'ils existent
  const totaux = facture.totaux || {};

  // Détection d'une facture importée depuis le template
  const isTemplateImportFacture = lignesFacture.length > 0 && lignesFacture[0].source === 'template_import';

  // Détection d'une facture EXPORT (parmi les imports template)
  const isFactureExport = isTemplateImportFacture && (
    lignesFacture[0]?.import_view === 'FACTURE_EXPORT' ||
    lignesFacture[0]?.invoice_type_code === 'FACTURE_EXPORT' ||
    lignesFacture[0]?.PointOfSale === 'FACTURE_EXPORT' ||
    lignesFacture[0]?.pointOfSale === 'FACTURE_EXPORT' ||
    facture?.invoice_type_code === 'FACTURE_EXPORT' ||
    facture?.pointOfSale === 'FACTURE_EXPORT'
  );

  // Parsing du Message Commercial en paires { label, value } pour affichage en cartes (export)
  const commercialMessageEntries = (() => {
    if (!isFactureExport) return [];
    const raw = lignesFacture[0]?.commercialMessage || lignesFacture[0]?.commercial_message || '';
    if (!raw) return [];
    return String(raw)
      .split(/\r?\n/)
      .map(l => l.trim())
      .filter(Boolean)
      .map(line => {
        const idx = line.indexOf(':');
        if (idx === -1) return { label: line, value: '' };
        return { label: line.slice(0, idx).trim(), value: line.slice(idx + 1).trim() };
      })
      .filter(e => e.label);
  })();

  // Formateur simple sans division pour les montants (utilisé pour les factures importées)
  const formatMontantSimple = (nombre) => {
    if (nombre === undefined || nombre === null || nombre === '') return '0';
    const n = Number(String(nombre).replace(',', '.'));
    const safe = isNaN(n) ? 0 : n;
    return Math.round(safe).toLocaleString('fr-FR', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
      useGrouping: true
    }).replace(/\s/g, ' ');
  };

  const formatMontantDisplay = (nombre) =>
    isTemplateImportFacture ? formatMontantSimple(nombre) : formatMontant(nombre);

  const formatTotalHTDisplay = (nombre) =>
    isTemplateImportFacture ? formatMontantSimple(nombre) : formatTotalHT(nombre);

  // Afficher la structure de la première ligne
  if (lignesFacture.length > 0) {
    console.log('=== STRUCTURE DE LA PREMIÈRE LIGNE ===');
    console.log('Clés disponibles:', Object.keys(lignesFacture[0]));
    console.log('Valeurs de la première ligne:', lignesFacture[0]);
    console.log('Référence:', lignesFacture[0].reference);
    console.log('Désignation:', lignesFacture[0].designation);
    console.log('Quantité:', lignesFacture[0].quantite);

    // Afficher les clés de XVBRP (lignes de facture)
    if (lignesFacture[0].XVBRP && lignesFacture[0].XVBRP.length > 0) {
      console.log('=== STRUCTURE D\'UNE LIGNE DE FACTURE (XVBRP) ===');
      console.log('Clés disponibles:', Object.keys(lignesFacture[0].XVBRP[0]));
    }

    // Afficher les clés de XVBPA (partenaires)
    if (lignesFacture[0].XVBPA && lignesFacture[0].XVBPA.length > 0) {
      console.log('=== STRUCTURE DES PARTENAIRES (XVBPA) ===');
      console.log('Clés disponibles:', Object.keys(lignesFacture[0].XVBPA[0]));
    }

    // Afficher les clés de XKOMV (conditions de prix)
    if (lignesFacture[0].XKOMV && lignesFacture[0].XKOMV.length > 0) {
      console.log('=== STRUCTURE DES CONDITIONS (XKOMV) ===');
      console.log('Clés disponibles:', Object.keys(lignesFacture[0].XKOMV[0]));
      console.log('Recherche MWAS:', lignesFacture[0].XKOMV.find(item => item.KSCHL === 'MWAS'));
    }
  }

  // Afficher les totaux si disponibles
  if (totaux && Object.keys(totaux).length > 0) {
    console.log('=== TOTAUX DE LA FACTURE ===');
    console.log('Totaux:', totaux);
  }

  // Version de débogage simple pour vérifier les données
  console.log('=== VERSION DÉBOGAGE TABLEAU ===');
  return (
    <Paper ref={refCallback} elevation={3} sx={{ p: 4, mt: 4, overflowX: 'auto' }} id="facture-a-imprimer">
      <Typography variant="h5" gutterBottom sx={{ color: facture?.isRefund ? 'secondary.main' : 'primary.main', fontWeight: 'bold' }}>
        {facture?.isRefund ? 'Détails de l\'Avoir' : 'Détails de la facture'} {facture?.data?.data?.[0]?.numeroFacture || facture?.data?.[0]?.numeroFacture || facture?.numero || 'N/A'}
      </Typography>

      {facture?.isRefund && (
        <Box sx={{ mb: 2, p: 2, bgcolor: 'secondary.light', borderRadius: 1, color: 'secondary.contrastText' }}>
          <Typography variant="body1">
            <strong>Cet affichage correspond à un Avoir (remboursement)</strong> effectif le {new Date(facture.refundDate).toLocaleString('fr-FR')} par {facture.refundBy}.
          </Typography>
        </Box>
      )}

      {/* Cartes "Informations export" — uniquement pour FACTURE_EXPORT */}
      {isFactureExport && commercialMessageEntries.length > 0 && (
        <Box sx={{ mb: 4 }}>
          <Typography variant="h6" gutterBottom>Informations export</Typography>
          <Box sx={{ display: 'flex', gap: 2, mb: 1, flexWrap: 'wrap' }}>
            {commercialMessageEntries.map(({ label, value }, idx) => (
              <Paper key={`${label}-${idx}`} sx={{ p: 2, minWidth: 200 }}>
                <Typography variant="body2" color="text.secondary">{label}</Typography>
                <Typography variant="h6" sx={{ wordBreak: 'break-word' }}>
                  {value && value !== 'N/A' ? value : 'N/A'}
                </Typography>
              </Paper>
            ))}
          </Box>
        </Box>
      )}

      {/* Tableau des totaux et taxes */}
      {totaux && Object.keys(totaux).length > 0 && (
        <Box sx={{ mb: 4 }}>
          <Typography variant="h6" gutterBottom>Récapitulatif des montants</Typography>

          {/* Tableau récapitulatif */}
          <Box sx={{ display: 'flex', gap: 2, mb: 3, flexWrap: 'wrap' }}>
            <Paper sx={{ p: 2, minWidth: 200 }}>
              <Typography variant="body2" color="text.secondary">TOTAL HT</Typography>
              <Typography variant="h6">
                {formatTotalHTDisplay(totaux.totalHT)} FCFA
              </Typography>
            </Paper>
            <Paper sx={{ p: 2, minWidth: 200 }}>
              <Typography variant="body2" color="text.secondary">TOTAL NET HT</Typography>
              <Typography variant="h6">
                {formatMontantDisplay(totaux.totalNetHT)} FCFA
              </Typography>
            </Paper>
            <Paper sx={{ p: 2, minWidth: 200 }}>
              <Typography variant="body2" color="text.secondary">MONTANT TVA</Typography>
              <Typography variant="h6">
                {formatMontantDisplay(totaux.montantTVA)} FCFA
              </Typography>
            </Paper>
            <Paper sx={{ p: 2, minWidth: 200 }}>
              <Typography variant="body2" color="text.secondary">TOTAL TTC</Typography>
              <Typography variant="h6">
                {formatMontantDisplay(totaux.totalTTC)} FCFA
              </Typography>
            </Paper>
            {totaux.montantAIRSI > 0 && (
              <Paper sx={{ p: 2, minWidth: 200 }}>
                <Typography variant="body2" color="text.secondary">MONTANT AIRSI</Typography>
                <Typography variant="h6">
                  {formatMontantDisplay(totaux.montantAIRSI)} FCFA
                </Typography>
              </Paper>
            )}
            <Paper sx={{ p: 2, minWidth: 200, bgcolor: 'primary.main', color: 'white' }}>
              <Typography variant="body2">TOTAL A PAYER</Typography>
              <Typography variant="h6">
                {formatMontantDisplay(totaux.totalAPayer)} FCFA
              </Typography>
            </Paper>
          </Box>

          {/* Tableau des taxes */}
          {totaux.taxData && totaux.taxData.length > 0 && (
            <Box>
              <Typography variant="h6" gutterBottom>Détail des taxes</Typography>
              <TableContainer component={Paper}>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableHeaderCell>TYPE TAXE</TableHeaderCell>
                      <TableHeaderCell align="right">BASE TAXE</TableHeaderCell>
                      <TableHeaderCell align="right">TAUX (%)</TableHeaderCell>
                      <TableHeaderCell align="right">MONTANT</TableHeaderCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {totaux.taxData.map((taxe, index) => (
                      <TableRow key={index}>
                        <TableCell sx={{ fontWeight: 'bold' }}>{taxe.typeTaxe}</TableCell>
                        <TableCell align="right">
                          {formatMontantDisplay(taxe.baseTaxe)} FCFA
                        </TableCell>
                        <TableCell align="right">{taxe.taux}%</TableCell>
                        <TableCell align="right">
                          {formatMontantDisplay(taxe.montant)} FCFA
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </Box>
          )}
        </Box>
      )}

      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h6" gutterBottom>Détails des articles</Typography>
        {(Object.keys(pendingModifications).length > 0 && !isTemplateImportFacture) && (
          <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
            <Typography variant="body2" color="warning.main">
              {Object.keys(pendingModifications).length} modification(s) en attente
            </Typography>
            <Button
              variant="contained"
              color="warning"
              onClick={applyAllModifications}
              startIcon={<EditIcon />}
            >
              Appliquer les modifications
            </Button>
          </Box>
        )}
      </Box>

      <Box sx={{ overflowX: 'auto', mt: 3 }}>
        <TableContainer component={Paper}>
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>N° Facture</TableHeaderCell>
                <TableHeaderCell>Nom Client</TableHeaderCell>
                <TableHeaderCell>Nom du vendeur</TableHeaderCell>
                <TableHeaderCell>ClientEmail</TableHeaderCell>
                <TableHeaderCell>ClientPhone</TableHeaderCell>
                <TableHeaderCell>ClientNCC</TableHeaderCell>
                <TableHeaderCell>Template</TableHeaderCell>
                <TableHeaderCell>PaymentMethod</TableHeaderCell>
                <TableHeaderCell>InvoiceType</TableHeaderCell>
                <TableHeaderCell>isRne</TableHeaderCell>
                <TableHeaderCell>PointOfSale</TableHeaderCell>
                <TableHeaderCell>Establishment</TableHeaderCell>
                <TableHeaderCell>Référence</TableHeaderCell>
                <TableHeaderCell>Désignation</TableHeaderCell>
                <TableHeaderCell align="right">Quantité</TableHeaderCell>
                <TableHeaderCell>Unité</TableHeaderCell>
                <TableHeaderCell align="right">PU_HT</TableHeaderCell>
                <TableHeaderCell align="right">TVA</TableHeaderCell>
                <TableHeaderCell align="right">CTS</TableHeaderCell>
                <TableHeaderCell align="right">CLS</TableHeaderCell>
                <TableHeaderCell>OtherTaxName</TableHeaderCell>
                <TableHeaderCell align="right">Rem_Pct</TableHeaderCell>
                <TableHeaderCell align="right">OtherTaxPct</TableHeaderCell>
                <TableHeaderCell>Message commercial</TableHeaderCell>
                <TableHeaderCell>DEVISES</TableHeaderCell>
                <TableHeaderCell align="right">Taux de change</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {lignesFacture.map((ligne, index) => {
                console.log(`=== RENDU LIGNE ${index} ===`);
                console.log('Référence:', ligne.reference);
                console.log('Désignation:', ligne.designation);
                console.log('Quantité:', ligne.quantite);
                console.log('Unité:', ligne.unite);
                console.log('Rem_Pct:', ligne.remisePct);
                console.log('Message commercial:', ligne.commercialMessage);
                console.log('VBRK_I:', ligne.VBRK_I);
                console.log('STCEG:', ligne.VBRK_I?.STCEG);

                return (
                  <TableRow key={index} hover>
                    <TableCell>{ligne.numeroFacture || 'N/A'}</TableCell> {/* N° Facture */}
                    <TableCell>{ligne.nomClient || 'N/A'}</TableCell> {/* Nom Client */}
                    <TableCell>{ligne.sellerName || 'N/A'}</TableCell> {/* Nom du vendeur */}
                    <EditableCell
                      value={getModifiedValue(ligne.numeroFacture, 'ClientEmail', ligne.clientEmail || 'N/A')}
                      fieldName="ClientEmail"
                      invoiceNumber={ligne.numeroFacture}
                      lineNumber={index}
                      onEdit={(value) => parentHandleInlineEdit('ClientEmail', ligne.numeroFacture, index, value)}
                      isEditing={editingCell === `ClientEmail_${index}`}
                      editingValue={editValue}
                      onEditStart={(fieldName, value) => parentHandleEditStart(fieldName, value, index)}
                      onEditChange={parentHandleEditChange}
                      onEditEnd={parentHandleEditEnd}
                      isDisabled={isInvoiceSent(ligne.numeroFacture) || isTemplateImportFacture}
                      isDetailView={isDetailView}
                      isError={validationErrors[`${ligne.numeroFacture}_ClientEmail`]}
                    />
                    <EditableCell
                      value={getModifiedValue(ligne.numeroFacture, 'ClientPhone', ligne.clientPhone || 'N/A')}
                      fieldName="ClientPhone"
                      invoiceNumber={ligne.numeroFacture}
                      lineNumber={index}
                      onEdit={(value) => parentHandleInlineEdit('ClientPhone', ligne.numeroFacture, index, value)}
                      isEditing={editingCell === `ClientPhone_${index}`}
                      editingValue={editValue}
                      onEditStart={(fieldName, value) => parentHandleEditStart(fieldName, value, index)}
                      onEditChange={parentHandleEditChange}
                      onEditEnd={parentHandleEditEnd}
                      isDisabled={isInvoiceSent(ligne.numeroFacture) || isTemplateImportFacture}
                      isDetailView={isDetailView}
                      isError={validationErrors[`${ligne.numeroFacture}_ClientPhone`]}
                    />
                    <TableCell>{ligne.clientNCC || 'N/A'}</TableCell> {/* ClientNCC */}
                    <EditableSelectCell
                      value={getModifiedValue(ligne.numeroFacture, 'Template', ligne.Template || 'B2B')}
                      fieldName="Template"
                      invoiceNumber={ligne.numeroFacture}
                      lineNumber={index}
                      onEdit={(value) => parentHandleInlineEdit('Template', ligne.numeroFacture, index, value)}
                      isEditing={editingCell === `Template_${index}`}
                      editingValue={editValue}
                      onEditStart={(fieldName, value) => parentHandleEditStart(fieldName, value, index)}
                      onEditChange={parentHandleEditChange}
                      onEditEnd={parentHandleEditEnd}
                      options={templateOptions}
                      isDisabled={isInvoiceSent(ligne.numeroFacture) || isTemplateImportFacture}
                      isDetailView={isDetailView}
                    />
                    <EditableSelectCell
                      value={getModifiedValue(ligne.numeroFacture, 'PaymentMethod', ligne.PaymentMethod || 'deferred')}
                      fieldName="PaymentMethod"
                      invoiceNumber={ligne.numeroFacture}
                      lineNumber={index}
                      onEdit={(value) => parentHandleInlineEdit('PaymentMethod', ligne.numeroFacture, index, value)}
                      isEditing={editingCell === `PaymentMethod_${index}`}
                      editingValue={editValue}
                      onEditStart={(fieldName, value) => parentHandleEditStart(fieldName, value, index)}
                      onEditChange={parentHandleEditChange}
                      onEditEnd={parentHandleEditEnd}
                      options={paymentMethodOptions}
                      isDisabled={isInvoiceSent(ligne.numeroFacture) || isTemplateImportFacture}
                      isDetailView={isDetailView}
                    />
                    <TableCell>{facture?.isRefund ? 'refund' : (getModifiedValue(ligne.numeroFacture, 'InvoiceType', ligne.invoiceType || 'sale'))}</TableCell>
                    <TableCell>False</TableCell>
                    <EditableSelectCell
                      value={getModifiedValue(
                        ligne.numeroFacture,
                        'PointOfSale',
                        ligne.PointOfSale || 'NPG_SIEGE_FACTURATION'
                      )}
                      fieldName="PointOfSale"
                      invoiceNumber={ligne.numeroFacture}
                      lineNumber={index}
                      onEdit={(value) => parentHandleInlineEdit('PointOfSale', ligne.numeroFacture, index, value)}
                      isEditing={editingCell === `PointOfSale_${index}`}
                      editingValue={editValue}
                      onEditStart={(fieldName, value) => parentHandleEditStart(fieldName, value, index)}
                      onEditChange={parentHandleEditChange}
                      onEditEnd={parentHandleEditEnd}
                      options={pointOfSaleOptions}
                      isDisabled={isInvoiceSent(ligne.numeroFacture) || isTemplateImportFacture}
                      isDetailView={isDetailView}
                    />
                    <TableCell>{ligne.Establishment || 'Nouvelle Parfumerie Gandour'}</TableCell> {/* Establishment */}
                    <TableCell sx={{ backgroundColor: '#ffffcc', borderRight: '1px solid #e0e0e0', borderBottom: '1px solid #e0e0e0' }}>{ligne.reference || 'N/A'}</TableCell> {/* Référence */}
                    <TableCell sx={{ backgroundColor: '#ffffcc', borderRight: '1px solid #e0e0e0', borderBottom: '1px solid #e0e0e0' }}>{ligne.designation || 'N/A'}</TableCell> {/* Désignation */}
                    <TableCell align="right" sx={{ backgroundColor: '#ffffcc', borderRight: '1px solid #e0e0e0', borderBottom: '1px solid #e0e0e0' }}>{ligne.quantite ? Number(ligne.quantite).toLocaleString('fr-FR', { minimumFractionDigits: 0 }) : '0'}</TableCell> {/* Quantité (FKLMG en pièces pour SAP) */}
                    <TableCell sx={{ backgroundColor: '#ffffcc', borderRight: '1px solid #e0e0e0', borderBottom: '1px solid #e0e0e0' }}>
                      {ligne.unite === 'KAR' ? 'CRN' : (ligne.unite === 'ST' ? 'pce' : (ligne.unite || 'pce'))}
                    </TableCell> {/* Unité avec conversion KAR -> CRN et ST -> pce */}
                    <TableCell
                      align="right"
                      sx={{ backgroundColor: '#ffffcc', borderRight: '1px solid #e0e0e0', borderBottom: '1px solid #e0e0e0' }}
                    >
                      {(() => {
                        // Pour les factures importées : PU_HT/pu_ht vient directement du template
                        // Pour SAP : on affiche PU_HT si présent, sinon 0
                        const rawPu =
                          ligne.PU_HT ??
                          ligne.pu_ht ??
                          null;

                        if (rawPu === null || rawPu === undefined || rawPu === '') {
                          return '0';
                        }

                        let n = Number(String(rawPu).replace(',', '.'));
                        if (isNaN(n)) return '0';

                        // Le backend multiplie déjà par 1000 pour KAR/ST et par 10 pour le reste (pour SAP).
                        // On divise par 10 pour obtenir le bon affichage (cohérent avec formatMontant) uniquement pour SAP.
                        // Pour les templates, on garde la valeur telle quelle.
                        if (ligne.source !== 'template_import') {
                          n = n / 10;
                        }

                        return n.toLocaleString('fr-FR', { minimumFractionDigits: 0 });
                      })()}
                    </TableCell> {/* PU_HT */}
                    <TableCell align="right" sx={{ backgroundColor: '#ffffcc', borderRight: '1px solid #e0e0e0', borderBottom: '1px solid #e0e0e0' }}>
                      {(() => {
                        // Vérifier si MWAS existe dans XKOMV pour cette ligne (factures SAP)
                        if (ligne.XKOMV && ligne.XKOMV.length > 0) {
                          const mwasItem = ligne.XKOMV.find(item => item.KSCHL === 'MWAS');
                          if (mwasItem) {
                            return '18%';
                          }
                        }
                        // Factures importées : TVA vient directement du template
                        const rawTva = ligne.TVA ?? ligne.tva;
                        if (rawTva === undefined || rawTva === null || rawTva === '') return 'N/A';
                        const n = Number(String(rawTva).replace(',', '.'));
                        if (isNaN(n)) return rawTva;
                        return `${n.toLocaleString('fr-FR', { minimumFractionDigits: 0 })}%`;
                      })()}
                    </TableCell> {/* TVA */}
                    <TableCell align="right">
                      {(ligne.cts !== undefined && ligne.cts !== null && ligne.cts !== '')
                        ? Number(ligne.cts).toLocaleString('fr-FR', { minimumFractionDigits: 0 })
                        : 'N/A'}
                    </TableCell> {/* CTS = FKIMG (cartons), affichage uniquement, non envoyé à FNE */}
                    <TableCell align="right">
                      {(ligne.cls !== undefined && ligne.cls !== null && ligne.cls !== '')
                        ? Number(ligne.cls).toLocaleString('fr-FR', { minimumFractionDigits: 0 })
                        : 'N/A'}
                    </TableCell> {/* CLS = UMVKZ (pièces par carton), affichage uniquement, non envoyé à FNE */}
                    <TableCell>{ligne.OtherTaxName || 'N/A'}</TableCell> {/* OtherTaxName */}
                    {console.log('Rem_Pct (template):', ligne.Rem_Pct, 'RemisePct (SAP):', ligne.remisePct)}
                    <TableCell align="right">
                      {(() => {
                        const rawRem = ligne.Rem_Pct ?? ligne.rem_pct ?? ligne.remisePct;
                        if (rawRem === undefined || rawRem === null || rawRem === '') return '0.00';
                        const n = Number(String(rawRem).replace(',', '.'));
                        if (isNaN(n)) return '0.00';
                        return n.toLocaleString('fr-FR', { minimumFractionDigits: 2 });
                      })()}
                    </TableCell> {/* Rem_Pct */}
                    <TableCell align="right">
                      {(() => {
                        const rawPct = ligne.OtherTaxPct ?? ligne.other_tax_pct;
                        if (rawPct === undefined || rawPct === null || rawPct === '') return '0.00';
                        const n = Number(String(rawPct).replace(',', '.'));
                        if (isNaN(n)) return '0.00';
                        return n.toLocaleString('fr-FR', { minimumFractionDigits: 2 });
                      })()}
                    </TableCell> {/* OtherTaxPct */}
                    <TableCell sx={{ backgroundColor: '#ffffcc', borderRight: '1px solid #e0e0e0', borderBottom: '1px solid #e0e0e0', whiteSpace: 'pre-line' }}>
                      {(() => {
                        const msg =
                          (ligne.commercialMessage && String(ligne.commercialMessage).trim()) ||
                          (ligne.commercial_message && String(ligne.commercial_message).trim());
                        return msg && msg.length > 0 ? msg : 'N/A';
                      })()}
                    </TableCell> {/* Message commercial */}
                    <TableCell>{ligne.foreignCurrency || ligne.foreign_currency || 'N/A'}</TableCell> {/* DEVISES */}
                    <TableCell align="right">
                      {(() => {
                        const rate = ligne.foreignCurrencyRate ?? ligne.foreign_currency_rate;
                        if (rate === undefined || rate === null || rate === '') return '0';
                        return Number(rate).toLocaleString('fr-FR', { minimumFractionDigits: 0 });
                      })()}
                    </TableCell> {/* Taux de change */}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      </Box>
    </Paper>
  );
}

function MainApp() {
  const { user, logout, hasPermission, isAdmin } = useAuth();
  const { notify, confirm } = useNotify();
  const canFetchInitialForAvoir = hasPermission('avoir.fetch_initial');
  // Droits d'accès aux écrans métier (RBAC).
  const canDownloadInvoice = hasPermission('invoice.download');
  const canViewDownloaded = hasPermission('downloaded.view');
  const canViewSent = hasPermission('sent.view');
  const canSendInvoice = hasPermission('invoice.send');
  const canSendRefund = hasPermission('refund.send');
  const canDeleteInvoice = hasPermission('invoice.delete');
  const hasAnyBlRole = hasPermission('bl.view')
    || hasPermission('bl.validate_logistique')
    || hasPermission('bl.validate_commercial')
    || hasPermission('bl.validate_comptabilite');
  const [error, setError] = useState('');
  const [errorModalOpen, setErrorModalOpen] = useState(false);
  const [errorModalMessage, setErrorModalMessage] = useState('');
  // Version: 2025-02-18-12-20 - Fix modal erreurs templates
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
  const [invoiceToSend, setInvoiceToSend] = useState(null);
  const [numero, setNumero] = useState('');
  const [loading, setLoading] = useState(false);
  const [facture, setFacture] = useState(null);
  // État pour stocker les informations supplémentaires des factures
  const [invoiceDetails, setInvoiceDetails] = useState({});
  // État pour le modal de réponse API
  const [apiResponseModal, setApiResponseModal] = useState({ open: false, data: null, invoiceType: 'invoice' });
  // const [apiResponseFneInvoice, setApiResponseFneInvoice] = useState(null);
  // État pour gérer l'édition inline
  const [editingCell, setEditingCell] = useState(null);
  const [editValue, setEditValue] = useState('');
  const [fieldModifications, setFieldModifications] = useState({});
  const [pendingModifications, setPendingModifications] = useState({});
  const [isDetailViewMode, setIsDetailViewMode] = useState(false);
  const [validationErrors, setValidationErrors] = useState({});

  // États pour la saisie manuelle FNE
  const [manualFneOpen, setManualFneOpen] = useState(false);
  const [manualFneData, setManualFneData] = useState({ numeroFacture: '', fneReference: '', existingFne: null });
  const [manualFneLoading, setManualFneLoading] = useState(false);
  const [confirmManualEntryDialogOpen, setConfirmManualEntryDialogOpen] = useState(false);

  // États pour la gestion des Points de Vente
  const [allPointsOfSale, setAllPointsOfSale] = useState([]);
  const [posDialogOpen, setPosDialogOpen] = useState(false);
  const [posLoading, setPosLoading] = useState(false);
  const [posSelections, setPosSelections] = useState({});

  // État pour le modal de choix du format de téléchargement
  const [downloadFormatDialogOpen, setDownloadFormatDialogOpen] = useState(false);

  // Fonction pour gérer le début de l'édition
  const handleEditStart = (fieldName, value, lineNumber = 0) => {
    const cellKey = `${fieldName}_${lineNumber}`;
    console.log('MainApp handleEditStart called:', cellKey, value);
    setEditingCell(cellKey);
    setEditValue(value);
  };

  // Fonction pour appliquer toutes les modifications en attente
  const applyAllModifications = async () => {
    const modifications = Object.values(pendingModifications);
    if (modifications.length === 0) {
      notify('Aucune modification à appliquer');
      return;
    }

    try {
      // Appeler l'API pour chaque modification
      for (const mod of modifications) {
        const response = await fetch(API_ENDPOINTS.INLINE_FIELDS.UPDATE_FIELD, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('token')}`
          },
          body: JSON.stringify({
            invoiceNumber: mod.invoiceNumber,
            fieldName: mod.fieldName,
            newValue: mod.newValue,
            oldValue: mod.oldValue,
            applyToAll: true,
            lineNumber: 0,
            userId: user?.username || 'anonymous',
            userName: user?.name || user?.username || 'Anonymous'
          })
        });

        const result = await response.json();
        if (!result.success) {
          throw new Error(`Erreur pour ${mod.fieldName}: ${result.error}`);
        }
      }

      // Vider les modifications en attente
      setPendingModifications({});
      notify(`${modifications.length} modification(s) appliquée(s) avec succès`);

    } catch (error) {
      console.error('Erreur lors de l\'application des modifications:', error);
      notify('Erreur lors de l\'application: ' + error.message);
    }
  };

  // Fonction pour obtenir la valeur modifiée d'un champ
  const getModifiedValue = (invoiceNumber, fieldName, defaultValue) => {
    const key = `${invoiceNumber}_${fieldName}`;
    return fieldModifications[key] || defaultValue;
  };

  // Fonction pour gérer l'édition inline
  const handleInlineEdit = async (fieldName, invoiceNumber, lineNumber, newValue) => {
    try {
      const oldValue = getModifiedValue(invoiceNumber, fieldName,
        fieldName === 'ClientEmail' ? '' :
          fieldName === 'ClientPhone' ? '' :
            fieldName === 'Template' ? 'B2B' :
              fieldName === 'PaymentMethod' ? 'deferred' :
                fieldName === 'InvoiceType' ? 'sale' :
                  fieldName === 'isRne' ? 'False' :
                    fieldName === 'PointOfSale' ? 'NPG_SIEGE_FACTURATION' : ''
      );

      // Appeler l'API pour sauvegarder la modification
      const response = await fetch(API_ENDPOINTS.INLINE_FIELDS.UPDATE_FIELD, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          invoiceNumber,
          fieldName,
          newValue,
          oldValue,
          applyToAll: true, // Appliquer à toutes les lignes par défaut
          lineNumber,
          userId: user?.username || 'anonymous',
          userName: user?.name || user?.username || 'Anonymous'
        })
      });

      const result = await response.json();

      if (result.success) {
        // Mettre à jour l'état local
        const key = `${invoiceNumber}_${fieldName}`;
        setFieldModifications(prev => ({
          ...prev,
          [key]: newValue
        }));

        // Mettre à jour invoiceDetails si c'est le point de vente
        if (fieldName === 'PointOfSale') {
          // Trouver l'ID de la facture correspondant à ce numéro
          const invoiceId = Object.keys(invoiceDetails).find(id => invoiceDetails[id].numeroFacture === invoiceNumber);
          if (invoiceId) {
            setInvoiceDetails(prev => ({
              ...prev,
              [invoiceId]: {
                ...prev[invoiceId],
                pointOfSale: newValue
              }
            }));
          }
        }

        console.log('Modification inline enregistrée:', result);

        // Afficher une notification de succès
        notify('Champ mis à jour avec succès');
      } else {
        console.error('Erreur lors de la mise à jour inline:', result.error);
        notify('Erreur lors de la mise à jour: ' + result.error);
      }
    } catch (error) {
      console.error('Erreur lors de l\'appel API pour l\'édition inline:', error);
      notify('Erreur lors de la mise à jour du champ');
    }
  };

  // Charger les modifications existantes au chargement d'une facture
  useEffect(() => {
    if (facture && facture.data && facture.data.data && facture.data.data.length > 0) {
      const invoiceNumber = facture.data.data[0].numeroFacture;
      if (invoiceNumber) {
        loadInvoiceModifications(invoiceNumber);
      }
    }
  }, [facture]);

  // Fonction pour charger les modifications existantes d'une facture
  const loadInvoiceModifications = async (invoiceNumber) => {
    try {
      const response = await fetch(API_ENDPOINTS.INLINE_FIELDS.BY_INVOICE(invoiceNumber), {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });

      const result = await response.json();

      if (result.success && result.data) {
        // Mettre à jour l'état local avec les dernières modifications
        const modifications = {};
        result.data.forEach(mod => {
          const key = `${mod.invoice_number}_${mod.field_name}`;
          modifications[key] = mod.new_value;
        });
        setFieldModifications(prev => ({ ...prev, ...modifications }));
        console.log('Modifications chargées:', modifications);
      }
    } catch (error) {
      console.error('Erreur lors du chargement des modifications:', error);
    }
  };

  // Fonction pour envoyer une facture
  // Fonction pour envoyer une facture
  const handleSendInvoice = async (invoice) => {
    // --- VALIDATION DES CHAMPS REQUIS ---
    // Récupérer le numéro de facture (logique robuste identique à performSendInvoice)
    let invoiceNumber = invoice.numero ||
      invoice.data?.[0]?.data?.[0]?.numeroFacture ||
      invoice.data?.[0]?.success?.data?.[0]?.numeroFacture ||
      invoice.data?.[0]?.VBELN;

    // Extraction de l'objet contenant les données (pour les valeurs par défaut)
    let rawItem = {};
    if (Array.isArray(invoice.data)) {
      const first = invoice.data[0];
      if (first?.data && Array.isArray(first.data)) rawItem = first.data[0];
      else rawItem = first || {};
    } else if (invoice.data?.data && Array.isArray(invoice.data.data)) {
      rawItem = invoice.data.data[0];
    } else {
      rawItem = invoice.data || {};
    }

    // Helper pour obtenir la valeur "effective" (modifiée ou originale)
    const getEffectiveVal = (field, fallbackRaw) => {
      const key = `${invoiceNumber}_${field}`;
      const mod = fieldModifications[key];
      // Si modification existe (même vide), on la prend. Sinon on prend la valeur brute.
      return mod !== undefined ? mod : (fallbackRaw || '');
    };

    // Liste des champs à valider
    const email = getEffectiveVal('ClientEmail', rawItem.clientEmail || rawItem.client_email || rawItem.ClientEmail);
    const phone = getEffectiveVal('ClientPhone', rawItem.clientPhone || rawItem.client_phone || rawItem.ClientPhone);
    // Note: Template, PaymentMethod, PointOfSale ont souvent des valeurs par défaut dans performSendInvoice,
    // mais si le backend/user exige qu'ils soient visiblement remplis, on les check.
    // L'utilisateur a demandé "remplir les champs manquants", on se concentre sur les plus critiques.

    const paymentMethod = getEffectiveVal('PaymentMethod', rawItem.PaymentMethod || rawItem.paymentMethod || rawItem.payment_method);

    const missing = [];
    const newValidationErrors = {};

    if (!String(email).trim()) {
      missing.push('Email Client');
      newValidationErrors[`${invoiceNumber}_ClientEmail`] = true;
    }
    if (!String(phone).trim()) {
      missing.push('Téléphone Client');
      newValidationErrors[`${invoiceNumber}_ClientPhone`] = true;
    }
    if (!String(paymentMethod).trim()) {
      missing.push('Méthode de Paiement');
      newValidationErrors[`${invoiceNumber}_PaymentMethod`] = true;
    }

    setValidationErrors(newValidationErrors);

    /* 
    // Désactivation temporaire des champs obligatoires
    if (missing.length > 0) {
      setErrorModalMessage(
        `Veuillez remplir les champs manquants (marqués en rouge) de la facture avant d'envoyer :\n\n` +
        missing.map(f => `• ${f}`).join('\n') +
        `\n\nDouble-cliquez sur les champs avec une icône d'erreur pour les compléter.`
      );
      setErrorModalOpen(true);
      return;
    }
    */

    // Réinitialiser les erreurs si tout est OK
    setValidationErrors({});
    // --- FIN VALIDATION ---

    setInvoiceToSend(invoice);
    setConfirmDialogOpen(true);
  };

  // Fonction pour confirmer l'envoi de la facture
  // Fonction extraite pour envoyer une facture (réutilisable)
  const performSendInvoice = async (invoice, silent = false) => {
    if (!invoice) return { success: false, error: 'Facture invalide' };

    // Bloquer l'envoi des factures déjà marquées FNE dans SAP (ZBAPI_INFO_FNE_FACTURES / TEXT1).
    if (invoice.fne_marked) {
      if (!silent) setError('Cette facture est déjà marquée FNE dans SAP — envoi bloqué.');
      return { success: false, error: 'FNE_MARKED' };
    }

    try {
      if (!silent) setLoading(true);

      // Vérifier localement si la facture a déjà été envoyée
      const isSentLocally = sentInvoices.some(sentInvoice =>
        sentInvoice.numero_facture === invoice.numero ||
        sentInvoice.numero_facture === invoice.numeroFacture ||
        sentInvoice.numero_facture === (invoice.data?.[0]?.data?.[0]?.numeroFacture) ||
        sentInvoice.numero_facture === (invoice.data?.[0]?.success?.data?.[0]?.numeroFacture)
      );

      if (isSentLocally) {
        if (!silent) setError('Impossible d\'envoyer une facture qui a déjà été envoyée');
        return { success: false, error: 'Déjà envoyée' };
      }

      console.log('=== STRUCTURE COMPLÈTE DE LA FACTURE POUR ENVOI ===');
      // console.log('invoice:', JSON.stringify(invoice, null, 2));

      // Récupérer le numéro de facture depuis plusieurs sources possibles
      let invoiceNumber = invoice.data?.[0]?.data?.[0]?.numeroFacture ||  // Priorité aux données sauvegardées
        invoice.data?.[0]?.success?.data?.[0]?.numeroFacture ||
        invoice.numero ||
        invoice.data?.[0]?.VBELN ||
        invoice.data?.[0]?.data?.[0]?.VBELN;

      if (!invoiceNumber || invoiceNumber === 'N/A') {
        if (!silent) setError('Numéro de facture non trouvé');
        return { success: false, error: 'Numéro de facture non trouvé' };
      }

      // Normaliser la structure des données de facture pour gérer les cas SAP et template importé
      let rawInvoiceData;
      if (Array.isArray(invoice.data)) {
        rawInvoiceData = invoice.data;
      } else if (Array.isArray(invoice.data?.data)) {
        // Cas des factures importées: { success: true, data: [templateData] }
        rawInvoiceData = invoice.data.data;
      } else if (invoice.data) {
        rawInvoiceData = [invoice.data];
      } else {
        rawInvoiceData = [];
      }

      // 1. Extraction robuste des articles (SAP vs Import)
      let articles = rawInvoiceData.filter(item => item && (item.designation || item.ARKTX));

      if (articles.length === 0 && rawInvoiceData.length > 0) {
        // Tentative d'extraction depuis la structure SAP XVBRP
        const first = rawInvoiceData[0];
        const xvbrp = first?.XVBRP || first?.data?.XVBRP || (Array.isArray(first?.data) ? first.data[0]?.XVBRP : null);

        if (Array.isArray(xvbrp) && xvbrp.length > 0) {
          articles = xvbrp.map(item => ({
            ...item,
            designation: item.ARKTX || item.designation || 'Article SAP',
            reference: item.MATNR || item.reference || '',
            quantite: parseFloat(item.FKIMG) || 0,
            unite: item.VRKME || item.MEINS || '',
            PU_HT: (parseFloat(item.NETPR) || 0) * 10, // Facteur SAP habituel
            TVA: 0, // Ne pas forcer 18%, utiliser la valeur du template si disponible
            source: 'sap'
          }));
        }
      }

      const invoiceData = articles.length > 0
        ? articles
        : (rawInvoiceData.length > 0 ? [rawInvoiceData[0]] : []);

      if (invoiceData.length === 0) {
        if (!silent) setError('Aucune ligne d\'article trouvée pour cette facture');
        return { success: false, error: 'Aucune ligne d\'article' };
      }

      // Normaliser les données (SAP et factures importées) pour avoir un schéma commun
      // Normaliser les données (commenté car inutilisé pour le moment pour éviter le warning linter)
      // const normalizedInvoiceData = invoiceData.map(item => ({ ... }));


      // 2. Enrichissement des données client (Email/Téléphone)
      const firstItem = invoiceData[0] || {};
      let clientEmail = firstItem.clientEmail || firstItem.client_email || firstItem.ClientEmail || '';
      let clientPhone = firstItem.clientPhone || firstItem.client_phone || firstItem.ClientPhone || '';
      const kunnr = firstItem.kunnr || firstItem.KUNNR || (Array.isArray(firstItem.XVBPA) ? firstItem.XVBPA.find(p => p.PARVW === 'AG')?.KUNNR : null);

      // Si données manquantes et KUNNR présent, on tente une récupération API
      if (kunnr && (!clientEmail || !clientPhone)) {
        console.log(`Données client manquantes pour ${invoiceNumber}, tentative de récupération pour KUNNR ${kunnr}...`);
        try {
          const resAddr = await axios.get(`${API_ENDPOINTS.SAP.CLIENT_ADDRESS}/${kunnr}`);
          if (resAddr.data && resAddr.data.success && resAddr.data.data) {
            const addr = Array.isArray(resAddr.data.data) ? resAddr.data.data[0] : resAddr.data.data;
            if (addr.SMTP_ADDR) clientEmail = addr.SMTP_ADDR;
            if (addr.TELF1) clientPhone = addr.TELF1;
            console.log(`Données récupérées: Email=${clientEmail}, Phone=${clientPhone}`);
          }
        } catch (err) {
          console.warn(`Impossible de récupérer l'adresse client pour ${kunnr}:`, err.message);
        }
      }

      // 3. Application des modifications inline et des données enrichies
      const currentInvoiceNumber = invoiceData[0]?.numeroFacture || invoiceNumber;
      const modifiedInvoiceData = invoiceData.map(item => {
        // Déterminer le PointOfSale
        const defaultPos = selectedPos || 'NPG_SIEGE_FACTURATION';
        const itemPos = item.pointOfSale ?? item.point_of_sale ?? defaultPos;

        const rawPointOfSale = getModifiedValue(
          currentInvoiceNumber,
          'PointOfSale',
          itemPos
        );
        let safePointOfSale = rawPointOfSale || itemPos || defaultPos || 'NPG_SIEGE_FACTURATION';

        return {
          ...item,
          clientEmail: getModifiedValue(currentInvoiceNumber, 'ClientEmail', clientEmail || item.clientEmail || ''),
          clientPhone: getModifiedValue(currentInvoiceNumber, 'ClientPhone', clientPhone || item.clientPhone || ''),
          template: getModifiedValue(currentInvoiceNumber, 'Template', item.Template ?? item.template ?? 'B2B'),
          paymentMethod: getModifiedValue(currentInvoiceNumber, 'PaymentMethod', item.PaymentMethod ?? item.payment_method ?? 'deferred'),
          invoiceType: getModifiedValue(currentInvoiceNumber, 'InvoiceType', item.InvoiceType ?? item.invoice_type ?? 'sale'),
          isRne: getModifiedValue(currentInvoiceNumber, 'isRne', item.isRne ?? item.is_rne ?? 'False'),
          pointOfSale: safePointOfSale,
          foreignCurrency: item.foreign_currency || item.foreignCurrency || "",
          foreignCurrencyRate: item.foreign_currency_rate || item.foreignCurrencyRate || 0
        };
      });

      // Formater les données au format JSON attendu
      const formattedInvoiceData = {
        invoiceType: modifiedInvoiceData[0]?.invoiceType || "sale",
        paymentMethod: modifiedInvoiceData[0]?.paymentMethod || "deferred",
        template: modifiedInvoiceData[0]?.template || "B2B",
        clientNcc: modifiedInvoiceData[0]?.clientNCC ?? modifiedInvoiceData[0]?.client_ncc ?? "",
        clientCompanyName: modifiedInvoiceData[0]?.nomClient || invoice.client || invoice.nomClient || invoice.data?.[0]?.nomClient || "",
        clientPhone: modifiedInvoiceData[0]?.clientPhone || "",
        clientEmail: modifiedInvoiceData[0]?.clientEmail || "",
        pointOfSale: modifiedInvoiceData[0]?.pointOfSale || "NPG_SIEGE_FACTURATION",
        clientSellerName: modifiedInvoiceData[0]?.sellerName || "",
        establishment: "Nouvelle Parfumerie Gandour",
        commercialMessage: (
          modifiedInvoiceData[0]?.commercialMessage ||
          modifiedInvoiceData[0]?.commercial_message ||
          ""
        ),
        foreignCurrency: modifiedInvoiceData[0]?.foreignCurrency || "",
        foreignCurrencyRate: modifiedInvoiceData[0]?.foreignCurrencyRate || 0,
        items: modifiedInvoiceData.map(item => {
          const tvaRate = Number(String(item.TVA || item.tva || 0).replace(/[\s\u00A0]/g, '').replace(',', '.')) || 0;
          return {
            taxes: [tvaRate === 0 ? "TVAC" : (tvaRate === 18 ? "TVA" : "TVAC")],
            // Pour les lignes, on n'envoie PAS l'AIRSI si on veut l'envoyer en global
            customTaxes: [],
            reference: item.reference || "",
            description: item.designation || "",
            quantity: item.quantite ?? item.quantity ?? 0,
            amount: (() => {
              const raw = Number(String(item.PU_HT ?? item.pu_ht ?? item.prixUnitaireHT ?? 0).replace(',', '.')) || 0;
              // Pour SAP: division par 10 car le backend multiplie déjà par 1000 pour KAR/ST et par 10 pour le reste
              // Pour les templates: on garde la valeur brute
              return item.source === 'template_import' ? raw : (raw / 10);
            })(),
            discount: item.Rem_Pct ?? item.rem_pct ?? item.remisePct ?? 0,
            measurementUnit: item.unite && item.unite.toUpperCase() === 'KAR' ? 'CRN' : (item.unite && item.unite.toUpperCase() === 'ST' ? 'pce' : (item.unite || 'pce'))
          };
        }),
        customTaxes: (() => {
          const withTax = modifiedInvoiceData.find(it => {
            const pct = it.OtherTaxPct ?? it.other_tax_pct ?? it.otherTaxPct;
            return pct && String(pct) !== '0' && String(pct) !== '0.00';
          });
          if (!withTax) return [];
          const pct = withTax.OtherTaxPct ?? withTax.other_tax_pct ?? withTax.otherTaxPct;
          return [{
            name: "AIRSI",
            amount: parseNumber(pct || 0)
          }];
        })(),
        discount: 0
      };

      console.log('=== DONNÉES FACTURE FORMATÉES POUR ENVOI ===');
      console.log('JSON à envoyer:', JSON.stringify(formattedInvoiceData, null, 2));

      // ─── Validation des champs obligatoires FNE (doc officielle DGI Mai 2025) ───
      // Toujours obligatoires : clientCompanyName, clientPhone, clientEmail, pointOfSale, establishment
      // Obligatoire uniquement si template === 'B2B' : clientNcc
      // EXCEPTION : pour les factures EXPORT en B2F (clients internationaux),
      // l'email n'est pas exigé (pas toujours disponible côté client export).
      const isBlank = (v) => v === null || v === undefined || String(v).trim() === '';
      const isB2FExport =
        String(formattedInvoiceData.template).toUpperCase() === 'B2F' &&
        (
          formattedInvoiceData.pointOfSale === 'FACTURE_EXPORT' ||
          selectedPos === 'FACTURE_EXPORT' ||
          invoice?.invoice_type_code === 'FACTURE_EXPORT' ||
          invoice?.data?.[0]?.import_view === 'FACTURE_EXPORT'
        );
      const missing = [];
      if (isBlank(formattedInvoiceData.clientCompanyName)) missing.push('Nom client (clientCompanyName)');
      if (isBlank(formattedInvoiceData.clientPhone))       missing.push('Téléphone client (clientPhone)');
      if (!isB2FExport && isBlank(formattedInvoiceData.clientEmail)) {
        missing.push('Email client (clientEmail)');
      }
      if (isBlank(formattedInvoiceData.pointOfSale))       missing.push('Point de vente (pointOfSale)');
      if (isBlank(formattedInvoiceData.establishment))     missing.push('Établissement (establishment)');
      if (formattedInvoiceData.template === 'B2B' && isBlank(formattedInvoiceData.clientNcc)) {
        missing.push('NCC client (obligatoire pour B2B)');
      }
      if (missing.length > 0) {
        const msg = `Champs obligatoires manquants : ${missing.join(', ')}. Complète-les via la fiche facture avant l'envoi.`;
        if (!silent) setError(msg);
        console.warn('[Validation FNE]', msg);
        return { success: false, error: msg, code: 'MISSING_REQUIRED_FIELDS', details: missing };
      }

      // Vérification serveur anti-double envoi AVANT l'appel à l'API FNE
      try {
        const checkRes = await fetch(API_ENDPOINTS.LOGS.CHECK_SENT(invoiceNumber));
        if (checkRes.ok) {
          const checkData = await checkRes.json();
          if (checkData.alreadySent) {
            const msg = `Cette facture a déjà été envoyée le ${new Date(checkData.sentOn).toLocaleString('fr-FR')} par ${checkData.sentBy}. Un double envoi n'est pas autorisé.`;
            if (!silent) setError(msg);
            return { success: false, error: 'Déjà envoyée (vérification serveur)' };
          }
        }
      } catch (checkError) {
        console.warn('Vérification anti-double envoi échouée, poursuite de l\'envoi:', checkError);
      }

      // Détecter si c'est un avoir (refund) via les données sauvegardées
      const avoirResEntry = rawInvoiceData.find(item => item?._avoirResolution);
      const avoirResolution = avoirResEntry?._avoirResolution;

      if (avoirResolution && avoirResolution.refundPayload) {
        console.log('[Avoir] Envoi en mode refund FNE pour avoir:', invoiceNumber);
        try {
          const refundResp = await fetch(API_ENDPOINTS.FNE_INVOICES.REFUND, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${localStorage.getItem('token')}`
            },
            body: JSON.stringify({
              invoiceId: avoirResolution.refundPayload.invoiceId,
              items: avoirResolution.refundPayload.items,
              username: user?.username,
              numeroAvoir: avoirResolution.avoir?.numero || invoiceNumber,
              clientName: firstItem?.nomClient || invoice.client || '',
              montantAvoir: avoirResolution.avoir?.montant || 0,
              devise: avoirResolution.avoir?.devise || 'XOF'
            })
          });

          const refundResult = await refundResp.json();

          if (refundResult.success) {
            setSendConfirmation({
              open: true,
              invoiceNumber: `Avoir ${invoiceNumber}`,
              response: {
                ...refundResult.data,
                invoiceType: 'refund'
              }
            });
            setSentInvoices(prev => [{
              numero_facture: invoiceNumber,
              send_date: new Date().toISOString(),
              client_name: firstItem?.nomClient || invoice.client || '',
              username: user?.username,
              status: 'success',
              invoice_type: 'refund'
            }, ...prev]);
            return { success: true, result: refundResult };
          } else {
            if (!silent) setError(`Erreur FNE Avoir: ${refundResult.error || refundResult.details?.message || 'Erreur inconnue'}`);
            return { success: false, error: refundResult.error };
          }
        } catch (refundError) {
          console.error('Erreur envoi refund FNE:', refundError);
          if (!silent) setError(`Erreur lors de l'envoi de l'avoir: ${refundError.message}`);
          return { success: false, error: refundError.message };
        } finally {
          if (!silent) setLoading(false);
        }
      }

      // Appeler l'API externe pour envoyer la facture (flux normal)
      let response;
      let fneDurationMs = null;
      const fneStart = Date.now();
      if (!silent) setFneSending({ numeroFacture: invoiceNumber, startedAt: fneStart });
      try {
        response = await fetch('http://54.247.95.108/ws/external/invoices/sign', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer xOUe2t01VwGqGgA2VG6yStihUmmg30Jm'
          },
          body: JSON.stringify(formattedInvoiceData)
        });
        fneDurationMs = Date.now() - fneStart;
      } catch (networkError) {
        fneDurationMs = Date.now() - fneStart;
        console.error('Erreur réseau lors de l\'appel à l\'API de signature:', networkError);
        if (!silent) setError('Erreur de connexion au serveur de signature. Veuillez vérifier votre connexion internet et réessayer.');
        if (!silent) setFneSending(null);
        return { success: false, error: 'Erreur réseau', details: networkError.message, fneDurationMs };
      } finally {
        if (!silent) setFneSending(null);
      }

      // Vérifier si la réponse est OK (statut 2xx)
      if (response.ok) {
        const result = await response.json();
        console.log('Facture envoyée:', result);

        // Enregistrer l'action d'envoi dans les logs
        try {
          await fetch(API_ENDPOINTS.LOGS.SEND, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              username: user?.username,
              numeroFacture: invoiceNumber,
              apiResponse: result.response || result,
              fneResponseTimeMs: fneDurationMs
            })
          });
        } catch (logError) {
          console.error('Erreur lors de l\'enregistrement du log d\'envoi:', logError);
        }

        // Extraire uniquement les champs nécessaires de la réponse
        const simplifiedResponse = {
          ncc: result?.ncc || result?.data?.ncc || result?.response?.ncc,
          reference: result?.reference || result?.data?.reference || result?.response?.reference,
          token: result?.token || result?.data?.token || result?.response?.token
        };

        // Afficher le modal de confirmation avec la réponse simplifiée
        setSendConfirmation({
          open: true,
          response: simplifiedResponse,
          invoiceNumber: invoiceNumber
        });

        // Optimistic update of sentInvoices to avoid waiting for background reload
        const newSentInvoice = {
          numero_facture: invoiceNumber,
          send_date: new Date().toISOString(),
          client_name: formattedInvoiceData.clientCompanyName,
          username: user?.username,
          status: 'success',
          point_of_sale: formattedInvoiceData.pointOfSale,
          total_ttc: formattedInvoiceData.totalTTC,
          reference: simplifiedResponse.reference
        };
        setSentInvoices(prev => [newSentInvoice, ...prev]);

        // Déclencher la notification de modification
        try {
          await fetch(API_ENDPOINTS.NOTIFICATIONS.TRIGGER, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${localStorage.getItem('token')}`
            },
            body: JSON.stringify({
              invoiceNumber,
              clientName: formattedInvoiceData.clientCompanyName
            })
          });
        } catch (notifError) {
          console.error('Erreur notification:', notifError);
        }

        return { success: true, result };

      } else {
        let errorResponse;
        try {
          // Tenter de parser la réponse d'erreur
          try {
            errorResponse = await response.json();
          } catch (e) {
            errorResponse = { message: await response.text() };
          }

          console.error('Erreur détaillée de l\'API de signature:', {
            status: response.status,
            statusText: response.statusText,
            error: errorResponse
          });

          // La FNE imbrique souvent l'erreur réelle sous `error` :
          //   { error: { error: "bad_request",
          //              errors: { pointOfSale: { invalid: "Point of sale is invalid" } },
          //              message: "Bad Request Exception" }, ... }
          // On déballe ce niveau pour récupérer les vraies erreurs de validation.
          const apiErr = (errorResponse && typeof errorResponse.error === 'object' && errorResponse.error)
            ? errorResponse.error
            : (errorResponse || {});

          // Aplatir les erreurs de validation par champ (ex: errors.pointOfSale.invalid)
          const buildValidationDetails = (errs) => {
            if (!errs || typeof errs !== 'object') return '';
            const out = [];
            for (const field of Object.keys(errs)) {
              const rules = errs[field];
              if (typeof rules === 'string') {
                out.push(`${field}: ${rules}`);
              } else if (rules && typeof rules === 'object') {
                for (const ruleName of Object.keys(rules)) {
                  const val = rules[ruleName];
                  out.push(typeof val === 'string' ? val : `${field}.${ruleName}`);
                }
              }
            }
            return out.join(' | ');
          };

          const validationDetails = buildValidationDetails(apiErr.errors || errorResponse.errors);
          // Message le plus précis disponible :
          // détails de validation > message imbriqué > message > statusText.
          const detailMessage = validationDetails
            || apiErr.message
            || errorResponse.message
            || response.statusText
            || 'Erreur interne du serveur de signature';

          // ENREGISTRER L'ÉCHEC dans les logs (avec le message précis) pour qu'il s'affiche dans la liste
          try {
            await fetch(API_ENDPOINTS.LOGS.SEND, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                username: user?.username,
                numeroFacture: invoiceNumber,
                apiResponse: {
                  success: false,
                  status: response.status,
                  error: detailMessage
                },
                fneResponseTimeMs: fneDurationMs
              })
            });
          } catch (logError) {
            console.error('Erreur lors de l\'enregistrement du log d\'échec d\'envoi:', logError);
          }

          // Message d'erreur pour l'utilisateur
          let userMessage = `Erreur lors de la signature de la facture (${response.status})`;
          if (validationDetails) {
            userMessage += `: ${validationDetails}`;
          } else if (response.status === 500) {
            userMessage = 'Une erreur technique est survenue lors de la signature de la facture. Veuillez réessayer plus tard ou contacter le support.';
          } else if (detailMessage) {
            userMessage += `: ${detailMessage}`;
          }

          if (!silent) setError(userMessage);
          return {
            success: false,
            error: detailMessage || 'Erreur inconnue',
            status: response.status,
            details: errorResponse
          };

        } catch (parseError) {
          // En cas d'échec de parsing de la réponse d'erreur
          const errorText = await response.text();
          console.error('Erreur lors du parsing de la réponse d\'erreur:', parseError, 'Réponse brute:', errorText);

          let userMessage = `Erreur lors de la signature de la facture (${response.status} - ${response.statusText})`;
          if (response.status === 500) {
            userMessage = 'Le serveur a rencontré une erreur interne. Veuillez réessayer plus tard ou contacter le support si le problème persiste.';
            // Afficher le modal d'erreur pour les erreurs 500 (cas où le parsing de la réponse échoue)
            setErrorModalMessage('Impossible d\'envoyer la facture. Le serveur a rencontré une erreur interne.');
            setErrorModalOpen(true);
          }

          if (!silent) setError(userMessage);
          return {
            success: false,
            error: 'Erreur de traitement de la réponse du serveur',
            status: response.status,
            details: errorText
          };
        }
      }
    } catch (error) {
      console.error('Erreur lors de l\'envoi de la facture:', error);
      if (!silent) setError('Erreur lors de l\'envoi de la facture');
      return { success: false, error: error.message };
    } finally {
      if (!silent) setLoading(false);
    }
  };

  // Fonction wrapper pour confirmer l'envoi (Legacy)
  const confirmSendInvoice = async () => {
    setConfirmDialogOpen(false);
    setLoading(true);
    try {
      const result = await performSendInvoice(invoiceToSend);
      if (result.success) {
        await loadSentInvoices();
        setInvoiceToSend(null);
      } else {
        // Afficher un message d'erreur à l'utilisateur
        const errorMessage = result.error || 'Erreur inconnue lors de l\'envoi de la facture';
        setErrorModalMessage(`Échec de l'envoi de la facture : ${errorMessage}`);
        setErrorModalOpen(true);
      }
    } catch (error) {
      console.error('Erreur lors de l\'envoi de la facture :', error);
      setErrorModalMessage('Une erreur est survenue lors de l\'envoi de la facture. Veuillez réessayer.');
      setErrorModalOpen(true);
    } finally {
      setLoading(false);
    }
  };

  // Fonction pour ouvrir le modal d'avoir
  const handleOpenRefundModal = async (invoice) => {
    // Journalisation de l'ouverture de la modale d'avoir
    console.log('[Avoir] Ouverture de la modale d\'avoir pour la facture :', {
      invoiceNumber: invoice.numero || invoice.numero_facture,
      fneInvoiceId: invoice.fne_invoice_id,
      client: invoice.client_name || invoice.nom_client,
      montant: invoice.montant || invoice.amount,
      timestamp: new Date().toISOString()
    });

    setError(''); // évite qu'un message d'erreur résiduel reste affiché DERRIÈRE le modal d'avoir
    setRefundInvoice(invoice);
    setRefundModalOpen(true);
    setFneInvoiceData(null);
    setRefundQuantities({});
    setRefundFullInvoice(false);
    setIsLoadingFneInvoice(true);

    try {
      // Récupérer le numéro de facture
      const invoiceNumber = invoice.numero ||
        invoice.numeroFacture ||
        invoice.numero_facture ||
        invoice.data?.[0]?.data?.[0]?.numeroFacture ||
        invoice.data?.[0]?.success?.data?.[0]?.numeroFacture;

      if (!invoiceNumber) {
        console.error('[Avoir] Numéro de facture non trouvé dans l\'objet invoice :', invoice);
        notify('Numéro de facture non trouvé');
        setIsLoadingFneInvoice(false);
        return;
      }

      // Récupérer les détails de la facture FNE.
      // encodeURIComponent : indispensable car le numéro peut contenir un "/" (ex. Succursale "P26/81K"),
      // sinon l'URL casse la route backend et renvoie une 404 HTML.
      const response = await fetch(`${API_ENDPOINTS.FNE_INVOICES.BY_SAP_NUMBER}/${encodeURIComponent(invoiceNumber)}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });

      const result = await response.json();

      if (result.success && result.data) {
        setFneInvoiceData(result.data);
        // Initialiser les quantités de remboursement à 0 pour chaque article
        const quantities = {};
        if (result.data.items && result.data.items.length > 0) {
          result.data.items.forEach(item => {
            quantities[item.fne_item_id] = 0;
          });
        }
        setRefundQuantities(quantities);
      } else {
        notify('Facture FNE non trouvée. Assurez-vous que la facture a été envoyée avec succès.');
      }
    } catch (error) {
      console.error('Erreur lors de la récupération de la facture FNE:', error);
      notify('Erreur lors de la récupération de la facture FNE');
    } finally {
      setIsLoadingFneInvoice(false);
    }
  };

  // Fonction pour fermer le modal d'avoir
  const handleCloseRefundModal = () => {
    setRefundModalOpen(false);
    setRefundInvoice(null);
    setFneInvoiceData(null);
    setRefundQuantities({});
    setRefundFullInvoice(false);
  };

  // Avoir total : coché => remet pour chaque article la même quantité que la facture ; décoché => remet tout à 0
  const handleToggleFullRefund = (checked) => {
    setRefundFullInvoice(checked);
    const quantities = {};
    if (fneInvoiceData?.items?.length > 0) {
      fneInvoiceData.items.forEach(item => {
        quantities[item.fne_item_id] = checked ? (parseInt(item.quantity, 10) || 0) : 0;
      });
    }
    setRefundQuantities(quantities);
  };

  // Fonction pour mettre à jour la quantité de remboursement
  const handleRefundQuantityChange = (itemId, quantity) => {
    setRefundFullInvoice(false); // une saisie manuelle => ce n'est plus forcément un avoir total
    setRefundQuantities(prev => ({
      ...prev,
      [itemId]: parseInt(quantity, 10) || 0
    }));
  };

  // Fonction pour préparer l'envoi de l'avoir (Validation et Confirmation)
  const handleSendRefund = async () => {
    if (!fneInvoiceData || !fneInvoiceData.fne_invoice_id) {
      setErrorModalMessage('Données de facture FNE invalides');
      setErrorModalOpen(true);
      return;
    }

    // Créer un map des quantités disponibles par item ID
    const availableQuantities = {};
    if (fneInvoiceData.items && fneInvoiceData.items.length > 0) {
      fneInvoiceData.items.forEach(item => {
        availableQuantities[item.fne_item_id] = item.quantity || 0;
      });
    }

    // Vérifier qu'au moins un article a une quantité > 0 et valider les quantités
    const itemsToRefund = [];
    const validationErrors = [];

    Object.entries(refundQuantities).forEach(([itemId, quantity]) => {
      if (quantity > 0) {
        const availableQty = availableQuantities[itemId] || 0;
        if (quantity > availableQty) {
          const item = fneInvoiceData.items.find(i => i.fne_item_id === itemId);
          validationErrors.push(
            `La quantité pour "${item?.description || itemId}" ne peut pas dépasser ${availableQty} (vous avez saisi ${quantity})`
          );
        } else {
          itemsToRefund.push({
            id: itemId,
            quantity: parseInt(quantity, 10)
          });
        }
      }
    });

    if (validationErrors.length > 0) {
      setErrorModalMessage('Erreurs de validation:\n' + validationErrors.join('\n'));
      setErrorModalOpen(true);
      return;
    }

    if (itemsToRefund.length === 0) {
      setErrorModalMessage('Veuillez saisir au moins une quantité à rembourser');
      setErrorModalOpen(true);
      return;
    }

    // Stocker les items et ouvrir le dialogue de confirmation "Joli"
    setItemsToRefundQueue(itemsToRefund);
    setConfirmRefundDialogOpen(true);
  };

  // Fonction d'exécution réelle de l'avoir après confirmation
  const executeRefund = async () => {
    setConfirmRefundDialogOpen(false);
    setIsSendingRefund(true);

    try {
      const requestBody = {
        invoiceId: fneInvoiceData.fne_invoice_id,
        items: itemsToRefundQueue,
        username: user?.username
      };

      const response = await fetch(API_ENDPOINTS.FNE_INVOICES.REFUND, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const errorResult = await response.json().catch(() => ({ error: 'Erreur inconnue' }));

        let errorMessage = errorResult.error || 'Erreur inconnue';
        if (errorResult.details && errorResult.details.message) {
          errorMessage = errorResult.details.message;
        } else if (errorResult.details && errorResult.details.error) {
          errorMessage = errorResult.details.error;
        }

        setErrorModalMessage(`Erreur lors de l'envoi de l'avoir :\n${errorMessage}`);
        setErrorModalOpen(true);
        return;
      }

      const result = await response.json();

      if (result.success) {
        // Utiliser le joli modal de succès existant
        handleCloseRefundModal();
        setSendConfirmation({
          open: true,
          invoiceNumber: refundInvoice?.numero || refundInvoice?.numeroFacture || 'Avoir',
          response: {
            ...result.data,
            invoiceType: 'refund'
          }
        });

        // Optimistic update of sentInvoices for refund
        const newSentRefund = {
          numero_facture: refundInvoice?.numero || refundInvoice?.numeroFacture || 'Avoir',
          send_date: new Date().toISOString(),
          invoice_type: 'refund',
          username: user?.username,
          status: 'success',
          client_name: refundInvoice?.client_name || refundInvoice?.nom_client || 'Client Inconnu',
          total_ttc: result.data?.total_ttc || 0,
          reference: result.data?.credit_note_reference || result.data?.refund_reference || 'N/A'
        };
        setSentInvoices(prev => [newSentRefund, ...prev]);

        // Recharger les factures envoyées pour afficher le nouvel avoir
        await loadSentInvoices();
      } else {
        setErrorModalMessage(`Erreur lors de l'envoi de l'avoir : ${result.error || 'Erreur inconnue'}`);
        setErrorModalOpen(true);
      }
    } catch (error) {
      console.error('Erreur lors de l\'envoi de l\'avoir:', error);
      setErrorModalMessage(`Erreur lors de l'envoi de l'avoir : ${error.message}`);
      setErrorModalOpen(true);
    } finally {
      setIsSendingRefund(false);
      setItemsToRefundQueue([]);
    }
  };

  // Fonction pour copier le token dans le presse-papiers
  const copyTokenToClipboard = async (token) => {
    console.log('Tentative de copie du token:', token);

    // Vérifier si le token existe
    if (!token) {
      console.error('Token vide ou null');
      notify('Token non disponible');
      return;
    }

    try {
      // Méthode 1: Clipboard API moderne (priorité)
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(token);
        console.log('Copie réussie avec Clipboard API');

        // Forcer le focus pour s'assurer que le presse-papiers est accessible
        window.focus();

        notify('Token copié dans le presse-papiers!');
        return;
      }

      // Méthode 2: Fallback avec execCommand
      fallbackCopy(token);

    } catch (err) {
      console.error('Erreur lors de la copie avec Clipboard API:', err);
      fallbackCopy(token);
    }
  };

  const fallbackCopy = (token) => {
    // Méthode alternative: textarea
    const textArea = document.createElement('textarea');
    textArea.value = token;
    textArea.style.position = 'fixed';
    textArea.style.left = '0';
    textArea.style.top = '0';
    textArea.style.opacity = '0';
    textArea.style.width = '1px';
    textArea.style.height = '1px';
    textArea.style.padding = '0';
    textArea.style.border = 'none';
    textArea.style.outline = 'none';
    textArea.style.boxShadow = 'none';
    textArea.style.background = 'transparent';
    textArea.setAttribute('readonly', '');

    document.body.appendChild(textArea);

    // Sélectionner le texte
    textArea.focus();
    textArea.select();
    textArea.setSelectionRange(0, 99999); // Pour mobile devices

    try {
      const successful = document.execCommand('copy');
      console.log('Résultat de la copie alternative:', successful);

      if (successful) {
        // Forcer le focus sur le document pour s'assurer que le presse-papiers est bien mis à jour
        window.focus();
        document.body.focus();

        // Vérification immédiate si possible
        setTimeout(async () => {
          try {
            if (navigator.clipboard && navigator.clipboard.readText) {
              const clipboardText = await navigator.clipboard.readText();
              console.log('Vérification du presse-papiers:', clipboardText === token ? 'OK' : 'KO');
            }
          } catch (e) {
            console.log('Impossible de vérifier le presse-papiers (normal)');
          }
        }, 100);

        notify('Token copié dans le presse-papiers!');
      } else {
        console.error('La copie alternative a échoué');
        notify('Erreur lors de la copie du token');
      }
    } catch (err) {
      console.error('Erreur lors de la copie alternative:', err);
      notify('Erreur lors de la copie du token');
    } finally {
      document.body.removeChild(textArea);
    }
  };

  // Fonction pour fermer le modal de réponse API
  const closeApiResponseModal = () => {
    setApiResponseModal({ open: false, data: null, invoiceType: 'invoice' });
  };


  const [downloadedInvoices, setDownloadedInvoices] = useState([]);

  // Charger les factures téléchargées depuis la base de données (uniquement non envoyées)
  const loadDownloadedInvoices = async () => {
    try {
      const params = new URLSearchParams();
      if (searchTerm) params.append('search', searchTerm);
      if (dateFrom) params.append('startDate', dateFrom);
      if (dateTo) params.append('endDate', dateTo);
      if (selectedPos) params.append('pointOfSale', selectedPos);
      if (sortBy) params.append('sortBy', sortBy);
      if (sortOrder) params.append('sortOrder', sortOrder);

      const url = `${API_ENDPOINTS.DOWNLOADED_INVOICES.BASE}${params.toString() ? '?' + params.toString() : ''}`;
      const response = await fetch(url);
      if (response.ok) {
        const data = await response.json();
        const invoicesWithDetails = data.data || [];
        setDownloadedInvoices(invoicesWithDetails);

        // Mettre à jour le cache local avec les détails déjà calculés par le backend
        const newDetails = {};
        invoicesWithDetails.forEach(inv => {
          if (inv.computedDetails) {
            newDetails[inv.id] = inv.computedDetails;
          }
        });
        if (Object.keys(newDetails).length > 0) {
          setInvoiceDetails(prev => ({ ...prev, ...newDetails }));
        }

        // Mettre à jour les modifications de champs inline en masse
        const bulkModifications = {};
        invoicesWithDetails.forEach(inv => {
          if (inv.modifications) {
            Object.entries(inv.modifications).forEach(([field, val]) => {
              const key = `${inv.numero}_${field}`;
              bulkModifications[key] = val;
            });
          }
        });
        if (Object.keys(bulkModifications).length > 0) {
          setFieldModifications(prev => ({ ...prev, ...bulkModifications }));
        }
      }
    } catch (error) {
      console.error('Erreur lors du chargement des factures téléchargées:', error);
    }
  };

  const [sentInvoices, setSentInvoices] = useState([]);

  // Initialisation de la vue depuis le localStorage pour la persistance au rafraîchissement
  const [viewMode, setViewMode] = useState(() => localStorage.getItem('viewMode') || 'home');

  // Garde d'accès : un utilisateur sans le droit correspondant ne doit pas rester sur
  // une vue interdite (ex. un valideur BL ne doit pas accéder au téléchargement/envoi).
  // On le renvoie vers "Statut Facture" s'il a un rôle BL, sinon on ne force rien.
  useEffect(() => {
    const blocked =
      ((viewMode === 'home' || viewMode === 'download') && !canDownloadInvoice) ||
      (viewMode === 'list' && !canViewDownloaded) ||
      (viewMode === 'sent' && !canViewSent);
    if (blocked && hasAnyBlRole) {
      setViewMode('bl-validation');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode, canDownloadInvoice, canViewDownloaded, canViewSent, hasAnyBlRole]);
  const [selectedPos, setSelectedPos] = useState(() => localStorage.getItem('selectedPos') || null);

  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const [openDeleteDialog, setOpenDeleteDialog] = useState(false);

  // Synchronisation des états avec le localStorage
  useEffect(() => {
    localStorage.setItem('viewMode', viewMode);
  }, [viewMode]);

  useEffect(() => {
    if (selectedPos) {
      localStorage.setItem('selectedPos', selectedPos);
    } else {
      localStorage.removeItem('selectedPos');
    }
  }, [selectedPos]);
  const [invoiceToDelete, setInvoiceToDelete] = useState(null);
  const [openDownloadModal, setOpenDownloadModal] = useState(false);
  const [existingInvoiceInfo, setExistingInvoiceInfo] = useState(null);

  // États pour les filtres et recherche des factures téléchargées
  const [searchTerm, setSearchTerm] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [sortBy, setSortBy] = useState('download_date');
  const [sortOrder, setSortOrder] = useState('DESC');

  // Fonction pour fermer le modal d'erreur
  const handleCloseErrorModal = () => {
    setErrorModalOpen(false);
    setErrorModalMessage('');
  };

  // État pour le modal de confirmation d'envoi
  const [sendConfirmation, setSendConfirmation] = useState({
    open: false,
    response: null,
    invoiceNumber: ''
  });

  // États pour les filtres des factures envoyées
  const [sentDateFrom, setSentDateFrom] = useState('');
  const [sentDateTo, setSentDateTo] = useState('');
  const [sentSearchTerm, setSentSearchTerm] = useState('');
  // Filtres de la page "Factures Problème" (filtrage client sur download_date / numéro / client)
  const [sentUserFilter, setSentUserFilter] = useState('');
  const [sentInvoiceTypeFilter, setSentInvoiceTypeFilter] = useState('all'); // 'all', 'error', 'manual', 'normal'
  const [sentSortBy, setSentSortBy] = useState('SendOn');
  const [sentSortOrder, setSentSortOrder] = useState('DESC');
  const [sentPage, setSentPage] = useState(0);
  const [sentRowsPerPage, setSentRowsPerPage] = useState(20);
  const [sentExpanded, setSentExpanded] = useState({}); // {[parentInvoiceId]: bool}
  const [sentExpandAll, setSentExpandAll] = useState(false);
  const [downloadedPage, setDownloadedPage] = useState(0);
  const [downloadedRowsPerPage, setDownloadedRowsPerPage] = useState(20);
  const [listOnlyErrors, setListOnlyErrors] = useState(false); // filtre "erreurs seules" depuis Accueil
  const toPrint = useRef();


  // Charger les factures au chargement du composant et quand les filtres changent.
  // Debounce 400ms : évite de re-fetcher à chaque touche tapée dans la barre de recherche.
  // Why: chaque fetch déclenche un full-scan de logs_actions côté backend (cf. getAllDownloadedInvoices).
  useEffect(() => {
    const t = setTimeout(() => loadDownloadedInvoices(), 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchTerm, dateFrom, dateTo, selectedPos, sortBy, sortOrder]);

  useEffect(() => {
    const t = setTimeout(() => loadSentInvoices(), 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.username, sentDateFrom, sentDateTo, sentSearchTerm, sentUserFilter, sentInvoiceTypeFilter, selectedPos, sentSortBy, sentSortOrder]);

  useEffect(() => {
    fetchPointsOfSale();
  }, []);

  // Auto-revalidation : dès qu'un envoi FNE met à jour sentInvoices, si un
  // modal "avoir bloqué" est encore affiché, on rappelle resolve-avoir pour
  // savoir si la facture initiale est désormais envoyée → on ferme le modal.
  useEffect(() => {
    if (!missingInitialInvoice?.numeroAvoir) return;
    const initialNum = String(missingInitialInvoice.numeroFacture);
    const initialNowSent = sentInvoices.some(s => String(s.numero_facture) === initialNum);
    if (!initialNowSent) return;
    let cancelled = false;
    (async () => {
      const fresh = await revalidateAvoirResolution(missingInitialInvoice.numeroAvoir, facture);
      if (cancelled) return;
      if (fresh?.success) {
        notify({
          severity: 'success',
          title: 'Avoir débloqué',
          message: `La facture initiale ${initialNum} est maintenant envoyée à la FNE. Tu peux télécharger l'avoir.`,
        });
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sentInvoices]);

  const fetchPointsOfSale = async () => {
    try {
      const response = await fetch(API_ENDPOINTS.POINT_OF_SALE.BASE);
      if (response.ok) {
        const data = await response.json();
        setAllPointsOfSale(data);

        // Initialiser les sélections à partir de l'état "active" de la base
        const initialSelections = {};
        data.forEach(pos => {
          initialSelections[pos.id] = pos.active;
        });
        setPosSelections(initialSelections);
      }
    } catch (error) {
      console.error('Erreur lors de la récupération des points de vente:', error);
    }
  };

  const handleTogglePosSelection = (id) => {
    setPosSelections(prev => ({
      ...prev,
      [id]: !prev[id]
    }));
  };

  const handleSavePosSelections = async () => {
    try {
      setPosLoading(true);
      const response = await fetch(API_ENDPOINTS.POINT_OF_SALE.BULK_UPDATE, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ selections: posSelections })
      });

      if (response.ok) {
        notify('Points de vente mis à jour avec succès');
        setPosDialogOpen(false);
        await fetchPointsOfSale(); // Rafraîchir la liste locale
      } else {
        const errorData = await response.json();
        notify('Erreur lors de la mise à jour: ' + (errorData.error || 'Erreur inconnue'));
      }
    } catch (error) {
      console.error('Erreur lors de la sauvegarde des sélections POS:', error);
      notify('Erreur lors de la sauvegarde');
    } finally {
      setPosLoading(false);
    }
  };

  // Impression PDF via react-to-print
  /*
  const handlePrint = useReactToPrint({
    content: () => toPrint.current,
    documentTitle: 'Facture',
  });
  */

  const rechercherFacture = async (overrideNumero = null) => {
    // Protection : si overrideNumero est un event React (clic bouton), on l'ignore
    const safeOverride = (typeof overrideNumero === 'string' || typeof overrideNumero === 'number')
      ? String(overrideNumero)
      : null;
    const numeroToSearch = safeOverride || numero;
    if (safeOverride) setNumero(safeOverride);
    setLoading(true);
    setError('');
    setFacture(null);
    setAvoirSapResult(null);
    setAvoirSapDownloaded(false);
    setItemsMismatch(null);
    try {
      console.log('Envoi de la requête pour le numéro:', numeroToSearch);
      // Utilisation de l'URL configurée
      const response = await axios.post(API_ENDPOINTS.SAP.SEARCH, {
        VBELN: numeroToSearch,
        KONV_READ: 'X'
      });

      // Log complet de la réponse
      console.log('Réponse complète de l\'API:', response);
      console.log('Données de la réponse:', response.data);

      if (response.data && response.data.success) {
        console.log('Données de facture reçues:', response.data.data);
        setFacture(response.data);
        try {
          const rawData = response.data?.data;
          const lignes = Array.isArray(rawData?.data)
            ? rawData.data
            : Array.isArray(rawData)
              ? rawData
              : rawData?.data
                ? [rawData.data]
                : rawData
                  ? [rawData]
                  : [];
          console.log('Lignes de facture au moment de l\'affichage des détails (rechercherFacture):', lignes);

          // Récupérer l'adresse client si le KUNNR est présent
          const firstItem = lignes[0] || {};
          const kunnr = firstItem.kunnr || firstItem.KUNNR;

          // Charger les modifications existantes
          const invoiceNumber = firstItem.numeroFacture || firstItem.VBELN || numeroToSearch;
          await loadInvoiceModifications(invoiceNumber);

          // Détecter si c'est un avoir via le FKART
          const fkartValue = (firstItem.fkart || '').trim();
          const isAvoirDetected = fkartValue.includes('G2') || fkartValue.includes('RE') || fkartValue.includes('S1') || fkartValue.includes('CR');
          if (isAvoirDetected) {
            console.log('[Avoir] Document détecté comme avoir (FKART=' + fkartValue + '), résolution automatique...');
            setAvoirResolving(true);
            try {
              const resolveResp = await fetch(API_ENDPOINTS.SAP.RESOLVE_AVOIR, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${localStorage.getItem('token')}`
                },
                body: JSON.stringify({ numeroAvoir: numeroToSearch.trim() })
              });
              const resolveResult = await resolveResp.json();
              if (resolveResult.success) {
                resolveResult.avoirData = response.data;
                setAvoirSapResult(resolveResult);
                console.log('[Avoir] Résolution réussie:', resolveResult);
              } else {
                console.warn('[Avoir] Résolution partielle:', resolveResult.error);
                if (resolveResult.error === 'NO_MATCHING_ITEMS' || resolveResult.error === 'UNIT_MISMATCH') {
                  // BLOCAGE : articles de l'avoir incohérents avec la facture initiale
                  //  - NO_MATCHING_ITEMS : articles manquants
                  //  - UNIT_MISMATCH    : unités différentes entre avoir et facture initiale
                  setAvoirSapResult({ partial: true, ...resolveResult, avoirData: response.data });
                  setItemsMismatch({
                    kind: resolveResult.error, // 'NO_MATCHING_ITEMS' | 'UNIT_MISMATCH'
                    numeroAvoir: resolveResult.avoir?.numero || numeroToSearch.trim(),
                    numeroInitiale: resolveResult.factureInitiale?.numero || resolveResult.avoir?.factureInitiale,
                    message: resolveResult.message,
                    unmatchedAvoirItems: resolveResult.unmatchedAvoirItems || [],
                    unitMismatchItems: resolveResult.unitMismatchItems || [],
                    avoirSapItems: resolveResult.avoirSapItems || [],
                    initialSapItems: resolveResult.initialSapItems || [],
                    matchedItemsCount: resolveResult.matchedItemsCount || 0,
                    totalAvoirItemsCount: resolveResult.totalAvoirItemsCount || 0,
                  });
                } else if (resolveResult.avoir) {
                  setAvoirSapResult({ partial: true, ...resolveResult, avoirData: response.data });
                  if (resolveResult.avoir.factureInitiale) {
                    // Cas connu : facture initiale identifiée mais pas envoyée à la FNE
                    setMissingInitialInvoice({
                      numeroFacture: resolveResult.avoir.factureInitiale,
                      numeroAvoir: numeroToSearch.trim(),
                      reason: resolveResult.error || 'INITIAL_NOT_SENT',
                      alreadyDownloaded: resolveResult.error === 'INITIAL_NOT_SENT',
                    });
                  } else {
                    // Cas critique : facture initiale INTROUVABLE par toutes les stratégies
                    setUnresolvedAvoir({
                      numeroAvoir: numeroToSearch.trim(),
                      commande: resolveResult.avoir.commande || null,
                      type: resolveResult.avoir.type || null,
                    });
                  }
                } else {
                  setError(
                    `⛔ Avoir ${numeroToSearch.trim()} : ${resolveResult.error || 'résolution impossible'}.`
                  );
                }
              }
            } catch (avoirErr) {
              console.error('[Avoir] Erreur résolution avoir:', avoirErr);
            } finally {
              setAvoirResolving(false);
            }
          }

          if (kunnr) {
            try {
              console.log(`=== RÉCUPÉRATION ADRESSE POUR LE CLIENT ${kunnr} (rechercherFacture) ===`);
              const resAddr = await axios.get(`${API_ENDPOINTS.SAP.CLIENT_ADDRESS}/${kunnr}`);
              if (resAddr.data && resAddr.data.success && resAddr.data.data) {
                const addr = Array.isArray(resAddr.data.data) ? resAddr.data.data[0] : resAddr.data.data;
                const { SMTP_ADDR, TELF1 } = addr || {};

                if (SMTP_ADDR || TELF1) {
                  // Mettre à jour les lignes de la facture
                  const updatedData = lignes.map(line => ({
                    ...line,
                    clientEmail: SMTP_ADDR || line.clientEmail || '',
                    clientPhone: TELF1 || line.clientPhone || '',
                    ClientEmail: SMTP_ADDR || line.ClientEmail || '',
                    ClientPhone: TELF1 || line.ClientPhone || ''
                  }));

                  // Mettre à jour l'état de la facture de manière robuste
                  setFacture(prev => {
                    if (!prev) return prev;
                    const newFacture = { ...prev };
                    if (Array.isArray(newFacture.data)) {
                      newFacture.data = updatedData;
                    } else if (newFacture.data?.data) {
                      newFacture.data = { ...newFacture.data, data: updatedData };
                    } else {
                      newFacture.data = updatedData;
                    }
                    return newFacture;
                  });
                }
              }
            } catch (err) {
              console.error("Erreur lors de la récupération de l'adresse client:", err);
            }
          }
        } catch (e) {
          console.warn('Impossible de logger les lignes de facture (rechercherFacture):', e);
        }
      } else {
        console.error('Réponse API sans succès:', response.data);
        setError('Aucune donnée valide reçue du serveur');
      }
    } catch (err) {
      if (err.response && err.response.status === 409) {
        // Afficher le motif renvoyé par le backend (liste noire, déjà téléchargée, etc.)
        setError(err.response.data?.message || "Cette facture a déjà été téléchargée et ENVOYÉE");
      } else {
        setError("Facture introuvable ou erreur de communication SAP");
      }
    } finally {
      setLoading(false);
    }
  };

  // Fonction pour gérer l'impression avec log
  const handlePrintInvoiceWithLog = async (token, invoiceNumber) => {
    if (!token) return;

    // Log l'action d'impression
    try {
      await fetch(API_ENDPOINTS.LOGS.PRINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: user?.username || 'Unknown',
          numeroFacture: invoiceNumber
        })
      });
    } catch (error) {
      console.error('Erreur lors du log d\'impression:', error);
    }

    // Le backend rend la facture FNE en PDF (Playwright) → impression possible sans internet sur le poste.
    window.open(API_ENDPOINTS.FNE.PRINT_PROXY(invoiceNumber), '_blank');
  };

  // Gestion du téléchargement des factures
  const handleDownload = () => {
    // Réinitialiser la sélection de point de vente lorsque l'utilisateur passe par le menu
    setSelectedPos(null);
    setViewMode('download');
    setIsDetailViewMode(false);
  };

  const fileInputRef = useRef(null);

  const handleShortcutClick = (pos) => {
    setSelectedPos(pos);
    setIsDetailViewMode(false);
    setViewMode('download');
  };



  const handleManualRegister = async () => {
    if (!manualFneData.numeroFacture || !manualFneData.fneReference) {
      setError('Veuillez remplir tous les champs');
      return;
    }

    setError(null);
    setManualFneLoading(true);
    try {
      const response = await axios.post(API_ENDPOINTS.FNE_INVOICES.MANUAL_REGISTER, {
        numeroFacture: manualFneData.numeroFacture,
        fneReference: manualFneData.fneReference,
        username: user?.username
      });

      if (response.data.success) {
        setManualFneOpen(false);
        setManualFneData({ numeroFacture: '', fneReference: '', existingFne: null });

        // Rafraîchir les listes
        await Promise.all([
          loadDownloadedInvoices(),
          loadSentInvoices()
        ]);

        // Rediriger vers la liste des factures envoyées pour voir le résultat
        setViewMode('sent');

        // Message de succès personnalisé selon le cas
        notify(response.data.message || 'Opération effectuée avec succès');
      }
    } catch (err) {
      console.error('Erreur lors de l\'enregistrement manuel:', err);
      const msg = err.response?.data?.error || 'Erreur lors de l\'enregistrement manuel';
      setError(msg);
      notify(msg);
    } finally {
      setManualFneLoading(false);
    }
  };

  const handleImportTemplate = () => {
    if (fileInputRef.current) fileInputRef.current.click();
  };

  const handleExportTemplateCSV = () => {
    let headers = [
      'Facture', 'Nom Client', 'ClientEmail', 'ClientPhone', 'ClientNCC',
      'Template', 'PaymentMethod', 'InvoiceType', 'isRne', 'Point de vente',
      'Establishment', 'Ref', 'Designation', 'PU_HT', 'Qte', 'Unite',
      'TVA', 'OtherTaxName', 'OtherTaxPct', 'Rem_Pct', 'CommercialMessage', 'Total A payer'
    ];

    // Utiliser des en-têtes spécifiques pour FACTURE_EXPORT (Demande utilisateur)
    // Pas de colonne Total A payer dans le template (calculé côté système)
    if (selectedPos === 'FACTURE_EXPORT') {
      headers = [
        'Facture', 'Dossier', 'Nom Client', 'ClientEmail', 'ClientPhone', 'ClientNCC',
        'Template', 'PaymentMethod', 'InvoiceType', 'isRne', 'Point de vente',
        'Establishment', 'Ref', 'Designation', 'PU_HT', 'Qte', 'Unite',
        'TVA', 'OtherTaxName', 'OtherTaxPct', 'Remises', 'DEVISES', 'Taux de change',
        'Code Client', 'Nbr Colis', 'Poids Brut', 'Poids Net', 'TD', 'Bureau de Sortie', 'D.F.L'
      ];
    }
    // Créer le contenu CSV avec des points-virgules (standard pour Excel en français)
    // Ajouter le BOM UTF-8 (\ufeff) pour qu'Excel reconnaisse l'encodage
    const csvContent = '\ufeff' + headers.join(';') + '\n';

    // Créer un blob et un lien de téléchargement
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', 'template_import_factures.csv');
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setDownloadFormatDialogOpen(false);
  };

  const handleDownloadTemplate = () => {
    setDownloadFormatDialogOpen(true);
  };

  const handleExportTemplateExcel = (format = 'xlsx') => {
    let headers = [
      'Facture', 'Nom Client', 'ClientEmail', 'ClientPhone', 'ClientNCC',
      'Template', 'PaymentMethod', 'InvoiceType', 'isRne', 'Point de vente',
      'Establishment', 'Ref', 'Designation', 'PU_HT', 'Qte', 'Unite',
      'TVA', 'OtherTaxName', 'OtherTaxPct', 'Rem_Pct', 'CommercialMessage', 'Total A payer'
    ];

    // Utiliser des en-têtes spécifiques pour FACTURE_EXPORT (Demande utilisateur)
    // Pas de colonne Total A payer dans le template (calculé côté système)
    if (selectedPos === 'FACTURE_EXPORT') {
      headers = [
        'Facture', 'Dossier', 'Nom Client', 'ClientEmail', 'ClientPhone', 'ClientNCC',
        'Template', 'PaymentMethod', 'InvoiceType', 'isRne', 'Point de vente',
        'Establishment', 'Ref', 'Designation', 'PU_HT', 'Qte', 'Unite',
        'TVA', 'OtherTaxName', 'OtherTaxPct', 'Remises', 'DEVISES', 'Taux de change',
        'Code Client', 'Nbr Colis', 'Poids Brut', 'Poids Net', 'TD', 'Bureau de Sortie', 'D.F.L'
      ];
    }

    // Créer une feuille de calcul avec uniquement les en-têtes
    const ws = XLSX.utils.aoa_to_sheet([headers]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Template");

    // Générer le fichier et déclencher le téléchargement
    const extension = format === 'xls' ? 'xls' : 'xlsx';
    XLSX.writeFile(wb, `template_import_factures.${extension}`);
    setDownloadFormatDialogOpen(false);
  };

  const parseNumber = (value) => {
    if (value === null || value === undefined) return 0;
    const str = String(value).toString().replace(',', '.').trim();
    const n = Number(str);
    return isNaN(n) ? 0 : n;
  };

  // Fonction pour traiter et enregistrer les données du template (Unifiée)
  const processAndRegisterTemplateData = async (dataToProcess, initialSkippedLines = [], headers = []) => {
    if (!dataToProcess || dataToProcess.length === 0) {
      if (initialSkippedLines.length > 0) {
        setImportResult({
          open: true,
          successCount: 0,
          errorCount: 1,
          errors: ['Aucune donnée valide à importer'],
          skippedLines: initialSkippedLines
        });
      }
      return;
    }

    try {
      setLoading(true);

      let successCount = 0;
      let errorCount = 0;
      let successfulLinesCount = 0;
      const errors = [];
      const skippedLines = [...initialSkippedLines];

      // Préparer la liste des numéros déjà téléchargés pour éviter les doublons
      const existingNumbers = new Set(
        (downloadedInvoices || [])
          .map(inv => inv.numero)
          .filter(num => !!num)
      );

      // Filtrer les lignes sans numéro de facture (lignes vides ou incomplètes)
      const validData = dataToProcess.filter((row, index) => {
        const facture = (row.Facture || '').toString().trim();
        if (!facture) {
          console.warn(`Ligne ${index + 1} ignorée : numéro de facture vide`);
          skippedLines.push({
            facture: '(vide)',
            client: (row.ClientName || row['Nom Client'] || 'N/A').toString().trim(),
            ref: (row.Ref || 'N/A').toString().trim(),
            error: 'Numéro de facture manquant'
          });
          return false;
        }
        return true;
      });

      // Grouper les lignes du template par (Facture, ClientName)
      const groups = new Map();
      validData.forEach((row, index) => {
        const numeroFacture = (row.Facture || '').toString().trim();
        // Accepter "Nom Client" (export template) ou "ClientName" (alias)
        const clientName = (row.ClientName || row['Nom Client'] || 'Client inconnu').toString().trim();
        const key = `${numeroFacture}||${clientName}`;
        if (!groups.has(key)) {
          groups.set(key, {
            numeroFacture,
            clientName,
            rows: []
          });
        }
        groups.get(key).rows.push(row);
      });

      // Traiter chaque facture (groupe) individuellement

      // --- Pré-vérification des doublons pour bloquer TOUTE l'importation ---
      const duplicatesFound = [];
      for (const group of groups.values()) {
        if (existingNumbers.has(group.numeroFacture)) {
          duplicatesFound.push(group.numeroFacture);
        }
      }

      if (duplicatesFound.length > 0) {
        setLoading(false);
        const errorMsg = `Importation bloquée : Les factures suivantes ont déjà été téléchargées : ${duplicatesFound.join(', ')}`;
        setError(errorMsg);
        setImportResult({
          open: true,
          successCount: 0,
          errorCount: duplicatesFound.length,
          errors: [errorMsg],
          skippedLines: dataToProcess.map(row => ({
            facture: row.Facture || 'N/A',
            client: row.ClientName || row['Nom Client'] || 'N/A',
            ref: row.Ref || 'N/A',
            error: 'Déjà téléchargée (Importation bloquée)'
          })),
          totalProcessedLines: dataToProcess.length,
          successfulLinesCount: 0
        });
        return;
      }

      for (const [, group] of groups.entries()) {
        const { numeroFacture, clientName, rows } = group;

        // Vérifier si ce numéro existe déjà en base
        if (existingNumbers.has(numeroFacture)) {
          errorCount++;
          errors.push(`Facture ${numeroFacture}: déjà téléchargée`);
          rows.forEach(row => {
            skippedLines.push({
              facture: numeroFacture,
              client: clientName,
              ref: row.Ref || 'N/A',
              error: 'Déjà téléchargée'
            });
          });
          continue;
        }

        // ─── Validation des champs obligatoires FNE sur l'en-tête facture ───
        // Toujours obligatoires : client_name, client_email, client_phone, point_of_sale
        // B2B uniquement : client_ncc
        const firstRow = rows[0] || {};
        const isBlank = (v) => v === null || v === undefined || String(v).trim() === '';
        const headerEmail = firstRow.ClientEmail ?? firstRow.client_email ?? firstRow.clientEmail ?? '';
        const headerPhone = firstRow.ClientPhone ?? firstRow.client_phone ?? firstRow.clientPhone ?? '';
        const headerNcc   = firstRow.ClientNCC   ?? firstRow.ClientNcc   ?? firstRow.client_ncc   ?? firstRow.clientNCC  ?? firstRow.clientNcc ?? '';
        const headerPos   = firstRow.PointOfSale ?? firstRow.point_of_sale ?? firstRow.pointOfSale ?? '';
        const headerTpl   = (firstRow.Template   ?? firstRow.template ?? 'B2B').toString().toUpperCase();

        // EXCEPTION : pour les factures EXPORT en B2F (clients internationaux),
        // l'email n'est pas exigé.
        const isB2FExport =
          headerTpl === 'B2F' &&
          ((headerPos || '').toUpperCase() === 'FACTURE_EXPORT' || selectedPos === 'FACTURE_EXPORT');

        const headerMissing = [];
        if (isBlank(clientName) || clientName === 'Client inconnu') headerMissing.push('Nom client');
        if (!isB2FExport && isBlank(headerEmail)) headerMissing.push('Email');
        if (isBlank(headerPhone)) headerMissing.push('Téléphone');
        if (isBlank(headerPos))   headerMissing.push('Point de vente');
        if (headerTpl === 'B2B' && isBlank(headerNcc)) headerMissing.push('NCC (B2B)');

        if (headerMissing.length > 0) {
          errorCount++;
          const msg = `Facture ${numeroFacture}: champs obligatoires manquants (${headerMissing.join(', ')})`;
          errors.push(msg);
          rows.forEach(row => {
            skippedLines.push({
              facture: numeroFacture,
              client: clientName,
              ref: row.Ref || 'N/A',
              error: `Champs manquants : ${headerMissing.join(', ')}`
            });
          });
          continue;
        }

        // Validation des lignes individuelles
        let lineErrors = [];
        rows.forEach((row, index) => {
          const lineNum = index + 1;
          const ref = (row.Ref || '').toString().trim();
          const designation = (row.Designation || '').toString().trim();
          const puHt = parseNumber(row.PU_HT);
          const qte = parseInt(row.Qte) || 0;
          const unite = (row.Unite || '').toString().trim();

          if (!ref) lineErrors.push(`Ligne ${lineNum}: Référence manquante`);
          if (!designation) lineErrors.push(`Ligne ${lineNum}: Désignation manquante`);
          if (puHt <= 0) lineErrors.push(`Ligne ${lineNum}: PU HT invalide`);
          if (qte <= 0) lineErrors.push(`Ligne ${lineNum}: Qte invalide`);
          if (!unite) lineErrors.push(`Ligne ${lineNum}: Unité manquante`);
        });

        if (lineErrors.length > 0) {
          errorCount++;
          errors.push(`Facture ${numeroFacture}: Erreurs de validation`);
          rows.forEach((row, idx) => {
            skippedLines.push({
              facture: numeroFacture,
              client: clientName,
              ref: row.Ref || 'N/A',
              error: lineErrors[idx] || 'Données invalides'
            });
          });
          continue;
        }

        try {
          const uniqueId = `TMP_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

          // Nettoyage robuste des valeurs (trim et suppression des tabulations internes)
          const cleanValue = (val) => {
            if (val === null || val === undefined) return '';
            return String(val).trim().replace(/\t/g, ' ');
          };

          const buildExportCommercialMessage = (row, headers, numeroFacture) => {
            // Nettoyer la valeur et supprimer le label redondant si présent
            const safe = (val, label) => {
              let cleaned = cleanValue(val) || 'N/A';
              if (cleaned === 'N/A') return cleaned;

              // Liste des labels à supprimer agressivement du début de la chaîne
              const labelsToStrip = [
                'DESTINATION FINALE LIVRAISON',
                'DESTINATION FINALE',
                'DEST.F.L.',
                'D.F.L.',
                'T.F.L.',
                'T.F.L',
                'DEST.',
                'DESTINATION'
              ];

              // Si un label spécifique est passé (ex: "Code Client"), on l'ajoute à la liste de nettoyage
              if (label) labelsToStrip.push(label);

              let changed = true;
              while (changed) {
                changed = false;
                for (const sub of labelsToStrip) {
                  const escapedSub = sub.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                  const subRegex = new RegExp(`^${escapedSub}[:\\s/]*`, 'i');
                  if (subRegex.test(cleaned)) {
                    cleaned = cleaned.replace(subRegex, '').trim();
                    changed = true;
                  }
                }
              }

              return cleaned || 'N/A';
            };

            // Fonction pour trouver une clé de manière insensible à la casse et aux caractères spéciaux
            const findValue = (obj, targetKey) => {
              const normalize = (s) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
              const normalizedTarget = normalize(targetKey);
              const key = Object.keys(obj).find(k => normalize(k) === normalizedTarget);
              return key ? obj[key] : undefined;
            };

            const destValue = findValue(row, 'Destination Finale') || findValue(row, 'Dest.F.L.') || findValue(row, 'Dest F.L.') || findValue(row, 'D.F.L.') || findValue(row, 'D.F.L') || findValue(row, 'T.F.L.') || findValue(row, 'T.F.L') || findValue(row, 'Destination') || findValue(row, 'Dest');
            const destLabel = "D.F.L.";

            const parts = [
              `N°Fact: ${numeroFacture}`,
              `Code: ${safe(findValue(row, 'Code Client'), 'Code Client')}`,
              `Nbr Colis: ${safe(findValue(row, 'Nbr Colis') || findValue(row, 'Nbr colis'), 'Nbr Colis')}`,
              `P.B: ${safe(findValue(row, 'Poids Brut') || findValue(row, 'Poids brut'), 'Poids Brut')}`,
              `P.N: ${safe(findValue(row, 'Poids Net') || findValue(row, 'Poids net'), 'Poids Net')}`,
              `TD: ${safe(findValue(row, 'TD') || findValue(row, 'T.D.'), 'TD')}`,
              `Bureau de Sortie: ${safe(findValue(row, 'Bureau de Sortie') || findValue(row, 'Bureao de Sortie'), 'Bureau de Sortie')}`
            ];

            // Si on a une valeur de destination, on l'ajoute intelligemment
            const cleanedDest = safe(destValue);
            if (cleanedDest && cleanedDest !== 'N/A') {
              parts.push(`${destLabel}: ${cleanedDest}`);
            }

            // Ajouter dynamiquement toutes les autres colonnes après "Taux de change" qui ne sont pas dans la liste fixe
            if (headers && headers.length > 0) {
              const tdcIndex = headers.findIndex(h => h.toLowerCase().replace(/[^a-z0-9]/g, '') === 'tauxdechange');
              if (tdcIndex !== -1) {
                const normalize = (s) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
                // Liste étendue des en-têtes déjà gérés (incluant les alias et variantes)
                const expandedExclusions = [
                  'codeclient', 'nbrcolis', 'poidsbrut', 'poidsnet', 'td', 'bureaudesortie', 'bureao', 'destinationfinale', 'destfl', 'dest', 'dfl', 'destination'
                ].map(normalize);

                for (let i = tdcIndex + 1; i < headers.length; i++) {
                  const h = headers[i];
                  const hNormalized = normalize(h);

                  // Vérifier si cet en-tête (ou une variante) est déjà dans le message fixe
                  const isExcluded = expandedExclusions.some(ex => hNormalized.includes(ex) || ex.includes(hNormalized));

                  if (!isExcluded) {
                    parts.push(`${h}: ${safe(row[h])}`);
                  }
                }
              }
            }

            return parts.join('\n');
          };

          const lines = rows.map(row => ({
            // Capturer le N°Dossier (FACTURE_EXPORT) en acceptant tous les alias d'écriture
            numero_dossier: readDossierFromObject(row) || '',
            client_email: cleanValue(row.ClientEmail),
            client_phone: cleanValue(row.ClientPhone).replace(/\s+/g, ''),
            client_ncc: cleanValue(row.ClientNCC).replace(/\s+/g, ''),
            template: cleanValue(row.Template),
            payment_method: 'deferred', // Forcé à deferred (y compris à l'import)
            invoice_type: cleanValue(row.InvoiceType).toLowerCase(),
            is_rne: cleanValue(row.isRne) ? cleanValue(row.isRne).charAt(0).toUpperCase() + cleanValue(row.isRne).slice(1).toLowerCase() : 'False',
            point_of_sale: cleanValue(row.PointOfSale || row['Point de vente'] || selectedPos || ''),
            import_view: selectedPos || '',
            establishment: cleanValue(row.Establishment),
            reference: cleanValue(row.Ref),
            designation: cleanValue(row.Designation),
            pu_ht: parseNumber(row.PU_HT),
            quantity: parseInt(row.Qte) || 0,
            unite: (() => {
              const u = cleanValue(row.Unite).toLowerCase();
              return u === 'cts' ? 'CRN' : u.toUpperCase();
            })(),
            tva: parseNumber(row.TVA),
            other_tax_name: cleanValue(row.OtherTaxName),
            other_tax_pct: parseNumber(row.OtherTaxPct),
            rem_pct: parseNumber(row.Rem_Pct || row.Remises),
            commercial_message: selectedPos === 'FACTURE_EXPORT'
              ? buildExportCommercialMessage(row, headers, numeroFacture)
              : cleanValue(row.CommercialMessage || row.commentaire),
            foreign_currency: cleanValue(row.DEVISES),
            foreign_currency_rate: parseNumber(row['Taux de change']),
            source: 'template_import',
            verified: 1
          }));

          const response = await fetch(API_ENDPOINTS.DOWNLOADED_INVOICES.BASE, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${localStorage.getItem('token')}`
            },
            body: JSON.stringify({
              id: uniqueId,
              username: user?.username || 'anonymous',
              numero: numeroFacture,
              date: new Date().toISOString(),
              client: clientName,
              data: lines,
              invoice_type_code: selectedPos || null
            })
          });

          if (response.ok) {
            successCount++;
            successfulLinesCount += rows.length;
          } else {
            const error = await response.json();
            errorCount++;
            errors.push(`Facture ${numeroFacture}: ${error.error || 'Erreur API'}`);
            rows.forEach(row => {
              skippedLines.push({
                facture: numeroFacture,
                client: clientName,
                ref: row.Ref || 'N/A',
                error: error.error || 'Erreur API'
              });
            });
          }
        } catch (error) {
          errorCount++;
          errors.push(`Facture ${numeroFacture}: ${error.message}`);
          rows.forEach(row => {
            skippedLines.push({
              facture: numeroFacture,
              client: clientName,
              ref: row.Ref || 'N/A',
              error: error.message
            });
          });
        }
      }

      setImportResult({
        open: true,
        successCount,
        errorCount,
        errors,
        skippedLines,
        totalProcessedLines: dataToProcess.length,
        successfulLinesCount
      });

      setTemplateData([]);
      await loadDownloadedInvoices();
      setViewMode('list');

    } catch (error) {
      console.error('Erreur import:', error);
      setImportResult({
        open: true,
        successCount: 0,
        errorCount: 1,
        errors: [error.message],
        skippedLines: initialSkippedLines
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadTemplateData = () => {
    processAndRegisterTemplateData(templateData);
  };

  const handleTemplateSelected = (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;

    // Fonction améliorée pour parser les lignes CSV en gérant les guillemets et nettoyant les champs
    const parseCSVLine = (line, delimiter) => {
      const result = [];
      let current = '';
      let inQuotes = false;
      let i = 0;

      // Nettoyer la ligne des caractères de contrôle et tabulations parasites en début/fin
      line = line.replace(/[\r\n]+$/, '');

      while (i < line.length) {
        const char = line[i];
        const nextChar = line[i + 1];

        if (char === '"') {
          if (inQuotes && nextChar === '"') {
            // Deux guillemets consécutifs = guillemet échappé
            current += '"';
            i += 2;
          } else {
            // Toggle guillemets
            inQuotes = !inQuotes;
            i++;
          }
        } else if (char === delimiter && !inQuotes) {
          // Séparateur hors des guillemets
          // Correction automatique : trim et remplacement des tabulations internes par des espaces
          result.push(current.trim().replace(/\t/g, ' '));
          current = '';
          i++;
        } else {
          current += char;
          i++;
        }
      }

      // Ajouter le dernier champ avec nettoyage
      result.push(current.trim().replace(/\t/g, ' '));
      return result;
    };

    // Vérifier si c'est un fichier Excel binaire
    const isExcel = file.name.endsWith('.xlsx') || file.name.endsWith('.xls');

    if (isExcel) {
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const data = new Uint8Array(event.target.result);
          const workbook = XLSX.read(data, { type: 'array' });
          const firstSheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[firstSheetName];
          const json = XLSX.utils.sheet_to_json(worksheet, { defval: '' });

          // Extraire les en-têtes pour conserver l'ordre
          const excelHeaders = XLSX.utils.sheet_to_json(worksheet, { header: 1 })[0] || [];

          if (json.length === 0) {
            setImportResult({
              open: true,
              successCount: 0,
              errorCount: 1,
              errors: ['Aucune donnée trouvée dans le fichier Excel'],
              skippedLines: []
            });
            return;
          }

          console.log('Données Excel parsées:', json.slice(0, 2));
          // Filtrer les lignes vides et les lignes sans numéro de facture
          const filteredJson = json.filter(row => {
            // Vérifier qu'au moins une valeur significative existe
            const hasValues = Object.values(row).some(val => val !== null && val !== undefined && String(val).trim() !== '');
            if (!hasValues) return false;
            // Vérifier que le numéro de facture est renseigné (colonne obligatoire)
            const facture = (row.Facture || '').toString().trim();
            if (!facture) return false;
            return true;
          });

          if (filteredJson.length === 0) {
            setImportResult({
              open: true,
              successCount: 0,
              errorCount: 1,
              errors: [json.length > 0 ? 'Toutes les lignes du fichier Excel sont vides' : 'Aucune donnée trouvée dans le fichier Excel'],
              skippedLines: []
            });
            return;
          }

          console.log(`Données Excel parsées: ${filteredJson.length} lignes valides sur ${json.length} totales`);
          // Au lieu de setTemplateData, on traite directement
          processAndRegisterTemplateData(filteredJson, [], excelHeaders);

        } catch (error) {
          console.error('Erreur lors de la lecture du fichier Excel:', error);
          setImportResult({
            open: true,
            successCount: 0,
            errorCount: 1,
            errors: ['Erreur lors de la lecture du fichier Excel: ' + error.message],
            skippedLines: []
          });
        }
      };
      reader.readAsArrayBuffer(file);
      e.target.value = null;
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target.result;
        console.log('Contenu brut du fichier:', text.substring(0, 500));

        // Vérifier si le contenu est binaire (signe d'un fichier Excel mal converti)
        if (text.includes('PK\x03\x04') || text.includes('\x00')) {
          notify('Le fichier semble être un fichier Excel binaire.\n\nVeuillez vous assurer que le fichier est bien au format CSV texte ou importer directement le fichier .xlsx (maintenant supporté).');
          return;
        }

        // Gérer différents séparateurs et formats
        // Filtrer les lignes vides et les lignes ne contenant que des séparateurs
        let lines = text.split('\n').filter(line => line.trim() && line.trim().replace(/[;,\t]/g, '').trim() !== '');
        console.log('Nombre de lignes totales dans le fichier:', text.split('\n').length);
        console.log('Nombre de lignes après filtrage des lignes vides:', lines.length);

        if (lines.length < 2) {
          notify('Le fichier doit contenir au moins une ligne d\'en-tête et une ligne de données');
          return;
        }

        // Parser l'en-tête avec différents séparateurs possibles
        let headers;
        let delimiter = ',';
        const firstLine = lines[0];

        if (firstLine.includes('\t')) {
          delimiter = '\t';
          headers = parseCSVLine(firstLine, '\t');
        } else if (firstLine.includes(';')) {
          delimiter = ';';
          headers = parseCSVLine(firstLine, ';');
        } else {
          headers = parseCSVLine(firstLine, ',');
        }

        console.log(`Délimiteur détecté: "${delimiter === '\t' ? '\\t' : delimiter}"`);
        console.log('En-têtes détectés:', headers);

        // Colonnes attendues (sans accent et en minuscules pour la comparaison)
        const expectedColumns = [
          'Facture', 'ClientName', 'ClientEmail', 'ClientPhone', 'ClientNCC',
          'Template', 'PaymentMethod', 'InvoiceType', 'isRne', 'PointOfSale',
          'Establishment', 'Ref', 'Designation', 'PU_HT', 'Qte', 'Unite',
          'TVA', 'OtherTaxName', 'OtherTaxPct', 'Rem_Pct', 'CommercialMessage'
        ];

        // Colonnes alternatives pour Export
        const exportAliases = {
          'rem_pct': ['remises'],
          'commercial_message': ['commentaire']
        };

        // Vérifier les colonnes essentielles (insensible à la casse et aux espaces)
        const normalizedHeaders = headers.map(h => h.replace(/\s+/g, '').toLowerCase());
        const normalizedExpected = expectedColumns.map(col => col.replace(/\s+/g, '').toLowerCase());

        console.log('En-têtes normalisés:', normalizedHeaders);

        const missingColumns = expectedColumns.filter((col, index) => {
          const normExpected = normalizedExpected[index];
          // Vérifier si la colonne est présente ou si un alias est présent
          const hasBaseColumn = normalizedHeaders.includes(normExpected);
          if (hasBaseColumn) return false;

          const aliases = exportAliases[col.toLowerCase()] || [];
          const hasAlias = aliases.some(alias => normalizedHeaders.includes(alias));
          return !hasAlias;
        });

        if (missingColumns.length > 0) {
          console.log('Colonnes manquantes:', missingColumns);
          notify(`Colonnes manquantes dans le template: ${missingColumns.join(', ')}\n\nColonnes trouvées: ${headers.join(', ')}`);
          return;
        }

        // Parser les données
        const templateDataResult = [];
        const skippedLines = [];
        let lignesRejetees = 0;
        for (let i = 1; i < lines.length; i++) {
          let values;
          const line = lines[i];

          // Améliorer le parsing pour gérer les guillemets correctement
          if (line.includes('\t')) {
            values = parseCSVLine(line, '\t');
          } else if (line.includes(';')) {
            values = parseCSVLine(line, ';');
          } else {
            values = parseCSVLine(line, ',');
          }

          // Utiliser les en-têtes du fichier pour construire rowData
          // Strict : On signale les lignes avec des colonnes manquantes
          if (values.length >= headers.length) {
            const rowData = {};
            headers.forEach((col, index) => {
              rowData[col] = values[index] || '';
            });
            templateDataResult.push(rowData);
          } else {
            lignesRejetees++;
            skippedLines.push({
              facture: 'Ligne ' + (i + 1),
              client: 'N/A',
              ref: 'N/A',
              error: `Colonnes manquantes (${values.length}/${headers.length})`
            });
          }
        }

        console.log(`Parsing CSV terminé: ${templateDataResult.length} valides, ${lignesRejetees} rejetées`);

        // Traiter les données (même si templateDataResult est vide, pour montrer les skippedLines)
        processAndRegisterTemplateData(templateDataResult, skippedLines, headers);

      } catch (error) {
        console.error('Erreur lors de la lecture du fichier:', error);
        setImportResult({
          open: true,
          successCount: 0,
          errorCount: 1,
          errors: ['Erreur lors de la lecture du fichier: ' + error.message],
          skippedLines: []
        });
      }
    };

    reader.onerror = () => {
      notify('Erreur lors de la lecture du fichier');
    };

    // Lire le fichier comme texte (CSV)
    reader.readAsText(file);
    e.target.value = null;
  };

  // Affichage de la liste des factures
  const handleListInvoices = () => {
    setIsDetailViewMode(false);
    setViewMode('list');
    // Ne pas réinitialiser selectedPos pour conserver le filtre
  };

  // Exporter les factures envoyées en CSV (compatible Excel)
  const handleExportSentInvoices = () => {
    const dataToExport = sentInvoices;

    if (dataToExport.length === 0) {
      notify('Aucune donnée à exporter');
      return;
    }

    // En-têtes du CSV
    const headers = ['Type', 'N° Facture', 'Nom Client', 'Point de vente', 'Total à payer', 'Envoyée par', 'Date d\'envoi', 'Référence FNE'];

    // Contenu du CSV
    const csvContent = [
      headers.join(';'), // Utiliser point-virgule pour Excel par défaut en région FR
      ...dataToExport.map(invoice => {
        const date = new Date(invoice.send_date).toLocaleString('fr-FR');
        // Utiliser la référence enrichie par le backend
        const refFNE = invoice.reference || invoice.api_response?.reference || invoice.api_response?.manual_reference || 'N/A';
        const rawType = (invoice.invoice_type || invoice.invoiceType || 'invoice').toString().toLowerCase();
        const typeLabel = rawType === 'refund' ? 'Avoir' : rawType === 'invoice' ? 'Facture' : rawType;
        const total = (invoice.total_ttc || 0).toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).replace(/\s/g, '');

        return [
          typeLabel,
          invoice.numero_facture,
          invoice.client_name || 'Client Inconnu',
          invoice.point_of_sale || 'N/A',
          total,
          invoice.username,
          date,
          refFNE
        ].map(field => `"${field}"`).join(';');
      })
    ].join('\n');

    // Créer le fichier et déclencher le téléchargement
    const blob = new Blob(["\ufeff" + csvContent], { type: 'text/csv;charset=utf-8;' }); // BOM pour UTF-8
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `factures_envoyees_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Affichage des factures envoyées
  const handleSentInvoices = () => {
    setIsDetailViewMode(false);
    setViewMode('sent');
    loadSentInvoices();
  };

  // Envoyer un avoir (refund) à l'API FNE depuis un avoir résolu
  const handleSendAvoirRefund = async () => {
    if (!avoirSapResult || !avoirSapResult.refundPayload) return;

    setAvoirSapSending(true);
    try {
      const response = await fetch(API_ENDPOINTS.FNE_INVOICES.REFUND, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          invoiceId: avoirSapResult.refundPayload.invoiceId,
          items: avoirSapResult.refundPayload.items,
          username: user?.username,
          numeroAvoir: avoirSapResult.avoir?.numero || numero,
          clientName: avoirSapResult.avoirData?.data?.[0]?.nomClient || avoirSapResult.avoir?.client || '',
          montantAvoir: avoirSapResult.avoir?.montant || 0,
          devise: avoirSapResult.avoir?.devise || 'XOF'
        })
      });

      const result = await response.json();

      if (result.success) {
        setSendConfirmation({
          open: true,
          invoiceNumber: `Avoir ${numero}`,
          response: {
            ...result.data,
            invoiceType: 'refund'
          }
        });
        setAvoirSapResult(null);
        setAvoirSapDownloaded(false);
      } else {
        setError(`Erreur FNE: ${result.error || result.details?.message || 'Erreur inconnue'}`);
      }
    } catch (error) {
      console.error('Erreur envoi refund FNE:', error);
      setError(`Erreur lors de l'envoi: ${error.message}`);
    } finally {
      setAvoirSapSending(false);
    }
  };

  // Charger les factures envoyées depuis les logs avec filtres
  const loadSentInvoices = async () => {
    try {
      const params = new URLSearchParams();
      if (sentDateFrom) params.append('startDate', sentDateFrom);
      if (sentDateTo) params.append('endDate', sentDateTo);
      if (sentSearchTerm) params.append('search', sentSearchTerm);
      if (sentUserFilter) params.append('username', sentUserFilter);
      if (selectedPos) params.append('pointOfSale', selectedPos);
      if (sentSortBy) params.append('sortBy', sentSortBy);
      if (sentSortOrder) params.append('sortOrder', sentSortOrder);

      const url = `${API_ENDPOINTS.LOGS.SENT_INVOICES}${params.toString() ? '?' + params.toString() : ''}`;
      const response = await fetch(url);
      if (response.ok) {
        const data = await response.json();
        let invoices = data.data || [];

        // Filtrer par type de facture
        if (sentInvoiceTypeFilter !== 'all') {
          if (sentInvoiceTypeFilter === 'with_refunds') {
            // Factures qui ont au moins un avoir (tous types, y compris annulations)
            const numerosAvecAvoirs = new Set(
              invoices
                .filter(i => i.invoice_type === 'refund' && i.initial_invoice_numero)
                .map(i => i.initial_invoice_numero)
            );
            invoices = invoices.filter(invoice => {
              if (invoice.invoice_type === 'refund') {
                return invoice.initial_invoice_numero && numerosAvecAvoirs.has(invoice.initial_invoice_numero);
              }
              return numerosAvecAvoirs.has(invoice.numero_facture);
            });
          } else if (sentInvoiceTypeFilter === 'with_cancellation') {
            // Factures qui ont au moins une ANNULATION FNE de doublon
            const numerosAvecAnnulation = new Set(
              invoices
                .filter(i => i.invoice_type === 'refund' && i.is_cancellation && i.initial_invoice_numero)
                .map(i => i.initial_invoice_numero)
            );
            invoices = invoices.filter(invoice => {
              if (invoice.invoice_type === 'refund') {
                return invoice.is_cancellation && numerosAvecAnnulation.has(invoice.initial_invoice_numero);
              }
              return numerosAvecAnnulation.has(invoice.numero_facture);
            });
          } else {
            invoices = invoices.filter(invoice => {
              if (sentInvoiceTypeFilter === 'error') {
                return invoice.status === 'failed';
              } else if (sentInvoiceTypeFilter === 'manual') {
                return invoice.is_manual === true || invoice.is_manual === 1;
              } else if (sentInvoiceTypeFilter === 'normal') {
                return invoice.status !== 'failed' && !invoice.is_manual;
              }
              return true;
            });
          }
        }

        setSentInvoices(invoices);
      }
    } catch (error) {
      console.error('Erreur lors du chargement des factures envoyées:', error);
    }
  };

  // Voir les détails d'une facture envoyée
  const handleViewSentInvoice = async (sentInvoice) => {
    // 1. Déterminer si c'est un avoir (refund)
    const isRefund = sentInvoice.invoice_type === 'refund';

    // 2. Chercher dans les factures téléchargées (locales)
    let targetInvoice = downloadedInvoices.find(inv =>
      String(inv.numero) === String(sentInvoice.numero_facture)
    );

    // 3. Si pas trouvé, charger depuis le serveur (includeSent=true)
    if (!targetInvoice) {
      try {
        setLoading(true);
        const response = await fetch(`${API_ENDPOINTS.DOWNLOADED_INVOICES.BASE}?search=${sentInvoice.numero_facture}&includeSent=true`);
        if (response.ok) {
          const result = await response.json();
          if (result.data && result.data.length > 0) {
            // Trouver la correspondance exacte
            targetInvoice = result.data.find(inv => String(inv.numero) === String(sentInvoice.numero_facture));
          }
        }
      } catch (error) {
        console.error("Erreur chargement détail facture envoyée:", error);
        notify("Impossible de charger les détails de cette facture.");
      } finally {
        setLoading(false);
      }
    }

    // 4. Ouvrir la vue détail
    if (targetInvoice) {
      // Si c'est un avoir, on doit spécialiser les données pour n'afficher que les lignes remboursées
      if (isRefund) {
        try {
          // Parser la réponse API stockée dans le log pour récupérer les items remboursés
          const apiResponse = typeof sentInvoice.api_response === 'string'
            ? JSON.parse(sentInvoice.api_response)
            : (sentInvoice.api_response || {});

          const refundItems = apiResponse.refund_items || [];

          // Récupérer les données brutes de la facture (tableau de lignes)
          const rawData = Array.isArray(targetInvoice.data)
            ? targetInvoice.data
            : (targetInvoice.data?.data || targetInvoice.data || []);
          const dataItems = Array.isArray(rawData) ? rawData : [rawData];

          let filteredItems = [];

          if (refundItems.length > 0) {
            // Tenter de matcher les items du refund avec les items de la facture originale
            // via plusieurs stratégies (fne_item_id, id_fne_item, reference, ou par index/position)
            filteredItems = dataItems.map((item, index) => {
              const refundMatch = refundItems.find(ri =>
                // Match par ID FNE (si disponible)
                (ri.id && item.fne_item_id && String(ri.id) === String(item.fne_item_id)) ||
                (ri.id && item.id_fne_item && String(ri.id) === String(item.id_fne_item)) ||
                // Match par référence article
                (ri.reference && item.reference && String(ri.reference) === String(item.reference)) ||
                // Match par désignation (fallback)
                (ri.description && item.designation && ri.description === item.designation) ||
                (ri.description && item.Designation && ri.description === item.Designation)
              );

              if (refundMatch) {
                return {
                  ...item,
                  quantite: refundMatch.quantity,
                  quantity: refundMatch.quantity,
                  isRefundLine: true
                };
              }
              return null;
            }).filter(item => item !== null);

            // Si aucun match trouvé par les critères ci-dessus, matcher par position (index)
            // Les items du refund sont dans le même ordre que la facture originale
            if (filteredItems.length === 0 && dataItems.length > 0) {
              filteredItems = refundItems.map(ri => {
                // Chercher par index dans les items originaux en utilisant l'ordre
                const originalItem = dataItems.find((item, idx) => {
                  // Dernier recours : vérifier si la quantité refund est <= quantité originale
                  const origQty = parseFloat(item.quantite || item.quantity || item.Qte || 0);
                  return origQty >= ri.quantity;
                }) || dataItems[0]; // fallback au premier item

                if (originalItem) {
                  return {
                    ...originalItem,
                    quantite: ri.quantity,
                    quantity: ri.quantity,
                    isRefundLine: true
                  };
                }
                return null;
              }).filter(item => item !== null);
            }
          }

          // Construire la facture virtuelle d'avoir
          const virtualRefundInvoice = {
            ...targetInvoice,
            isRefund: true,
            refundDate: sentInvoice.send_date || sentInvoice.SendOn,
            refundBy: sentInvoice.sent_by || sentInvoice.SendBy,
          };

          // Si on a pu filtrer des items, les utiliser ; sinon afficher toutes les lignes marquées comme avoir
          if (filteredItems.length > 0) {
            if (Array.isArray(targetInvoice.data)) {
              virtualRefundInvoice.data = filteredItems;
            } else {
              virtualRefundInvoice.data = {
                ...targetInvoice.data,
                data: filteredItems
              };
            }
          }
          // Si aucun filtrage possible (pas de refund_items ou matching impossible),
          // on affiche quand même la facture mais marquée comme avoir

          handleViewInvoice(virtualRefundInvoice);
          return;
        } catch (e) {
          console.error("Erreur lors de la préparation de la vue avoir:", e);
          // En cas d'erreur, afficher quand même comme avoir avec toutes les lignes
          handleViewInvoice({
            ...targetInvoice,
            isRefund: true,
            refundDate: sentInvoice.send_date || sentInvoice.SendOn,
            refundBy: sentInvoice.sent_by || sentInvoice.SendBy,
          });
          return;
        }
      }

      // Vue normale pour les factures
      handleViewInvoice(targetInvoice);
    } else if (isRefund) {
      // Pour les avoirs : télécharger les données depuis SAP directement
      try {
        setLoading(true);
        const numeroAvoir = sentInvoice.numero_facture;

        // Chercher d'abord dans les factures déjà téléchargées
        let avoirInvoice = downloadedInvoices.find(inv =>
          String(inv.numero) === String(numeroAvoir)
        );

        // Si pas trouvé localement, télécharger depuis SAP
        if (!avoirInvoice) {
          try {
            const sapResponse = await fetch(API_ENDPOINTS.SAP.SEARCH, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token')}`
              },
              body: JSON.stringify({ VBELN: numeroAvoir })
            });

            const sapResult = await sapResponse.json();
            if (sapResult.success && sapResult.data) {
              avoirInvoice = {
                numero: numeroAvoir,
                data: sapResult.data,
                totaux: sapResult.totaux
              };
            } else if (sapResponse.status === 409) {
              // Déjà téléchargé — recharger depuis downloaded_invoices
              const dlResp = await fetch(`${API_ENDPOINTS.DOWNLOADED_INVOICES.BASE}?search=${numeroAvoir}&includeSent=true`);
              if (dlResp.ok) {
                const dlResult = await dlResp.json();
                if (dlResult.data && dlResult.data.length > 0) {
                  avoirInvoice = dlResult.data.find(inv => String(inv.numero) === String(numeroAvoir));
                }
              }
            }
          } catch (e) {
            console.warn('[Avoir] Erreur téléchargement SAP:', e.message);
          }
        }

        if (avoirInvoice) {
          handleViewInvoice({
            ...avoirInvoice,
            numero: numeroAvoir,
            isRefund: true,
            refundDate: sentInvoice.send_date || sentInvoice.SendOn,
            refundBy: sentInvoice.sent_by || sentInvoice.SendBy,
          });
        } else {
          notify("Impossible de charger les détails de cet avoir depuis SAP.");
        }
      } catch (e) {
        console.error("Erreur chargement avoir:", e);
        notify("Impossible d'afficher les détails de cet avoir.");
      } finally {
        setLoading(false);
      }
    } else {
      notify("Détails de la facture introuvables.");
    }
  };

  // Re-vérifie côté backend l'état de résolution d'un avoir.
  // Met à jour avoirSapResult / missingInitialInvoice avec la version fraîche
  // et retourne le résultat brut. Permet de débloquer un avoir dès que sa
  // facture initiale a été téléchargée + envoyée à la FNE entre-temps.
  const revalidateAvoirResolution = async (numeroAvoir, avoirData = null) => {
    if (!numeroAvoir) return null;
    setRevalidatingAvoir(true);
    try {
      const resolveResp = await fetch(API_ENDPOINTS.SAP.RESOLVE_AVOIR, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify({ numeroAvoir: String(numeroAvoir).trim() }),
      });
      const result = await resolveResp.json();
      if (result.success) {
        if (avoirData) result.avoirData = avoirData;
        setAvoirSapResult(result);
        setMissingInitialInvoice(null);
        setItemsMismatch(null);
      } else if (result.error === 'NO_MATCHING_ITEMS' || result.error === 'UNIT_MISMATCH') {
        setAvoirSapResult({ partial: true, ...result, avoirData: avoirData || undefined });
        setMissingInitialInvoice(null);
        setItemsMismatch({
          kind: result.error,
          numeroAvoir: result.avoir?.numero || String(numeroAvoir).trim(),
          numeroInitiale: result.factureInitiale?.numero || result.avoir?.factureInitiale,
          message: result.message,
          unmatchedAvoirItems: result.unmatchedAvoirItems || [],
          unitMismatchItems: result.unitMismatchItems || [],
          avoirSapItems: result.avoirSapItems || [],
          initialSapItems: result.initialSapItems || [],
          matchedItemsCount: result.matchedItemsCount || 0,
          totalAvoirItemsCount: result.totalAvoirItemsCount || 0,
        });
      } else if (result.avoir) {
        setAvoirSapResult({ partial: true, ...result, avoirData: avoirData || undefined });
        if (result.avoir.factureInitiale) {
          setMissingInitialInvoice({
            numeroFacture: result.avoir.factureInitiale,
            numeroAvoir: String(numeroAvoir).trim(),
            reason: result.error || 'INITIAL_NOT_SENT',
            alreadyDownloaded: result.error === 'INITIAL_NOT_SENT',
          });
        }
      }
      return result;
    } catch (err) {
      console.error('[Avoir] Erreur revalidation:', err);
      return null;
    } finally {
      setRevalidatingAvoir(false);
    }
  };

  // Télécharger une facture
  const handleDownloadInvoice = async () => {
    if (!facture) return;

    // ─── Garde-fou AVOIR : bloquer le téléchargement si la facture initiale
    // n'est pas déjà téléchargée ET envoyée à la FNE.
    // La résolution backend (/api/sap/resolve-avoir) a déjà posé :
    //   - avoirSapResult.success = true   → initial OK, on peut télécharger l'avoir
    //   - avoirSapResult.partial = true   → initial manquante → bloquer
    //   - missingInitialInvoice défini    → on propose la facture initiale
    const firstItem = Array.isArray(facture.data) ? facture.data[0] : facture.data;
    const fkart = (firstItem?.fkart || '').toString().trim().toUpperCase();
    // Reconnaissance large des codes d'avoir SAP : ZRE, G2, ZG2, S1, ZS1, CR, ZCR, etc.
    const looksLikeAvoir = ['ZRE', 'G2', 'ZG2', 'S1', 'ZS1', 'CR', 'ZCR', 'IG', 'L2', 'ZL2'].includes(fkart)
      || fkart.endsWith('G2') || fkart.endsWith('RE') || fkart.endsWith('S1') || fkart.endsWith('CR');
    if (looksLikeAvoir) {
      let blocked = !avoirSapResult || avoirSapResult.partial || avoirSapResult.success === false;
      // Si l'état local dit "bloqué", on revérifie côté backend avant de notifier :
      // l'utilisateur a peut-être téléchargé + envoyé la facture initiale entre-temps.
      if (blocked) {
        const numeroAvoir =
          firstItem?.numeroFacture ||
          firstItem?.VBELN ||
          missingInitialInvoice?.numeroAvoir ||
          numero;
        const fresh = await revalidateAvoirResolution(numeroAvoir, facture);
        blocked = !fresh || !fresh.success;
        if (!blocked) {
          // l'avoir vient d'être débloqué, on continue le téléchargement normal
        }
      }
      if (blocked) {
        if (itemsMismatch) {
          notify({
            severity: 'error',
            title: 'Avoir incompatible',
            message:
              `Les articles de l'avoir ne correspondent pas à la facture initiale ${itemsMismatch.numeroInitiale}. ` +
              `Voir le détail dans la boîte de dialogue affichée — l'avoir doit être corrigé côté SAP avant de pouvoir être téléchargé.`,
          });
        } else if (missingInitialInvoice?.numeroFacture) {
          notify({
            severity: 'warning',
            title: 'Téléchargement bloqué',
            message:
              `La facture initiale ${missingInitialInvoice.numeroFacture} de cet avoir n'est pas téléchargée et envoyée à la FNE.\n\n` +
              `Télécharge-la d'abord depuis la boîte de dialogue affichée.`,
          });
        } else {
          notify({
            severity: 'warning',
            title: 'Téléchargement bloqué',
            message:
              "Cet avoir ne peut pas être téléchargé tant que sa facture initiale n'a pas été téléchargée et envoyée à la FNE.\n\n" +
              "La résolution automatique n'a pas trouvé la facture liée — télécharge-la d'abord manuellement.",
          });
        }
        return;
      }
    }

    // Appliquer les modifications en attente avant de télécharger
    const pendingCount = Object.keys(pendingModifications).length;
    if (pendingCount > 0) {
      const confirmApply = await confirm(
        `Vous avez ${pendingCount} modification(s) en attente. Voulez-vous les appliquer avant de télécharger ?`
      );

      if (confirmApply) {
        await applyAllModifications();
        // Attendre un peu pour que les modifications soient synchronisées
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    console.log('=== ÉTAT DES MODIFICATIONS AVANT TÉLÉCHARGEMENT ===');
    console.log('fieldModifications:', fieldModifications);
    console.log('pendingModifications:', pendingModifications);

    console.log('=== DONNÉES DE LA FACTURE ===');
    console.log('Structure complète de facture:', facture);

    // Essayer de récupérer les informations de la facture de différentes manières
    const firstDataItem = Array.isArray(facture.data) ? facture.data[0] : facture.data;
    const vbrkData = firstDataItem?.VBRK_I || firstDataItem;
    const vbpaData = Array.isArray(firstDataItem?.XVBPA) ? firstDataItem.XVBPA : [];

    console.log('Premier élément de data:', firstDataItem);
    console.log('VBRK_I:', vbrkData);
    console.log('XVBPA:', vbpaData);

    // Récupérer le numéro de facture pour vérifier s'il existe déjà
    const invoiceNumber = vbrkData?.numeroFacture || firstDataItem?.numeroFacture || 'N/A';

    // Vérifier SI la facture a DÉJÀ été ENVOYÉE (Prioritaire)
    try {
      // On interroge le backend pour être sûr (car sentInvoices local peut être filtré)
      const sentCheckRes = await fetch(`${API_ENDPOINTS.LOGS.SENT_INVOICES}?search=${invoiceNumber}`);
      if (sentCheckRes.ok) {
        const sentCheckData = await sentCheckRes.json();
        if (sentCheckData.data && sentCheckData.data.length > 0) {
          // Vérification stricte du numéro
          const isSent = sentCheckData.data.some(s => String(s.numero_facture) === String(invoiceNumber));
          if (isSent) {
            notify(`Impossible de télécharger la facture ${invoiceNumber} :\n\nCette facture a déjà été téléchargée et ENVOYÉE.`);
            return;
          }
        }
      }
    } catch (e) {
      console.error("Erreur vérification statut envoi:", e);
    }

    // Vérifier si la facture existe déjà (Localement dans les téléchargées non envoyées)
    const existingInvoice = downloadedInvoices.find(inv =>
      inv.numero === invoiceNumber ||
      inv.numero === (firstDataItem?.data?.[0]?.numeroFacture)
    );

    if (existingInvoice) {
      // Afficher le modal avec les informations de la facture existante
      setExistingInvoiceInfo({
        numero: existingInvoice.numero,
        client: existingInvoice.client,
        date: existingInvoice.date,
        username: existingInvoice.username
      });
      setOpenDownloadModal(true);
      return;
    }

    // Continuer avec le téléchargement normal
    performDownload();
  };

  // Fonction pour gérer le tri
  const handleSort = (field) => {
    if (sortBy === field) {
      // Inverser l'ordre
      const newOrder = sortOrder === 'ASC' ? 'DESC' : 'ASC';
      setSortOrder(newOrder);
      // Forcer le rechargement avec le nouvel ordre
      setSortBy(field);
    } else {
      // Changer de champ de tri et réinitialiser l'ordre
      setSortBy(field);
      setSortOrder('ASC');
    }
  };

  // Fonction pour gérer le tri des factures envoyées
  const handleSentSort = (field) => {
    if (sentSortBy === field) {
      // Inverser l'ordre
      setSentSortOrder(sentSortOrder === 'ASC' ? 'DESC' : 'ASC');
    } else {
      setSentSortBy(field);
      setSentSortOrder('ASC');
    }
  };

  // État pour la recherche en masse
  const [bulkSearchInput, setBulkSearchInput] = useState('');
  const [foundInvoices, setFoundInvoices] = useState([]);
  const [isBulkSearching, setIsBulkSearching] = useState(false);
  const [bulkDownloadProgress, setBulkDownloadProgress] = useState({ current: 0, total: 0 });
  const [selectedInvoiceIds, setSelectedInvoiceIds] = useState([]);
  const [isBulkSending, setIsBulkSending] = useState(false);
  // Dossiers EXPORT dépliés (Set des N°Dossier ouverts dans la liste téléchargées)
  const [expandedDossiers, setExpandedDossiers] = useState(() => new Set());
  // Idem pour la liste des factures envoyées
  const [expandedSentDossiers, setExpandedSentDossiers] = useState(() => new Set());
  const [downloadType, setDownloadType] = useState('individual'); // 'individual', 'bulk' ou 'dateRange'
  const [dateRangeFrom, setDateRangeFrom] = useState('');
  const [dateRangeTo, setDateRangeTo] = useState('');
  const [invoicesByDate, setInvoicesByDate] = useState([]);
  const [dateRangeTypeFilter, setDateRangeTypeFilter] = useState('all'); // 'all', 'invoice', 'refund'
  const [isSearchingByDate, setIsSearchingByDate] = useState(false);
  const [showBulkDownloadModal, setShowBulkDownloadModal] = useState(false);
  const [templateData, setTemplateData] = useState([]); // Données du template importé
  const [importResult, setImportResult] = useState({ open: false, successCount: 0, errorCount: 0, errors: [], skippedLines: [] });
  // Nouvel état pour la sélection dans la plage de dates
  const [selectedDateRangeInvoices, setSelectedDateRangeInvoices] = useState([]);

  // États pour la résolution avoir dans le flux de recherche
  const [avoirSapResult, setAvoirSapResult] = useState(null);
  const [avoirSapSending, setAvoirSapSending] = useState(false);
  const [avoirSapDownloaded, setAvoirSapDownloaded] = useState(false);
  const [avoirResolving, setAvoirResolving] = useState(false);
  const [revalidatingAvoir, setRevalidatingAvoir] = useState(false);
  const [fetchingInitialInvoice, setFetchingInitialInvoice] = useState(false);
  const [fneSending, setFneSending] = useState(null); // null ou { numeroFacture, startedAt }
  // Modal pour proposer le téléchargement de la facture initiale absente
  const [missingInitialInvoice, setMissingInitialInvoice] = useState(null); // { numeroFacture, numeroAvoir }
  // Modal de blocage : avoir incohérent avec la facture initiale
  // (au moins un MATNR de l'avoir n'existe pas dans les items FNE de la facture initiale)
  const [itemsMismatch, setItemsMismatch] = useState(null);
  // Modal pour avoir non résolu (facture initiale introuvable automatiquement)
  const [unresolvedAvoir, setUnresolvedAvoir] = useState(null); // { numeroAvoir, commande, type, bulkAvoirIdx? }
  const [unresolvedManualInput, setUnresolvedManualInput] = useState('');
  const [unresolvedSearching, setUnresolvedSearching] = useState(false);

  // États pour le modal d'avoir (refund)
  const [refundModalOpen, setRefundModalOpen] = useState(false);
  const [confirmRefundDialogOpen, setConfirmRefundDialogOpen] = useState(false);
  const [itemsToRefundQueue, setItemsToRefundQueue] = useState([]);
  const [refundInvoice, setRefundInvoice] = useState(null);
  const [fneInvoiceData, setFneInvoiceData] = useState(null);
  const [refundQuantities, setRefundQuantities] = useState({});
  const [refundFullInvoice, setRefundFullInvoice] = useState(false); // avoir total (mêmes quantités que la facture)
  const [isLoadingFneInvoice, setIsLoadingFneInvoice] = useState(false);
  const [isSendingRefund, setIsSendingRefund] = useState(false);

  // Gérer la sélection pour l'envoi en masse
  const handleToggleSelection = (id) => {
    // Vérifier si la facture est éligible (vérifiée ou import template)
    const invoice = downloadedInvoices.find(inv => inv.id === id);
    const isTemplateImport = id && String(id).startsWith('TMP_');
    if (!invoice || (!isTemplateImport && !invoice.verified && invoice.verified !== 1 && invoice.verified !== true)) return;

    setSelectedInvoiceIds(prev => {
      // Si déjà sélectionné, on enlève
      if (prev.includes(id)) {
        return prev.filter(i => i !== id);
      }
      // Sinon on ajoute (si max 15 pas atteint)
      if (prev.length >= 15) {
        notify("Vous ne pouvez sélectionner que 15 factures maximum à la fois.");
        return prev;
      }
      return [...prev, id];
    });
  };

  // Fonction pour tout sélectionner (max 15)
  const handleSelectAll = () => {
    // Sélectionner les 15 premières factures qui ne sont pas déjà envoyées
    const availableInvoices = downloadedInvoices.filter(inv => {
      // Vérifier si elle est vérifiée (obligatoire pour l'envoi)
      const isVerified = inv.verified || inv.verified === 1 || inv.verified === true || String(inv.id).startsWith('TMP_');
      if (!isVerified) return false;

      // Vérifier si elle n'est pas déjà envoyée
      const isSent = sentInvoices.some(sent =>
        sent.numero_facture === inv.numero ||
        sent.numero_facture === inv.numeroFacture ||
        sent.numero_facture === (inv.data?.[0]?.data?.[0]?.numeroFacture) ||
        sent.numero_facture === (inv.data?.[0]?.success?.data?.[0]?.numeroFacture)
      );

      return !isSent;
    });

    const idsToSelect = availableInvoices.slice(0, 15).map(inv => inv.id);
    setSelectedInvoiceIds(idsToSelect);

    if (idsToSelect.length === 0) {
      notify("Aucune facture vérifiée et non envoyée n'est disponible pour la sélection.");
    } else if (availableInvoices.length > 15) {
      notify(`15 factures sur ${availableInvoices.length} ont été sélectionnées (limite maximale pour l'envoi).`);
    } else {
      notify(`${idsToSelect.length} factures ont été sélectionnées.`);
    }
  };

  // Envoi en masse des factures sélectionnées
  const handleBulkSend = async () => {
    if (selectedInvoiceIds.length === 0) return;

    const ok = await confirm({
      severity: 'question',
      title: 'Envoi en masse',
      message: `Voulez-vous envoyer les ${selectedInvoiceIds.length} factures sélectionnées ?`,
      confirmText: 'Envoyer',
    });
    if (!ok) return;

    setIsBulkSending(true);
    let successCount = 0;
    let failCount = 0;

    for (const id of selectedInvoiceIds) {
      const invoice = downloadedInvoices.find(inv => inv.id === id);
      if (invoice) {
        const result = await performSendInvoice(invoice, true); // true = silent
        if (result.success) {
          successCount++;
        } else {
          failCount++;
          console.error(`Échec d'envoi pour la facture ${invoice.numero}: ${result.error}`);
        }
      }
    }

    notify({
      severity: failCount === 0 ? 'success' : 'warning',
      title: 'Envoi terminé',
      message: `Succès : ${successCount}\nÉchecs : ${failCount}`,
    });
    await loadSentInvoices();
    setIsBulkSending(false);
    setSelectedInvoiceIds([]);
  };

  // Tout sélectionner ET envoyer (max 15)
  const handleSelectAllAndSend = async () => {
    // 1. Filtrer les factures éligibles
    const availableInvoices = downloadedInvoices.filter(inv => {
      const isVerified = inv.verified || inv.verified === 1 || inv.verified === true || String(inv.id).startsWith('TMP_');
      if (!isVerified) return false;
      const isSent = sentInvoices.some(sent =>
        sent.numero_facture === inv.numero ||
        sent.numero_facture === inv.numeroFacture ||
        sent.numero_facture === (inv.data?.[0]?.data?.[0]?.numeroFacture) ||
        sent.numero_facture === (inv.data?.[0]?.success?.data?.[0]?.numeroFacture)
      );
      return !isSent;
    });

    const ids = availableInvoices.slice(0, 15).map(inv => inv.id);
    if (ids.length === 0) {
      notify("Aucune facture vérifiée et non envoyée n'est disponible.");
      return;
    }

    const confirmText = availableInvoices.length > 15
      ? `Voulez-vous tout sélectionner et envoyer les 15 premières factures éligibles ?`
      : `Voulez-vous tout sélectionner et envoyer les ${ids.length} factures éligibles ?`;

    const ok = await confirm({
      severity: 'question',
      title: 'Envoi en masse',
      message: confirmText,
      confirmText: 'Envoyer',
    });
    if (!ok) return;

    setSelectedInvoiceIds(ids);
    setIsBulkSending(true);
    let successCount = 0;
    let failCount = 0;

    for (const id of ids) {
      const invoice = downloadedInvoices.find(inv => inv.id === id);
      if (invoice) {
        const result = await performSendInvoice(invoice, true);
        if (result.success) {
          successCount++;
        } else {
          failCount++;
          console.error(`Échec d'envoi pour la facture ${invoice.numero}: ${result.error}`);
        }
      }
    }

    notify({
      severity: failCount === 0 ? 'success' : 'warning',
      title: 'Envoi terminé',
      message: `Succès : ${successCount}\nÉchecs : ${failCount}`,
    });
    await loadSentInvoices();
    setIsBulkSending(false);
    setSelectedInvoiceIds([]);
  };

  // Suppression en masse des factures sélectionnées
  const handleBulkDelete = async () => {
    if (selectedInvoiceIds.length === 0) return;

    const ok = await confirm({
      severity: 'error',
      title: 'Suppression en masse',
      message: `Voulez-vous VRAIMENT supprimer les ${selectedInvoiceIds.length} factures sélectionnées ?\n\nCette action est irréversible.`,
      confirmText: 'Supprimer',
    });
    if (!ok) return;

    setIsBulkSending(true); // Using same loading state

    try {
      const response = await fetch(API_ENDPOINTS.DOWNLOADED_INVOICES.BULK_DELETE, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ ids: selectedInvoiceIds })
      });

      const result = await response.json();

      if (response.ok) {
        notify(result.message);
        await loadDownloadedInvoices();
        setSelectedInvoiceIds([]);
      } else {
        notify('Erreur lors de la suppression: ' + (result.error || result.message));
      }
    } catch (error) {
      console.error('Erreur lors de la suppression en masse:', error);
      notify('Erreur technique lors de la suppression');
    } finally {
      setIsBulkSending(false);
    }
  };


  // Détecte si une facture SAP est un avoir et tente de la résoudre via l'endpoint
  // SAP.RESOLVE_AVOIR. Réplique la logique du flux individuel (rechercherFacture)
  // pour que les flux en masse puissent attacher `_avoirResolution` lors de la sauvegarde.
  const resolveAvoirIfNeeded = async (invData, numero) => {
    const firstDataItem = Array.isArray(invData?.data) ? invData.data[0] : invData?.data;
    const fkartValue = (firstDataItem?.fkart || '').trim();
    const isAvoir = fkartValue.includes('G2') || fkartValue.includes('RE')
                 || fkartValue.includes('S1') || fkartValue.includes('CR');
    if (!isAvoir) return null;

    try {
      const resp = await fetch(API_ENDPOINTS.SAP.RESOLVE_AVOIR, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ numeroAvoir: String(numero).trim() })
      });
      const result = await resp.json();
      result.avoirData = invData;
      return result;
    } catch (err) {
      console.error(`[Avoir] Échec résolution pour ${numero}:`, err);
      return { success: false, error: err.message };
    }
  };

  // Lancer la recherche en masse
  const handleBulkSearch = async () => {
    if (!bulkSearchInput.trim()) return;

    setIsBulkSearching(true);
    setFoundInvoices([]);
    setError('');

    const invoiceNumbers = bulkSearchInput
      .split(/[\n,]+/) // Séparer par saut de ligne ou virgule
      .map(s => s.trim())
      .filter(s => s.length > 0);

    // Supprimer les doublons
    const uniqueInvoiceNumbers = [...new Set(invoiceNumbers)];

    if (uniqueInvoiceNumbers.length === 0) {
      setIsBulkSearching(false);
      return;
    }

    // Afficher un message si des doublons ont été détectés
    if (invoiceNumbers.length !== uniqueInvoiceNumbers.length) {
      const duplicateCount = invoiceNumbers.length - uniqueInvoiceNumbers.length;
      console.log(`${duplicateCount} doublon(s) détecté(s) et supprimé(s)`);
    }

    const results = [];
    const errors = [];
    const alreadyDownloaded = [];
    const alreadySent = [];

    // Traiter séquentiellement pour éviter de surcharger le serveur SAP
    for (const number of uniqueInvoiceNumbers) {
      try {
        console.log(`Recherche de la facture ${number}...`);
        const response = await axios.post(API_ENDPOINTS.SAP.SEARCH, {
          VBELN: number,
          KONV_READ: 'X'
        });

        if (response.data && response.data.success) {
          // Extraire les infos de base pour le tableau
          const invData = response.data;
          const firstDataItem = Array.isArray(invData.data) ? invData.data[0] : invData.data;
          const vbrkData = firstDataItem?.VBRK_I || firstDataItem;
          const vbpaData = Array.isArray(firstDataItem?.XVBPA) ? firstDataItem.XVBPA : [];

          // Vérifier si déjà téléchargée
          const invoiceNumber = vbrkData?.numeroFacture || firstDataItem?.numeroFacture || number;
          const existing = downloadedInvoices.find(inv => inv.numero === invoiceNumber);

          // Charger les modifications existantes
          await loadInvoiceModifications(invoiceNumber);

          // Récupérer l'adresse client si le KUNNR est présent
          const kunnr = firstDataItem.kunnr || vbrkData.KUNNR || (vbpaData.find(p => p.PARVW === 'AG')?.KUNNR);
          if (kunnr) {
            try {
              const resAddr = await axios.get(`${API_ENDPOINTS.SAP.CLIENT_ADDRESS}/${kunnr}`);
              if (resAddr.data && resAddr.data.success && resAddr.data.data) {
                const addr = Array.isArray(resAddr.data.data) ? resAddr.data.data[0] : resAddr.data.data;
                const { SMTP_ADDR, TELF1 } = addr || {};

                if (SMTP_ADDR || TELF1) {
                  // Mettre à jour les données dans invData
                  if (Array.isArray(invData.data)) {
                    invData.data = invData.data.map(line => ({
                      ...line,
                      clientEmail: SMTP_ADDR || line.clientEmail || '',
                      clientPhone: TELF1 || line.clientPhone || '',
                      ClientEmail: SMTP_ADDR || line.ClientEmail || '',
                      ClientPhone: TELF1 || line.ClientPhone || ''
                    }));
                  } else if (invData.data?.data) {
                    invData.data.data = invData.data.data.map(line => ({
                      ...line,
                      clientEmail: SMTP_ADDR || line.clientEmail || '',
                      clientPhone: TELF1 || line.clientPhone || '',
                      ClientEmail: SMTP_ADDR || line.ClientEmail || '',
                      ClientPhone: TELF1 || line.ClientPhone || ''
                    }));
                  }
                }
              }
            } catch (err) {
              console.error(`Erreur adresse client pour ${number}:`, err);
            }
          }

          const avoirResolution = await resolveAvoirIfNeeded(invData, invoiceNumber);
          let bulkStatus = existing ? 'already_downloaded' : 'found';
          if (avoirResolution && !avoirResolution.success) {
            bulkStatus = 'avoir_unresolved';
          }

          results.push({
            numero: invoiceNumber,
            client: firstDataItem?.data?.[0]?.nomClient ||
              firstDataItem?.nomClient ||
              (vbpaData.find(p => p.PARVW === 'AG')?.NAME1) ||
              (vbpaData[0]?.NAME1) ||
              'Client inconnu',
            data: invData,
            avoirResolution,
            status: bulkStatus
          });
        } else {
          errors.push(number);
        }
      } catch (err) {
        console.error(`Erreur pour la facture ${number}:`, err);
        // Vérifier le message d'erreur pour distinguer les cas
        if (err.response?.data?.message?.includes('déjà été téléchargée et envoyée')) {
          alreadySent.push(number);
        } else if (err.response?.data?.message?.includes('déjà été téléchargée')) {
          alreadyDownloaded.push(number);
        } else {
          errors.push(number);
        }
      }
    }

    setFoundInvoices(results);
    setIsBulkSearching(false);

    // Construire le message d'erreur
    const errorMessages = [];
    if (errors.length > 0) {
      errorMessages.push(`${errors.length} facture(s) non trouvée(s): ${errors.join(', ')}`);
    }
    if (alreadyDownloaded.length > 0) {
      errorMessages.push(`${alreadyDownloaded.length} facture(s) déjà téléchargée(s): ${alreadyDownloaded.join(', ')}`);
    }
    if (alreadySent.length > 0) {
      errorMessages.push(`${alreadySent.length} facture(s) déjà téléchargée(s) et envoyée(s): ${alreadySent.join(', ')}`);
    }

    if (errorMessages.length > 0) {
      setError(errorMessages.join('\n'));
    } else if (results.length === 0) {
      setError('Aucune facture trouvée');
    }
  };

  // Télécharger toutes les factures trouvées
  // Pour les avoirs dont la facture initiale n'est pas en FNE :
  //   on récupère automatiquement la facture initiale depuis SAP, on l'ajoute à
  //   la liste (insérée AVANT l'avoir) et on marque l'avoir "awaiting_initial".
  const handleBulkDownload = async () => {
    if (foundInvoices.length === 0) return;

    setShowBulkDownloadModal(true);
    setBulkDownloadProgress({ current: 0, total: foundInvoices.length });

    // Snapshot mutable pour itérer sur l'ordre initial
    let workingList = [...foundInvoices];
    const insertedInitials = new Set(); // pour éviter de fetch 2x la même initiale
    const awaitingAvoirs = []; // résumé final
    const normalBatch = []; // factures normales -> enregistrées en 1 seul appel /bulk

    for (let i = 0; i < workingList.length; i++) {
      const inv = workingList[i];

      // Skip statuts déjà finalisés
      if (inv.status === 'already_downloaded' || inv.status === 'success' ||
          inv.status === 'avoir_unresolved' || inv.status === 'awaiting_initial') {
        setBulkDownloadProgress(prev => ({ ...prev, current: i + 1 }));
        continue;
      }

      // ─── Cas critique : avoir bloqué SANS facture initiale identifiée → on saute et on logue ───
      if (inv.avoirResolution && inv.avoirResolution.success === false && !inv.avoirResolution.avoir?.factureInitiale) {
        console.warn(`Avoir ${inv.numero} non résolu (pas de factureInitiale) — skip silencieux`);
        setFoundInvoices(prev => {
          const up = [...prev];
          const i = up.findIndex(x => x.numero === inv.numero);
          if (i >= 0) up[i] = { ...up[i], status: 'avoir_unresolved' };
          return up;
        });
        setBulkDownloadProgress(prev => ({ ...prev, current: i + 1 }));
        continue;
      }

      // ─── Cas avoir bloqué AVEC facture initiale identifiée : auto-fetch ───
      if (inv.avoirResolution && inv.avoirResolution.success === false && inv.avoirResolution.avoir?.factureInitiale) {
        const initialNum = inv.avoirResolution.avoir.factureInitiale;
        const alreadyInList = workingList.some(f => f.numero === initialNum);

        if (!alreadyInList && !insertedInitials.has(initialNum)) {
          insertedInitials.add(initialNum);
          try {
            const respInit = await axios.post(API_ENDPOINTS.SAP.SEARCH, {
              VBELN: initialNum,
              KONV_READ: 'X'
            });
            if (respInit.data && respInit.data.success) {
              const invDataInit = respInit.data;
              const firstInit = Array.isArray(invDataInit.data) ? invDataInit.data[0] : invDataInit.data;
              const vbpaInit = Array.isArray(firstInit?.XVBPA) ? firstInit.XVBPA : [];
              const existing = downloadedInvoices.find(d => String(d.numero) === String(initialNum));

              const initialRow = {
                numero: initialNum,
                client: firstInit?.nomClient ||
                  (vbpaInit.find(p => p.PARVW === 'AG')?.NAME1) ||
                  (vbpaInit[0]?.NAME1) ||
                  'Client inconnu',
                data: invDataInit,
                avoirResolution: null,
                status: existing ? 'already_downloaded' : 'found',
                isInitialOf: inv.numero,
              };

              // Insérer dans la liste réactive ET dans la liste de travail
              setFoundInvoices(prev => {
                const up = [...prev];
                const avoirIdx = up.findIndex(x => x.numero === inv.numero);
                if (avoirIdx >= 0) {
                  up.splice(avoirIdx, 0, initialRow);
                  up[avoirIdx + 1] = { ...up[avoirIdx + 1], status: 'awaiting_initial', linkedInitial: initialNum };
                }
                return up;
              });
              workingList.splice(i, 0, initialRow);
              workingList[i + 1] = { ...workingList[i + 1], status: 'awaiting_initial', linkedInitial: initialNum };
              awaitingAvoirs.push({ avoir: inv.numero, initial: initialNum });
              // On ne télécharge pas l'avoir pour l'instant ; on continuera à
              // l'élément suivant qui pourrait être la facture initiale fraîchement insérée.
              setBulkDownloadProgress(prev => ({ ...prev, total: workingList.length }));
              continue;
            }
          } catch (errInit) {
            console.error(`Erreur récupération facture initiale ${initialNum}:`, errInit);
          }
        }
        // Si on n'a pas pu fetch ou si l'initiale est déjà en cours, on marque awaiting
        setFoundInvoices(prev => {
          const up = [...prev];
          const idx = up.findIndex(x => x.numero === inv.numero);
          if (idx >= 0) up[idx] = { ...up[idx], status: 'awaiting_initial', linkedInitial: initialNum };
          return up;
        });
        workingList[i] = { ...workingList[i], status: 'awaiting_initial', linkedInitial: initialNum };
        awaitingAvoirs.push({ avoir: inv.numero, initial: initialNum });
        setBulkDownloadProgress(prev => ({ ...prev, current: i + 1 }));
        continue;
      }

      // ─── Téléchargement normal → ajouté au LOT (envoyé en 1 seul appel après la boucle) ───
      try {
        normalBatch.push(buildDownloadPayload(inv.data, inv.avoirResolution));
      } catch (err) {
        console.error(`Erreur préparation du téléchargement de ${inv.numero}:`, err);
        setFoundInvoices(prev => {
          const updated = [...prev];
          const idx = updated.findIndex(x => x.numero === inv.numero);
          if (idx >= 0) updated[idx] = { ...updated[idx], status: 'error' };
          return updated;
        });
      }
      setBulkDownloadProgress(prev => ({ ...prev, current: i + 1 }));
    }

    // ─── Envoi du LOT en UN SEUL appel réseau (au lieu de 2 requêtes par facture) ───
    if (normalBatch.length > 0) {
      try {
        const resp = await fetch(API_ENDPOINTS.DOWNLOADED_INVOICES.BULK, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: user?.username, invoices: normalBatch }),
        });
        const result = await resp.json().catch(() => ({}));
        const statusByNumero = {};
        (result.results || []).forEach(r => {
          statusByNumero[r.numero] = (r.status === 'created' || r.status === 'already_downloaded') ? 'success' : 'error';
        });
        setFoundInvoices(prev => prev.map(x =>
          statusByNumero[x.numero] ? { ...x, status: statusByNumero[x.numero] } : x
        ));
      } catch (e) {
        console.error('Erreur téléchargement en masse (bulk):', e);
        const batchNums = new Set(normalBatch.map(p => p.numero));
        setFoundInvoices(prev => prev.map(x => batchNums.has(x.numero) ? { ...x, status: 'error' } : x));
      }
    }

    await loadDownloadedInvoices();

    if (awaitingAvoirs.length > 0) {
      const lines = awaitingAvoirs.map(b => `  • Avoir ${b.avoir} → facture initiale ${b.initial}`).join('\n');
      notify({
        severity: 'warning',
        title: 'Avoirs en attente',
        message:
          `${awaitingAvoirs.length} avoir(s) en attente.\n` +
          `Leur facture initiale a été ajoutée à la liste — télécharge-la et envoie-la à la FNE, ` +
          `puis retente le téléchargement de l'avoir :\n\n${lines}`,
      });
    }

    setTimeout(() => {
      setBulkDownloadProgress({ current: 0, total: 0 });
      setShowBulkDownloadModal(false);
    }, 2000);
  };

  // Gestion de la sélection dans la plage de dates
  const handleDateRangeSelection = (numero) => {
    setSelectedDateRangeInvoices(prev => {
      if (prev.includes(numero)) {
        return prev.filter(n => n !== numero);
      }
      // Limite de 50 pour le téléchargement
      if (prev.length >= 50) {
        notify("Vous ne pouvez sélectionner que 50 factures maximum à la fois.");
        return prev;
      }
      return [...prev, numero];
    });
  };

  const handleDateRangeSelectAll = () => {
    const selectable = filteredInvoicesByDate.filter(inv => inv.status !== 'already_downloaded' && inv.status !== 'success');
    const available = selectable.slice(0, 50).map(inv => inv.numero);

    if (available.length === 0) {
      notify("Aucune facture disponible pour la sélection (déjà téléchargées ou aucune trouvée).");
      return;
    }

    if (selectable.length > 50) {
      notify("50 factures ont été sélectionnées (limite maximale).");
    }

    setSelectedDateRangeInvoices(available);
  };

  // Télécharger UNE seule facture depuis la liste bulk (foundInvoices)
  // Pour un avoir bloqué : ouvre le modal d'info "facture initiale manquante"
  // avec un bouton qui récupère et insère l'initiale dans la liste bulk.
  // Pour la 2ᵉ tentative sur le même avoir, le backend resolve-avoir vérifie
  // que l'initiale est bien envoyée à la FNE et donne une erreur claire sinon.
  const handleDownloadOneFromBulk = async (idx) => {
    const inv = foundInvoices[idx];
    if (!inv) return;
    if (inv.status === 'already_downloaded' || inv.status === 'success') return;

    try {
      // ─── Cas avoir bloqué avec facture initiale identifiée : modal d'aide ───
      if (inv.avoirResolution && inv.avoirResolution.success === false && inv.avoirResolution.avoir?.factureInitiale) {
        const initialNum = inv.avoirResolution.avoir.factureInitiale;
        const errorCode = inv.avoirResolution.error || 'INITIAL_NOT_SENT';
        const isOnlyNotSent = errorCode === 'INITIAL_NOT_SENT';
        setMissingInitialInvoice({
          numeroFacture: initialNum,
          numeroAvoir: inv.numero,
          bulkAvoirIdx: idx,
          reason: errorCode,
          alreadyDownloaded: isOnlyNotSent,
        });
        return;
      }

      // ─── Cas critique : avoir bloqué SANS facture initiale identifiée → modal de saisie ───
      if (inv.avoirResolution && inv.avoirResolution.success === false) {
        setUnresolvedAvoir({
          numeroAvoir: inv.numero,
          commande: inv.avoirResolution.avoir?.commande || null,
          type: inv.avoirResolution.avoir?.type || null,
          bulkAvoirIdx: idx,
        });
        return;
      }

      // ─── Téléchargement normal ───
      setFoundInvoices(prev => {
        const up = [...prev];
        up[idx] = { ...up[idx], status: 'downloading' };
        return up;
      });
      await performDownload(inv.data, false, inv.avoirResolution);
      setFoundInvoices(prev => {
        const up = [...prev];
        up[idx] = { ...up[idx], status: 'success' };
        return up;
      });
      await loadDownloadedInvoices();
    } catch (err) {
      console.error(`Erreur téléchargement individuel ${inv.numero}:`, err);
      setFoundInvoices(prev => {
        const up = [...prev];
        up[idx] = { ...up[idx], status: 'error' };
        return up;
      });
    }
  };

  // Récupère la facture initiale et l'insère dans la liste bulk juste avant l'avoir.
  // Si la facture initiale est DÉJÀ téléchargée localement (downloadedInvoices),
  // on l'ajoute à la liste bulk avec son data local pour que le user voie la dépendance.
  const fetchAndInsertInitialInBulk = async (initialNum, avoirIdx, avoirNumero) => {
    console.log(`[fetchAndInsertInitialInBulk] initialNum=${initialNum}, avoirNumero=${avoirNumero}`);
    try {
      // 1) Déjà dans la liste bulk ?
      const alreadyInList = foundInvoices.some(f => f.numero === initialNum);
      if (alreadyInList) {
        setFoundInvoices(prev => {
          const up = [...prev];
          const i = up.findIndex(x => x.numero === avoirNumero);
          if (i >= 0) up[i] = { ...up[i], status: 'awaiting_initial', linkedInitial: initialNum };
          return up;
        });
        notify(`La facture initiale ${initialNum} est déjà dans la liste plus haut. Télécharge-la puis envoie-la à la FNE.`);
        return;
      }

      // 2) Déjà dans Factures Téléchargées (en local) ?
      const localExisting = downloadedInvoices.find(d => String(d.numero) === String(initialNum));
      if (localExisting) {
        // Insérer un row "déjà téléchargée" + marquer l'avoir en attente
        const initialRow = {
          numero: initialNum,
          client: localExisting.client || 'Client inconnu',
          data: localExisting.data,
          avoirResolution: null,
          status: 'already_downloaded',
          isInitialOf: avoirNumero,
        };
        setFoundInvoices(prev => {
          const up = [...prev];
          const insertAt = up.findIndex(x => x.numero === avoirNumero);
          if (insertAt >= 0) {
            up.splice(insertAt, 0, initialRow);
            up[insertAt + 1] = { ...up[insertAt + 1], status: 'awaiting_initial', linkedInitial: initialNum };
          } else {
            up.push(initialRow);
          }
          return up;
        });
        notify({
          severity: 'success',
          title: 'Facture initiale déjà téléchargée',
          message:
            `La facture initiale ${initialNum} est déjà téléchargée localement.\n\n` +
            `Va dans "Factures Téléchargées", envoie-la à la FNE, puis retente l'avoir ${avoirNumero}.`,
        });
        return;
      }

      // 3) Sinon : aller la chercher dans SAP
      let respInit;
      try {
        respInit = await axios.post(API_ENDPOINTS.SAP.SEARCH, {
          VBELN: initialNum,
          KONV_READ: 'X'
        });
      } catch (axiosErr) {
        // 409 = déjà téléchargée OU déjà envoyée
        const status = axiosErr.response?.status;
        const msg = axiosErr.response?.data?.message || axiosErr.message;
        console.error(`SAP_SEARCH ${initialNum} a renvoyé ${status}:`, msg);
        if (status === 409) {
          notify({
            severity: 'warning',
            title: 'Facture déjà téléchargée',
            message:
              `La facture ${initialNum} est déjà téléchargée côté serveur.\n\n` +
              `Va dans "Factures Téléchargées" pour la retrouver, envoie-la à la FNE, puis retente l'avoir ${avoirNumero}.`,
          });
          await loadDownloadedInvoices();
        } else {
          notify(`Erreur lors de la recherche SAP de ${initialNum} : ${msg}`);
        }
        return;
      }

      if (!respInit.data?.success) {
        notify(`Impossible de récupérer la facture initiale ${initialNum} depuis SAP. Vérifie le numéro.`);
        return;
      }

      const invDataInit = respInit.data;
      const firstInit = Array.isArray(invDataInit.data) ? invDataInit.data[0] : invDataInit.data;
      const vbpaInit = Array.isArray(firstInit?.XVBPA) ? firstInit.XVBPA : [];

      const initialRow = {
        numero: initialNum,
        client: firstInit?.nomClient
          || (vbpaInit.find(p => p.PARVW === 'AG')?.NAME1)
          || (vbpaInit[0]?.NAME1)
          || 'Client inconnu',
        data: invDataInit,
        avoirResolution: null,
        status: 'found',
        isInitialOf: avoirNumero,
      };

      setFoundInvoices(prev => {
        const up = [...prev];
        const insertAt = up.findIndex(x => x.numero === avoirNumero);
        if (insertAt >= 0) {
          up.splice(insertAt, 0, initialRow);
          up[insertAt + 1] = { ...up[insertAt + 1], status: 'awaiting_initial', linkedInitial: initialNum };
        } else {
          up.push(initialRow);
        }
        return up;
      });

      notify({
        severity: 'success',
        title: 'Facture initiale ajoutée',
        message:
          `Facture initiale ${initialNum} ajoutée à la liste.\n\n` +
          `Étapes :\n1. Télécharge la facture ${initialNum}\n2. Envoie-la à la FNE\n3. Retente l'avoir ${avoirNumero}`,
      });
    } catch (err) {
      console.error(`Erreur récupération facture initiale ${initialNum}:`, err);
      notify(`Erreur lors de la récupération de la facture initiale ${initialNum} : ${err.message}`);
    }
  };

  const handleDownloadSelectedDateRange = async () => {
    if (selectedDateRangeInvoices.length === 0) return;

    const okDownload = await confirm({
      severity: 'question',
      title: 'Téléchargement en masse',
      message: `Voulez-vous télécharger les ${selectedDateRangeInvoices.length} factures sélectionnées ?`,
      confirmText: 'Télécharger',
    });
    if (!okDownload) return;

    setShowBulkDownloadModal(true);
    setBulkDownloadProgress({ current: 0, total: selectedDateRangeInvoices.length });

    const blockedAvoirs = []; // { avoir, initial }

    for (let i = 0; i < selectedDateRangeInvoices.length; i++) {
      const numero = selectedDateRangeInvoices[i];
      try {
        const response = await axios.post(API_ENDPOINTS.SAP.SEARCH, {
          VBELN: numero,
          KONV_READ: 'X'
        });

        if (response.data && response.data.success) {
          const avoirResolution = await resolveAvoirIfNeeded(response.data, numero);
          if (avoirResolution && !avoirResolution.success) {
            setInvoicesByDate(prev => prev.map(item =>
              item.numero === numero ? { ...item, status: 'avoir_unresolved' } : item
            ));
            const initial = avoirResolution?.avoir?.factureInitiale;
            if (initial) blockedAvoirs.push({ avoir: numero, initial });
            setBulkDownloadProgress(prev => ({ ...prev, current: i + 1 }));
            continue;
          }
          await performDownload(response.data, true, avoirResolution);
          setInvoicesByDate(prev => prev.map(item =>
            item.numero === numero ? { ...item, status: 'success' } : item
          ));
        }
      } catch (err) {
        console.error(`Erreur téléchargement ${numero}:`, err);
        setInvoicesByDate(prev => prev.map(item =>
          item.numero === numero ? { ...item, status: 'error' } : item
        ));
      }
      setBulkDownloadProgress(prev => ({ ...prev, current: i + 1 }));
    }

    await loadDownloadedInvoices();
    setSelectedDateRangeInvoices([]); // Réinitialiser la sélection

    // Résumé des avoirs bloqués
    if (blockedAvoirs.length > 0) {
      const lines = blockedAvoirs.map(b => `  • Avoir ${b.avoir} → facture initiale ${b.initial}`).join('\n');
      notify({
        severity: 'warning',
        title: 'Avoirs non téléchargés',
        message:
          `${blockedAvoirs.length} avoir(s) non téléchargé(s) — leur facture initiale doit être téléchargée ET envoyée à la FNE d'abord :\n\n${lines}`,
      });
    }

    setTimeout(() => {
      setBulkDownloadProgress({ current: 0, total: 0 });
      setShowBulkDownloadModal(false);
    }, 2000);
  };

  // Détermine si une facture de la plage de dates est un avoir (selon le FKART)
  // Liste stricte des codes FKART SAP considérés comme avoir chez NPG :
  //   - ZRE : avoir client principal (le plus fréquent)
  //   - G2  : note de crédit standard SAP
  //   - S1  : facture d'annulation
  // On fait une égalité STRICTE pour éviter les faux positifs (ex: 'RES' ne doit pas matcher 'RE').
  const AVOIR_FKART_CODES = ['ZRE', 'G2', 'ZG2', 'S1', 'ZS1', 'CR', 'ZCR', 'IG', 'L2', 'ZL2'];
  const isAvoirType = (fkart) => {
    const v = (fkart || '').toString().trim().toUpperCase();
    if (AVOIR_FKART_CODES.includes(v)) return true;
    // Match large : tout code se terminant par G2, RE, S1, CR
    return v.endsWith('G2') || v.endsWith('RE') || v.endsWith('S1') || v.endsWith('CR');
  };

  // Factures filtrées selon le type sélectionné
  const filteredInvoicesByDate = invoicesByDate.filter(inv => {
    if (dateRangeTypeFilter === 'all') return true;
    const isAvoir = isAvoirType(inv.type);
    return dateRangeTypeFilter === 'refund' ? isAvoir : !isAvoir;
  });

  // Rechercher des factures par plage de dates
  const handleDateRangeSearch = async () => {
    if (!dateRangeFrom || !dateRangeTo) {
      notify("Veuillez sélectionner une date de début et une date de fin");
      return;
    }

    setIsSearchingByDate(true);
    setInvoicesByDate([]);
    setError('');

    try {
      const response = await axios.post(API_ENDPOINTS.SAP.INVOICES_BY_DATE, {
        startDate: dateRangeFrom,
        endDate: dateRangeTo
      });

      if (response.data && response.data.success) {
        const invoices = response.data.data || [];
        // Vérifier si déjà téléchargées
        const processedInvoices = invoices.map(inv => {
          const existing = downloadedInvoices.find(d => String(d.numero) === String(inv.numero));
          return {
            ...inv,
            status: existing ? 'already_downloaded' : 'found'
          };
        });
        setInvoicesByDate(processedInvoices);
        if (processedInvoices.length === 0) {
          setError("Aucune facture trouvée pour cette période");
        }
      } else {
        setError(response.data.message || "Erreur lors de la recherche");
      }
    } catch (err) {
      console.error("Erreur recherche par date:", err);
      setError("Erreur de communication avec SAP");
    } finally {
      setIsSearchingByDate(false);
    }
  };



  // Naviguer vers la facture suivante
  const handleNextInvoice = () => {
    const list = downloadedInvoices;
    const idx = list.findIndex(inv => inv.id === selectedInvoice?.id);
    if (idx !== -1 && idx < list.length - 1) {
      handleViewInvoice(list[idx + 1]);
    }
  };

  // Naviguer vers la facture précédente
  const handlePrevInvoice = () => {
    const list = downloadedInvoices;
    const idx = list.findIndex(inv => inv.id === selectedInvoice?.id);
    if (idx > 0) {
      handleViewInvoice(list[idx - 1]);
    }
  };

  // Afficher une facture téléchargée
  const handleViewInvoice = async (invoice) => {
    // Marquer comme vérifiée si ce n'est pas déjà le cas
    if (invoice.id && (!invoice.verified && invoice.verified !== 1 && invoice.verified !== true)) {
      try {
        await axios.put(API_ENDPOINTS.VERIFY_INVOICE(invoice.id), { verified: true });

        // Mettre à jour l'état local
        invoice.verified = true;
        setDownloadedInvoices(prev => prev.map(inv =>
          inv.id === invoice.id ? { ...inv, verified: true } : inv
        ));
      } catch (err) {
        console.error("Erreur lors de la vérification de la facture:", err);
      }
    }

    console.log('=== DONNÉES COMPLÈTES DE LA FACTURE ===');
    console.log('Structure complète de la facture:', JSON.parse(JSON.stringify(invoice)));
    console.log('=== FIN DES DONNÉES DE LA FACTURE ===');

    // Charger les modifications inline pour cette facture
    const invoiceNumber = invoice.numero || invoice.numeroFacture || 'N/A';
    try {
      const response = await fetch(API_ENDPOINTS.INLINE_FIELDS.BY_INVOICE(invoiceNumber), {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });

      if (response.ok) {
        const result = await response.json();
        if (result.success && result.data) {
          const modifications = {};
          result.data.forEach(mod => {
            const key = `${mod.invoice_number}_${mod.field_name}`;
            modifications[key] = mod.new_value;
          });
          setFieldModifications(prev => ({ ...prev, ...modifications }));
          console.log('Modifications inline chargées:', modifications);

          // Forcer la mise à jour des données de la facture avec les modifications
          if (invoice.data && invoice.data[0] && invoice.data[0].data) {
            invoice.data[0].data = invoice.data[0].data.map(item => {
              const modifiedItem = { ...item };
              result.data.forEach(mod => {
                if (mod.field_name === 'ClientEmail') modifiedItem.clientEmail = mod.new_value;
                if (mod.field_name === 'ClientPhone') modifiedItem.clientPhone = mod.new_value;
                if (mod.field_name === 'Template') modifiedItem.template = mod.new_value;
                if (mod.field_name === 'PaymentMethod') modifiedItem.paymentMethod = mod.new_value;
                if (mod.field_name === 'InvoiceType') modifiedItem.invoiceType = mod.new_value;
                if (mod.field_name === 'isRne') modifiedItem.isRne = mod.new_value;
                if (mod.field_name === 'PointOfSale') modifiedItem.pointOfSale = mod.new_value;
              });
              return modifiedItem;
            });
          }
        }
      }
    } catch (error) {
      console.error('Erreur lors du chargement des modifications inline:', error);
    }

    // S'assurer que les données sont correctement formatées
    // Pour les factures SAP : données dans invoice.data[0].data
    // Pour les factures importées : données directes avec source === 'template_import'
    const rawDataItem = Array.isArray(invoice.data) ? invoice.data[0] : invoice.data;
    const firstDataItem = invoice.data?.[0]?.data?.[0] || rawDataItem || {};

    console.log('=== EXTRACTION POUR AFFICHAGE ===');
    console.log('invoice.data:', invoice.data);
    console.log('invoice.data[0]:', invoice.data?.[0]);
    console.log('invoice.data[0].data:', invoice.data?.[0]?.data);
    console.log('firstDataItem:', firstDataItem);
    console.log('Clés de firstDataItem:', Object.keys(firstDataItem));
    console.log('numeroFacture extrait:', firstDataItem.numeroFacture);
    console.log('nomClient extrait:', firstDataItem.nomClient);

    const isTemplateImport = firstDataItem?.source === 'template_import';

    // Gestion spécifique des factures importées (template CSV)
    if (isTemplateImport) {
      console.log('=== FACTURE IMPORTÉE (TEMPLATE) ===');

      const safeNumber = (val) => {
        if (val === undefined || val === null || val === '') return 0;
        const clean = String(val).replace(/[\s\u00A0]/g, '').replace(',', '.');
        const n = Number(clean);
        return isNaN(n) ? 0 : n;
      };

      // Récupérer toutes les lignes de la facture importée
      const templateLines = Array.isArray(rawDataItem)
        ? rawDataItem
        : Array.isArray(invoice.data)
          ? invoice.data
          : rawDataItem && Array.isArray(rawDataItem.data)
            ? rawDataItem.data
            : [firstDataItem];

      // Calculer les totaux sur l'ensemble des lignes
      let totalHTRaw = 0;
      let totalNetHTRaw = 0;
      let montantTVARaw = 0;
      let montantAIRSIRaw = 0;
      let tvaPct = 0;
      let otherTaxPct = 0;

      templateLines.forEach(line => {
        const quantity = safeNumber(line.quantity || line.Qte);
        const unitPrice = safeNumber(line.pu_ht || line.PU_HT);
        const remPct = safeNumber(line.rem_pct || line.Rem_Pct);
        const lineTvaPct = safeNumber(line.tva || line.TVA);
        const lineOtherTaxPct = safeNumber(line.other_tax_pct || line.OtherTaxPct);

        const lineTotalHT = quantity * unitPrice;
        const lineTotalNetHT = lineTotalHT * (1 - remPct / 100);
        const lineMontantTVA = lineTotalNetHT * (lineTvaPct / 100);
        // AIRSI calculé sur le Total TTC (Net HT + TVA)
        const lineMontantAIRSI = (lineTotalNetHT + lineMontantTVA) * (lineOtherTaxPct / 100);

        totalHTRaw += lineTotalHT;
        totalNetHTRaw += lineTotalNetHT;
        montantTVARaw += lineMontantTVA;
        montantAIRSIRaw += lineMontantAIRSI;

        // On prend le dernier taux non nul trouvé (hypothèse: même taux sur toutes les lignes)
        if (lineTvaPct) tvaPct = lineTvaPct;
        if (lineOtherTaxPct) otherTaxPct = lineOtherTaxPct;
      });

      const totalTTCRaw = totalNetHTRaw + montantTVARaw + montantAIRSIRaw;

      // Pour les factures importées, les montants ne doivent PAS être divisés par 1000 (standard FCFA)
      const div = 1;
      const totalHT = totalHTRaw / div;
      const totalNetHT = totalNetHTRaw / div;
      const montantTVA = montantTVARaw / div;
      const montantAIRSI = montantAIRSIRaw / div;
      const totalTTC = totalTTCRaw / div;

      const templateTotals = {
        totalHT,
        totalNetHT,
        montantTVA,
        totalTTC,
        montantAIRSI,
        totalAPayer: totalTTC,
        taxData: [
          {
            typeTaxe: 'TVA',
            baseTaxe: totalNetHT,
            taux: tvaPct,
            montant: montantTVA
          },
          ...(montantAIRSI > 0
            ? [{
              typeTaxe: templateLines[0]?.other_tax_name || 'AIRSI',
              baseTaxe: totalNetHT + montantTVA,
              taux: otherTaxPct,
              montant: montantAIRSI
            }]
            : [])
        ]
      };

      const formattedTemplateInvoice = {
        ...invoice,
        numero: invoice.numero || invoice.data?.[0]?.reference || 'N/A',
        client: invoice.client || invoice.data?.[0]?.client_name || 'Client inconnu',
        data: {
          success: true,
          data: templateLines
        }
      };

      setSelectedInvoice(formattedTemplateInvoice);
      setFacture({
        success: true,
        message: 'Facture importée depuis le template',
        data: formattedTemplateInvoice.data,
        numero: formattedTemplateInvoice.numero,
        client: formattedTemplateInvoice.client,
        totaux: templateTotals
      });
      try {
        const rawData = formattedTemplateInvoice.data;
        const lignes = Array.isArray(rawData?.data)
          ? rawData.data
          : Array.isArray(rawData)
            ? rawData
            : rawData?.data
              ? [rawData.data]
              : rawData
                ? [rawData]
                : [];
        console.log('Lignes de facture au moment de l\'affichage des détails (template import):', lignes);
      } catch (e) {
        console.warn('Impossible de logger les lignes de facture (template import):', e);
      }
      setIsDetailViewMode(true);
      window.scrollTo(0, 0);
      return;
    }

    const formattedInvoice = {
      ...invoice,
      // Extraire depuis les données de facture formatées (direct depuis sap_vbrk_header)
      numero: firstDataItem.numeroFacture || invoice.numero || 'N/A',
      client: firstDataItem.nomClient || invoice.client || 'Client inconnu',
      data: invoice.data || [invoice] // Si les données sont à la racine, on les met dans un tableau
    };

    // Calculer les totaux à partir des données des lignes XVBRP ou des champs normalisés
    const calculateTotals = (invoiceData) => {
      if (!invoiceData) {
        return {};
      }

      // S'assurer d'avoir un tableau de lignes, même si les données sont encapsulées
      let lines = [];
      if (Array.isArray(invoiceData)) {
        // Si c'est un tableau, vérifier si le premier élément est un wrapper SAP {success: true, data: [...]}
        if (invoiceData[0] && Array.isArray(invoiceData[0].data)) {
          lines = invoiceData[0].data;
        } else if (invoiceData[0] && invoiceData[0].success && Array.isArray(invoiceData[0].data)) {
          lines = invoiceData[0].data;
        } else {
          lines = invoiceData;
        }
      } else if (invoiceData.data && Array.isArray(invoiceData.data)) {
        lines = invoiceData.data;
      } else if (invoiceData.success && Array.isArray(invoiceData.data)) {
        lines = invoiceData.data;
      } else {
        lines = [invoiceData];
      }

      let totalHT = 0;
      let totalNetHT = 0;
      let montantTVA = 0;
      let totalTTC = 0;
      let montantAIRSI = 0;
      const taxData = [];

      // Parcourir les lignes pour accéder à XVBRP ou calculer à partir des prix unitaires
      lines.forEach(item => {
        // Les données XVBRP peuvent être dans item.XVBRP
        const xvbrpArray = item.XVBRP || [];

        if (Array.isArray(xvbrpArray) && xvbrpArray.length > 0) {
          xvbrpArray.forEach(vbrpItem => {
            // TOTAL HT : somme de tous les KZWI1 * 100
            if (vbrpItem.KZWI1) {
              totalHT += parseFloat(vbrpItem.KZWI1) * 100;
            }

            // TOTAL NET HT : somme de tous les NETWR * 100
            if (vbrpItem.NETWR) {
              totalNetHT += parseFloat(vbrpItem.NETWR) * 100;
            }
          });
        } else {
          // FALLBACK : Calculer à partir des champs normalisés pour les factures envoyées/sauvegardées
          const cleanPu = String(item.PU_HT || item.pu_ht || item.prixUnitaireHT || item.prix_unitaire_ht || 0).replace(/[\s\u00A0]/g, '').replace(',', '.');
          const puHt = Number(cleanPu) || 0;
          const cleanQte = String(item.quantite || item.quantity || 0).replace(/[\s\u00A0]/g, '').replace(',', '.');
          const qte = Number(cleanQte) || 0;
          const cleanRem = String(item.Rem_Pct || item.rem_pct || item.remisePct || 0).replace(/[\s\u00A0]/g, '').replace(',', '.');
          const remPct = Number(cleanRem) || 0;

          const lineHT = puHt * qte;
          const lineNetHT = lineHT * (1 - remPct / 100);

          totalHT += lineHT;
          totalNetHT += lineNetHT;
        }
      });

      // TVA (18% par défaut sur le total net HT si non spécifié par ligne)
      // On vérifie d'abord si on peut calculer la TVA ligne par ligne
      let calculatedTva = 0;
      let hasLineTva = false;

      lines.forEach(item => {
        const tvaPctLine = Number(String(item.TVA || item.tva || 0).replace(/[\s\u00A0]/g, '').replace(',', '.')) || 0;
        if (tvaPctLine > 0) {
          hasLineTva = true;
          const cleanPu = String(item.PU_HT || item.pu_ht || item.prixUnitaireHT || item.prix_unitaire_ht || 0).replace(/[\s\u00A0]/g, '').replace(',', '.');
          const puHt = Number(cleanPu) || 0;
          const cleanQte = String(item.quantite || item.quantity || 0).replace(/[\s\u00A0]/g, '').replace(',', '.');
          const qte = Number(cleanQte) || 0;
          const cleanRem = String(item.Rem_Pct || item.rem_pct || item.remisePct || 0).replace(/[\s\u00A0]/g, '').replace(',', '.');
          const remPct = Number(cleanRem) || 0;
          const lineNetHT = (puHt * qte) * (1 - remPct / 100);
          calculatedTva += lineNetHT * (tvaPctLine / 100);
        }
      });

      if (hasLineTva) {
        montantTVA = calculatedTva;
      } else {
        // Pour les templates, utiliser la première valeur de TVA trouvée ou 0 si aucune
        let firstTvaValue = 0;
        for (const item of lines) {
          const tvaValue = Number(String(item.TVA || item.tva || 0).replace(/[\s\u00A0]/g, '').replace(',', '.'));
          if (tvaValue > 0 || tvaValue === 0) {
            firstTvaValue = tvaValue;
            break;
          }
        }
        const tvaRate = firstTvaValue;
        montantTVA = totalNetHT * (tvaRate / 100);
      }

      // AIRSI si présent dans les données
      let airsiRate = 0;
      lines.forEach(item => {
        // Vérifier OtherTaxPct (pourcentage) ou OtherTaxName (souvent montant ou % selon le cas)
        const airsiPct = parseFloat(item.OtherTaxPct || item.other_tax_pct || item.otherTaxPct || 0);
        const airsiAmountRaw = parseFloat(item.OtherTaxName || item.other_tax_name || item.otherTaxName || 0);

        if (airsiPct > 0) airsiRate = airsiPct;

        let airsiAmount = 0;
        if (airsiPct > 0) {
          const puHt = Number(String(item.PU_HT || item.pu_ht || item.prixUnitaireHT || item.prix_unitaire_ht || 0).replace(',', '.')) || 0;
          const qte = Number(item.quantite || item.quantity || 0) || 0;
          const remPct = Number(item.Rem_Pct || item.rem_pct || item.remisePct || 0) || 0;
          const tvaPctLine = Number(item.TVA || item.tva || 0);
          const lineNetHT = (puHt * qte) * (1 - remPct / 100);
          const lineTVA = lineNetHT * (tvaPctLine / 100);

          // L'AIRSI est calculé sur le Total TTC (Net HT + TVA) pour tous les types (standardisation)
          airsiAmount = (lineNetHT + lineTVA) * (airsiPct / 100);
        } else if (airsiAmountRaw > 0 && !item.OtherTaxPct && !item.other_tax_pct) {
          // Si on a un montant direct et pas de pourcentage
          airsiAmount = airsiAmountRaw;
        }

        if (airsiAmount > 0) {
          montantAIRSI += airsiAmount;
        }
      });

      if (montantAIRSI > 0) {
        taxData.push({
          typeTaxe: 'AIRSI',
          baseTaxe: totalNetHT + montantTVA,
          taux: airsiRate > 0 ? airsiRate : ((montantAIRSI / (totalNetHT + montantTVA)) * 100).toFixed(2),
          montant: montantAIRSI
        });
      }

      totalTTC = totalNetHT + montantTVA + montantAIRSI;

      // Ajouter la TVA aux taxes
      if (montantTVA > 0) {
        taxData.push({
          typeTaxe: 'TVA',
          baseTaxe: totalNetHT,
          taux: hasLineTva ? (montantTVA / totalNetHT * 100).toFixed(2) : 18,
          montant: montantTVA
        });
      }

      console.log('=== CALCULS DES TOTAUX (Frontend - Fallback robuste inclus) ===');
      console.log('Nombre de lignes traitées:', lines.length);
      console.log('TOTAL HT:', totalHT);
      console.log('TOTAL NET HT:', totalNetHT);
      console.log('MONTANT TVA:', montantTVA);
      console.log('TOTAL TTC:', totalTTC);

      return {
        totalHT: totalHT,
        totalNetHT: totalNetHT,
        montantTVA: montantTVA,
        totalTTC: totalTTC,
        montantAIRSI: montantAIRSI,
        totalAPayer: totalTTC,
        taxData
      };
    };

    // Récupérer les totaux frais depuis l'API SAP
    let calculatedTotals = {};
    try {
      console.log('=== RÉCUPÉRATION DES TOTAUX DEPUIS L\'API SAP ===');
      const invoiceNumber = invoice.numero || invoice.numeroFacture;
      console.log('Numéro de facture:', invoiceNumber);

      const response = await axios.post(API_ENDPOINTS.SAP.SEARCH, {
        VBELN: invoiceNumber,
        KONV_READ: 'X'
      });

      if (response.data && response.data.success && response.data.totaux) {
        console.log('Totaux récupérés depuis l\'API:', response.data.totaux);
        calculatedTotals = response.data.totaux;
      } else {
        console.warn('Pas de totaux dans la réponse API, calcul par défaut');
        calculatedTotals = calculateTotals(formattedInvoice.data);
      }
    } catch (error) {
      console.error('Erreur lors de la récupération des totaux depuis l\'API:', error);
      // Fallback sur le calcul local si l'API échoue
      calculatedTotals = calculateTotals(formattedInvoice.data);
    }

    console.log('=== FACTURED INVOICE APRÈS FORMATAGE ===');
    console.log('formattedInvoice.data:', formattedInvoice.data);
    console.log('Type de formattedInvoice.data:', Array.isArray(formattedInvoice.data) ? 'Array' : typeof formattedInvoice.data);
    if (Array.isArray(formattedInvoice.data) && formattedInvoice.data.length > 0) {
      console.log('Premier élément de formattedInvoice.data:', formattedInvoice.data[0]);
      console.log('Clés du premier élément:', Object.keys(formattedInvoice.data[0]));
    }

    // Récupérer l'adresse client si le KUNNR est présent
    const kunnr = firstDataItem.kunnr || (Array.isArray(invoice.data) && invoice.data[0]?.kunnr);
    if (kunnr) {
      try {
        console.log(`=== RÉCUPÉRATION ADRESSE POUR LE CLIENT ${kunnr} ===`);
        const resAddr = await axios.get(`${API_ENDPOINTS.SAP.CLIENT_ADDRESS}/${kunnr}`);
        if (resAddr.data && resAddr.data.success && resAddr.data.data) {
          // Gérer le cas où le backend retourne un tableau ou un objet
          const addr = Array.isArray(resAddr.data.data) ? resAddr.data.data[0] : resAddr.data.data;
          const { SMTP_ADDR, TELF1 } = addr || {};

          console.log('Adresse client récupérée:', { email: SMTP_ADDR, phone: TELF1 });

          if (SMTP_ADDR || TELF1) {
            // Mettre à jour les lignes de la facture avec les nouvelles coordonnées
            formattedInvoice.data = formattedInvoice.data.map(line => ({
              ...line,
              clientEmail: SMTP_ADDR || line.clientEmail || '',
              clientPhone: TELF1 || line.clientPhone || '',
              // Pour la compatibilité avec certains affichages qui utiliseraient le PascalCase
              ClientEmail: SMTP_ADDR || line.ClientEmail || '',
              ClientPhone: TELF1 || line.ClientPhone || ''
            }));
          }
        }
      } catch (err) {
        console.error("Erreur lors de la récupération de l'adresse client:", err);
      }
    }

    setSelectedInvoice(formattedInvoice);
    // Conserver la structure correcte pour FactureDisplay avec les totaux calculés
    setFacture({
      success: true,
      message: 'Facture récupérée depuis SAP et enregistrée en base',
      data: {
        success: true,
        data: formattedInvoice.data
      },
      totaux: calculatedTotals, // Ajouter les totaux calculés
      templateData: null
    });
    try {
      const rawData = formattedInvoice.data;
      const lignes = Array.isArray(rawData?.data)
        ? rawData.data
        : Array.isArray(rawData)
          ? rawData
          : rawData?.data
            ? [rawData.data]
            : rawData
              ? [rawData]
              : [];
      console.log('Lignes de facture au moment de l\'affichage des détails (sélection dans la liste):', lignes);
    } catch (e) {
      console.warn('Impossible de logger les lignes de facture (sélection dans la liste):', e);
    }
    // Ne pas changer le viewMode ici pour conserver 'list' ou 'sent' 
    // afin d'afficher le bon bouton d'action (Envoyer au lieu de Télécharger)
    setIsDetailViewMode(true);
    window.scrollTo(0, 0);
  };

  // Confirmer la suppression d'une facture
  const confirmDeleteInvoice = (invoice) => {
    setInvoiceToDelete(invoice);
    setOpenDeleteDialog(true);
  };

  // Supprimer une facture téléchargée
  const handleDeleteInvoice = async () => {
    if (!invoiceToDelete) return;

    // Vérifier si la facture a été envoyée
    const isSent = sentInvoices.some(sentInvoice =>
      sentInvoice.numero_facture === invoiceToDelete.numero ||
      sentInvoice.numero_facture === invoiceToDelete.numeroFacture
    );

    if (isSent) {
      setError('Impossible de supprimer une facture qui a déjà été envoyée');
      setOpenDeleteDialog(false);
      setInvoiceToDelete(null);
      return;
    }

    // Enregistrer l'action de suppression dans les logs
    try {
      await fetch(API_ENDPOINTS.LOGS.DELETE, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          username: user?.username,
          numeroFacture: invoiceToDelete.numero
        })
      });
    } catch (logError) {
      console.error('Erreur lors de l\'enregistrement du log de suppression:', logError);
    }

    // Supprimer la facture de la base de données
    try {
      const response = await fetch(`${API_ENDPOINTS.DOWNLOADED_INVOICES.BASE}/${invoiceToDelete.id}`, {
        method: 'DELETE'
      });

      if (response.ok) {
        console.log('Facture supprimée de la base de données avec succès');
        // Recharger la liste depuis la base de données (celle de la vue active)
        await loadDownloadedInvoices();
      } else {
        console.error('Erreur lors de la suppression de la base de données');
      }
    } catch (deleteError) {
      console.error('Erreur lors de la suppression de la facture:', deleteError);
    }

    if (selectedInvoice?.id === invoiceToDelete.id) {
      setSelectedInvoice(null);
      setFacture(null);
    }
    setOpenDeleteDialog(false);
    setInvoiceToDelete(null);
  };

  // Annuler la suppression
  const handleCancelDelete = () => {
    setOpenDeleteDialog(false);
    setInvoiceToDelete(null);
  };

  // Gérer le modal de téléchargement existant
  const handleCloseDownloadModal = () => {
    setOpenDownloadModal(false);
    setExistingInvoiceInfo(null);
  };

  // Forcer le téléchargement même si la facture existe
  /*
  const handleForceDownload = () => {
    setOpenDownloadModal(false);
    setExistingInvoiceInfo(null);
    // Relancer le téléchargement sans vérification
    performDownload();
  };
  */

  // Fonction séparée pour le téléchargement effectif
  // Construit le payload d'enregistrement d'UNE facture (mêmes transformations que
  // performDownload : tag pointOfSale/import_view, modifs inline, client, avoir résolu).
  // Réutilisé par le téléchargement EN MASSE pour envoyer tout le lot en un seul appel.
  const buildDownloadPayload = (invoiceToDownload, avoirResolutionOverride = null) => {
    const firstDataItem = Array.isArray(invoiceToDownload.data) ? invoiceToDownload.data[0] : invoiceToDownload.data;
    const vbrkData = firstDataItem?.VBRK_I || firstDataItem;
    const vbpaData = Array.isArray(firstDataItem?.XVBPA) ? firstDataItem.XVBPA : [];
    const numero = vbrkData?.numeroFacture || firstDataItem?.numeroFacture || 'N/A';
    const client = firstDataItem?.data?.[0]?.nomClient ||
      (vbpaData.find(p => p.PARVW === 'AG')?.NAME1) ||
      (vbpaData[0]?.NAME1) ||
      firstDataItem?.XVBPA?.NAME1 ||
      vbrkData?.nomClient ||
      'Client inconnu';

    let dataArr = Array.isArray(invoiceToDownload.data) ? invoiceToDownload.data : [invoiceToDownload.data || invoiceToDownload];
    const allModifications = { ...fieldModifications, ...pendingModifications };
    const posFromMod = numero ? allModifications[`${numero}_PointOfSale`] : null;
    const effectivePos = posFromMod || selectedPos || 'NPG_SIEGE_FACTURATION';

    dataArr = dataArr.map(item => {
      const m = { ...item };
      if (numero && allModifications[`${numero}_ClientEmail`]) m.clientEmail = allModifications[`${numero}_ClientEmail`];
      if (numero && allModifications[`${numero}_ClientPhone`]) m.clientPhone = allModifications[`${numero}_ClientPhone`];
      m.template = (numero && allModifications[`${numero}_Template`]) || m.template || 'B2B';
      m.paymentMethod = (numero && allModifications[`${numero}_PaymentMethod`]) || m.paymentMethod || 'deferred';
      m.invoiceType = (numero && allModifications[`${numero}_InvoiceType`]) || m.invoiceType || (facture?.isRefund ? 'refund' : 'sale');
      m.isRne = (numero && allModifications[`${numero}_isRne`]) || m.isRne || 'False';
      m.pointOfSale = effectivePos;
      m.point_of_sale = effectivePos;
      m.import_view = selectedPos || m.import_view || effectivePos;
      return m;
    });

    const effectiveAvoirResult = avoirResolutionOverride || avoirSapResult;
    const finalData = (effectiveAvoirResult && effectiveAvoirResult.success)
      ? [...dataArr, { _avoirResolution: {
          refundPayload: effectiveAvoirResult.refundPayload,
          factureInitiale: effectiveAvoirResult.factureInitiale,
          matchedItems: effectiveAvoirResult.matchedItems,
          avoir: effectiveAvoirResult.avoir
        }}]
      : dataArr;

    return {
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      username: user?.username,
      numero,
      date: new Date().toISOString(),
      client,
      data: finalData,
      invoice_type_code: selectedPos || null,
    };
  };

  const performDownload = async (invoiceToDownload = facture, silent = false, avoirResolutionOverride = null) => {
    if (!invoiceToDownload) return;

    // Récupérer les informations de la facture
    const firstDataItem = Array.isArray(invoiceToDownload.data) ? invoiceToDownload.data[0] : invoiceToDownload.data;
    const vbrkData = firstDataItem?.VBRK_I || firstDataItem;
    const vbpaData = Array.isArray(firstDataItem?.XVBPA) ? firstDataItem.XVBPA : [];

    const invoiceData = {
      id: Date.now().toString(),
      numero: vbrkData?.numeroFacture || firstDataItem?.numeroFacture || 'N/A',
      date: new Date().toISOString(),
      client: firstDataItem?.data?.[0]?.nomClient ||
        (vbpaData.find(p => p.PARVW === 'AG')?.NAME1) ||
        (vbpaData[0]?.NAME1) ||
        firstDataItem?.XVBPA?.NAME1 ||
        vbrkData?.nomClient ||
        'Client inconnu',
      data: Array.isArray(invoiceToDownload.data) ? invoiceToDownload.data : [invoiceToDownload.data || invoiceToDownload]
    };

    // Ajouter les modifications inline + le tag de la vue (selectedPos) aux données téléchargées.
    // IMPORTANT : on tagge TOUJOURS pointOfSale + import_view, même sans modif inline,
    // pour que le filtre backend (downloadedInvoicesController) puisse retrouver la
    // facture dans le menu SURCCUSALE / NPG_SALE / FACTURE_EXPORT correspondant.
    const invoiceNumber = invoiceData.numero;
    const allModifications = { ...fieldModifications, ...pendingModifications };
    const posFromMod = invoiceNumber ? allModifications[`${invoiceNumber}_PointOfSale`] : null;
    const effectivePos = posFromMod || selectedPos || 'NPG_SIEGE_FACTURATION';

    console.log('=== DÉBOGAGE MODIFICATIONS INLINE ===');
    console.log('Numéro facture:', invoiceNumber);
    console.log('selectedPos:', selectedPos);
    console.log('effectivePos appliqué:', effectivePos);
    console.log('allModifications:', allModifications);

    invoiceData.data = invoiceData.data.map(item => {
      const modifiedItem = { ...item };

      if (invoiceNumber && allModifications[`${invoiceNumber}_ClientEmail`]) {
        modifiedItem.clientEmail = allModifications[`${invoiceNumber}_ClientEmail`];
      }
      if (invoiceNumber && allModifications[`${invoiceNumber}_ClientPhone`]) {
        modifiedItem.clientPhone = allModifications[`${invoiceNumber}_ClientPhone`];
      }
      modifiedItem.template = (invoiceNumber && allModifications[`${invoiceNumber}_Template`]) || modifiedItem.template || 'B2B';
      modifiedItem.paymentMethod = (invoiceNumber && allModifications[`${invoiceNumber}_PaymentMethod`]) || modifiedItem.paymentMethod || 'deferred';
      modifiedItem.invoiceType =
        (invoiceNumber && allModifications[`${invoiceNumber}_InvoiceType`]) ||
        modifiedItem.invoiceType ||
        (facture?.isRefund ? 'refund' : 'sale');
      modifiedItem.isRne = (invoiceNumber && allModifications[`${invoiceNumber}_isRne`]) || modifiedItem.isRne || 'False';

      // Tag du point de vente : modif inline > selectedPos > défaut
      modifiedItem.pointOfSale = effectivePos;
      modifiedItem.point_of_sale = effectivePos;
      // import_view : sert au filtre backend pour retrouver la facture dans le bon menu
      modifiedItem.import_view = selectedPos || modifiedItem.import_view || effectivePos;

      return modifiedItem;
    });

    console.log('=== DÉBOGAGE NUMÉRO FACTURE ===');
    console.log('vbrkData?.numeroFacture:', vbrkData?.numeroFacture);
    console.log('firstDataItem?.numeroFacture:', firstDataItem?.numeroFacture);
    console.log('invoiceData.numero final:', invoiceData.numero);

    console.log('Données de la facture à enregistrer:', invoiceData);

    // Enregistrer l'action de téléchargement dans les logs
    try {
      await fetch(API_ENDPOINTS.LOGS.DOWNLOAD, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          username: user?.username,
          numeroFacture: invoiceData.numero
        })
      });
    } catch (logError) {
      console.error('Erreur lors de l\'enregistrement du log de téléchargement:', logError);
    }

    // Sauvegarder la facture dans la base de données
    try {
      const response = await fetch(API_ENDPOINTS.DOWNLOADED_INVOICES.BASE, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          id: invoiceData.id,
          username: user?.username,
          numero: invoiceData.numero,
          date: invoiceData.date,
          client: invoiceData.client,
          data: (() => {
            const effectiveAvoirResult = avoirResolutionOverride || avoirSapResult;
            return effectiveAvoirResult && effectiveAvoirResult.success
              ? [...invoiceData.data, { _avoirResolution: {
                  refundPayload: effectiveAvoirResult.refundPayload,
                  factureInitiale: effectiveAvoirResult.factureInitiale,
                  matchedItems: effectiveAvoirResult.matchedItems,
                  avoir: effectiveAvoirResult.avoir
                }}]
              : invoiceData.data;
          })(),
          invoice_type_code: selectedPos || null
        })
      });

      if (response.ok) {
        console.log('Facture sauvegardée en base de données avec succès');
        // Recharger la liste des factures depuis la base de données
        await loadDownloadedInvoices();
        // Marquer l'avoir comme téléchargé si c'est un avoir
        if (avoirSapResult) {
          setAvoirSapDownloaded(true);
        }
      } else {
        console.error('Erreur lors de la sauvegarde en base de données');
      }
    } catch (saveError) {
      console.error('Erreur lors de la sauvegarde de la facture:', saveError);
    }



    if (!silent) {
      setSelectedInvoice(invoiceData);
      // Si c'est un avoir avec résolution, rester sur la page pour permettre l'envoi FNE
      if (!avoirSapResult) {
        setViewMode('list');
      }
    }
  };

  return (
    <Box sx={{ display: 'flex' }}>
      <AppBar position="fixed" sx={{ zIndex: (theme) => theme.zIndex.drawer + 1 }}>
        <Toolbar>
          <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
            E_Facture DEV
          </Typography>
          <Typography variant="body1" sx={{ mr: 2 }}>
            {user?.username}
          </Typography>
          <IconButton color="inherit" onClick={() => { setIsDetailViewMode(false); setViewMode('home'); setSelectedPos(null); }} title="Accueil">
            <HomeIcon />
          </IconButton>
          <IconButton color="inherit" onClick={logout}>
            <LogoutIcon />
          </IconButton>
        </Toolbar>
      </AppBar>

      <Sidebar
        selectedPos={selectedPos}
        onHomeClick={() => { setIsDetailViewMode(false); setViewMode('home'); setSelectedPos(null); }}
        onDownloadClick={handleDownload}
        onListClick={handleListInvoices}
        onSentInvoicesClick={handleSentInvoices}
        onManualFneClick={handleImportTemplate}
        onSettingsClick={() => { setIsDetailViewMode(false); setViewMode('settings'); }}
        onFneCancellationsClick={() => { setIsDetailViewMode(false); setViewMode('fne-cancellations'); }}
        onBlValidationClick={() => { setIsDetailViewMode(false); setViewMode('bl-validation'); }}
        onAutoDownloadClick={() => { setIsDetailViewMode(false); setViewMode('auto-download'); }}
        onNonFneClick={() => { setIsDetailViewMode(false); setViewMode('non-fne'); }}
      />

      <Box component="main" sx={{ flexGrow: 1, p: 3, marginTop: '64px' }}>
        <input ref={fileInputRef} type="file" accept=".csv, .xlsx, .xls" style={{ display: 'none' }} onChange={handleTemplateSelected} />
        {isDetailViewMode && facture ? (
          <Container maxWidth="lg">
            <Box>
              {/* Navigation et Retour */}
              <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Button
                  variant="outlined"
                  startIcon={<ArrowBackIcon />}
                  onClick={handlePrevInvoice}
                  disabled={!selectedInvoice || (() => {
                    const list = downloadedInvoices;
                    return list.findIndex(i => i.id === selectedInvoice.id) <= 0;
                  })()}
                >
                  Précédent
                </Button>

                <Button
                  variant="contained"
                  color="primary"
                  onClick={() => { setIsDetailViewMode(false); }}
                >
                  {viewMode === 'download' ? 'Retour à la recherche' : 'Retour à la liste'}
                </Button>

                <Button
                  variant="outlined"
                  endIcon={<ArrowForwardIcon />}
                  onClick={handleNextInvoice}
                  disabled={!selectedInvoice || (() => {
                    const list = downloadedInvoices;
                    const idx = list.findIndex(i => i.id === selectedInvoice.id);
                    return idx === -1 || idx >= list.length - 1;
                  })()}
                >
                  Suivant
                </Button>
              </Box>

              <FactureDisplay
                facture={facture}
                refCallback={toPrint}
                fieldModifications={fieldModifications}
                handleInlineEdit={handleInlineEdit}
                pendingModifications={pendingModifications}
                setPendingModifications={setPendingModifications}
                applyAllModifications={applyAllModifications}
                editingCell={editingCell}
                editValue={editValue}
                handleEditStart={handleEditStart}
                handleEditChange={(value) => setEditValue(value)}
                handleEditEnd={(value) => {
                  if (value !== null && editingCell) {
                    const fieldName = editingCell.split('_')[0];
                    const invoiceNumber = facture?.data?.data?.[0]?.numeroFacture || 'N/A';
                    const key = `${invoiceNumber}_${fieldName}`;
                    setPendingModifications(prev => ({
                      ...prev,
                      [key]: {
                        fieldName: fieldName,
                        invoiceNumber,
                        newValue: value,
                        oldValue: fieldModifications[key] || ''
                      }
                    }));
                    setFieldModifications(prev => ({
                      ...prev,
                      [key]: value
                    }));
                  }
                  setEditingCell(null);
                  setEditValue('');
                }}
                sentInvoices={sentInvoices}
                isDetailView={isDetailViewMode}
                validationErrors={validationErrors}
              />

              {/* Bouton d'action dans la vue détaillée */}
              <Box sx={{ mt: 3, textAlign: 'center' }}>
                {viewMode === 'download' ? (() => {
                  // Détection avoir non résolu → on désactive le bouton de téléchargement
                  const firstItemDetail = Array.isArray(facture?.data) ? facture.data[0] : facture?.data;
                  const fkartDetail = (firstItemDetail?.fkart || '').toString().trim().toUpperCase();
                  const isAvoirDetail = ['ZRE', 'G2', 'ZG2', 'S1', 'ZS1', 'CR', 'ZCR', 'IG', 'L2', 'ZL2'].includes(fkartDetail)
                    || fkartDetail.endsWith('G2') || fkartDetail.endsWith('RE') || fkartDetail.endsWith('S1') || fkartDetail.endsWith('CR');
                  const avoirBlocked = isAvoirDetail && (!avoirSapResult || avoirSapResult.partial || avoirSapResult.success === false);
                  // Cause précise du blocage (pour libellé + tooltip)
                  const isItemsMismatch    = avoirBlocked && !!itemsMismatch;
                  const isMissingInitial   = avoirBlocked && !isItemsMismatch && !!missingInitialInvoice;
                  const blockedTitle =
                    isItemsMismatch  ? `Articles de l'avoir incompatibles avec la facture initiale ${itemsMismatch.numeroInitiale} — voir le détail`
                    : isMissingInitial ? `Facture initiale ${missingInitialInvoice.numeroFacture} non envoyée à la FNE`
                    : avoirBlocked   ? 'Avoir non résolu — facture initiale introuvable'
                    : '';
                  const blockedLabel =
                    isItemsMismatch  ? 'Bloqué : articles incompatibles'
                    : isMissingInitial ? 'Bloqué : facture initiale manquante'
                    : avoirBlocked   ? 'Téléchargement bloqué (avoir non résolu)'
                    : 'Télécharger';
                  return (
                    <Tooltip title={blockedTitle}>
                      <span>
                        <Button
                          variant="contained"
                          color={isItemsMismatch ? 'error' : 'primary'}
                          startIcon={<DownloadIcon />}
                          onClick={handleDownloadInvoice}
                          disabled={loading || avoirBlocked}
                          size="large"
                        >
                          {loading ? 'Téléchargement...' : blockedLabel}
                        </Button>
                      </span>
                    </Tooltip>
                  );
                })() : (
                  <Button
                    variant="contained"
                    color="secondary"
                    startIcon={<SendIcon />}
                    style={{ display: canSendInvoice ? undefined : 'none' }}
                    onClick={() => selectedInvoice && handleSendInvoice(selectedInvoice)}
                    disabled={loading || (selectedInvoice && sentInvoices.some(sentInvoice =>
                      sentInvoice.numero_facture === selectedInvoice.numero ||
                      sentInvoice.numero_facture === selectedInvoice.numeroFacture ||
                      sentInvoice.numero_facture === (selectedInvoice.data?.[0]?.data?.[0]?.numeroFacture) ||
                      sentInvoice.numero_facture === (selectedInvoice.data?.[0]?.success?.data?.[0]?.numeroFacture)
                    ))}
                    size="large"
                    title={selectedInvoice && sentInvoices.some(sentInvoice =>
                      sentInvoice.numero_facture === selectedInvoice.numero ||
                      sentInvoice.numero_facture === selectedInvoice.numeroFacture ||
                      sentInvoice.numero_facture === (selectedInvoice.data?.[0]?.data?.[0]?.numeroFacture) ||
                      sentInvoice.numero_facture === (selectedInvoice.data?.[0]?.success?.data?.[0]?.numeroFacture)
                    ) ? "Cette facture a déjà été envoyée et ne peut pas être envoyée à nouveau" : "Envoyer la facture"}
                  >
                    {loading ? 'Envoi en cours...' :
                      (selectedInvoice && sentInvoices.some(sentInvoice =>
                        sentInvoice.numero_facture === selectedInvoice.numero ||
                        sentInvoice.numero_facture === selectedInvoice.numeroFacture ||
                        sentInvoice.numero_facture === (selectedInvoice.data?.[0]?.data?.[0]?.numeroFacture) ||
                        sentInvoice.numero_facture === (selectedInvoice.data?.[0]?.success?.data?.[0]?.numeroFacture)
                      ) ? 'Déjà envoyée' : 'Envoyer la facture')}
                  </Button>
                )}
              </Box>
            </Box>
          </Container>
        ) : viewMode === 'home' ? (
          <HomePage onSelectType={handleShortcutClick} />
        ) : viewMode === 'download' ? (
          <Container maxWidth="lg">
            <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 2, gap: 2 }}>
              {(selectedPos === 'SURCCUSALE' || selectedPos === 'FACTURE_EXPORT' || selectedPos === 'NPG_SALE') && (
                <>
                  {selectedPos === 'SURCCUSALE' && (
                    <Button
                      variant="outlined"
                      color="secondary"
                      startIcon={<EditIcon />}
                      onClick={() => setPosDialogOpen(true)}
                    >
                      Gérer Points de Vente
                    </Button>
                  )}
                  <Button
                    variant="outlined"
                    startIcon={<FileDownloadIcon />}
                    onClick={handleDownloadTemplate}
                  >
                    Télécharger Template
                  </Button>
                  <Button
                    variant="contained"
                    startIcon={<UploadFileIcon />}
                    onClick={handleImportTemplate}
                  >
                    Importer Template
                  </Button>
                </>
              )}
            </Box>

            {/* Affichage des données du template importé */}
            {templateData.length > 0 && (
              <Box sx={{ mb: 4, p: 3, bgcolor: 'background.paper', borderRadius: 2, border: '1px solid #e0e0e0' }}>
                <Typography variant="h6" gutterBottom color="primary">
                  Template Importé - {templateData.length} ligne(s)
                </Typography>
                <TableContainer component={Paper} sx={{ maxHeight: 400 }}>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Facture</TableCell>
                        <TableCell>Client</TableCell>
                        <TableCell>Email</TableCell>
                        <TableCell>Téléphone</TableCell>
                        <TableCell>ClientNCC</TableCell>
                        <TableCell>Template</TableCell>
                        <TableCell>PaymentMethod</TableCell>
                        <TableCell>InvoiceType</TableCell>
                        <TableCell>isRne</TableCell>
                        <TableCell>PointOfSale</TableCell>
                        <TableCell>Establishment</TableCell>
                        <TableCell>Référence</TableCell>
                        <TableCell>Désignation</TableCell>
                        <TableCell align="right">PU_HT</TableCell>
                        <TableCell align="right">Quantité</TableCell>
                        <TableCell>Unite</TableCell>
                        <TableCell align="right">TVA</TableCell>
                        <TableCell>OtherTaxName</TableCell>
                        <TableCell align="right">OtherTaxPct</TableCell>
                        <TableCell align="right">Rem_Pct</TableCell>
                        <TableCell>CommercialMessage</TableCell>
                        <TableCell>DEVISES</TableCell>
                        <TableCell align="right">Taux de changes</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {templateData.slice(0, 10).map((row, index) => (
                        <TableRow key={index} hover>
                          <TableCell>{row.Facture}</TableCell>
                          <TableCell>{row.ClientName}</TableCell>
                          <TableCell>{row.ClientEmail}</TableCell>
                          <TableCell>{row.ClientPhone}</TableCell>
                          <TableCell>{row.ClientNCC}</TableCell>
                          <TableCell>{row.Template}</TableCell>
                          <TableCell>{row.PaymentMethod}</TableCell>
                          <TableCell>{row.InvoiceType}</TableCell>
                          <TableCell>{row.isRne}</TableCell>
                          <TableCell>{row.PointOfSale}</TableCell>
                          <TableCell>{row.Establishment}</TableCell>
                          <TableCell>{row.Ref}</TableCell>
                          <TableCell sx={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {row.Designation}
                          </TableCell>
                          <TableCell align="right">{row.PU_HT}</TableCell>
                          <TableCell align="right">{row.Qte}</TableCell>
                          <TableCell>{row.Unite}</TableCell>
                          <TableCell align="right">{row.TVA}</TableCell>
                          <TableCell>{row.OtherTaxName}</TableCell>
                          <TableCell align="right">{row.OtherTaxPct}</TableCell>
                          <TableCell align="right">{row.Rem_Pct}</TableCell>
                          <TableCell sx={{ maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {row.CommercialMessage || row['Commercial Message'] || row['Message Commercial']}
                          </TableCell>
                          <TableCell>{row.DEVISES || row.Devises || row.devises}</TableCell>
                          <TableCell align="right">
                            {row['Taux de changes'] || row['Taux de change'] || row['taux de change'] || row['taux de changes']}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
                {templateData.length > 10 && (
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                    ... et {templateData.length - 10} autres lignes
                  </Typography>
                )}
                <Box sx={{ mt: 2, display: 'flex', gap: 2 }}>
                  <Button
                    variant="contained"
                    size="small"
                    onClick={() => setTemplateData([])}
                  >
                    Effacer
                  </Button>
                  <Button
                    variant="contained"
                    color="primary"
                    size="small"
                    onClick={handleDownloadTemplateData}
                    disabled={loading}
                    startIcon={loading ? <CircularProgress size={16} /> : <DownloadIcon />}
                  >
                    {loading ? 'Téléchargement...' : 'Télécharger'}
                  </Button>
                </Box>
              </Box>
            )}
            <Box>
              {/* Sélecteur de type de téléchargement - caché pour NPG_SALE et SURCCUSALE et FACTURE_EXPORT */}
              {selectedPos !== 'NPG_SALE' && selectedPos !== 'SURCCUSALE' && selectedPos !== 'FACTURE_EXPORT' && (
                <Box sx={{ mb: 4 }}>
                  <Typography variant="h6" gutterBottom>
                    Type de téléchargement
                  </Typography>
                  <Box sx={{ display: 'flex', gap: 3, mb: 3 }}>
                    <Box
                      onClick={() => setDownloadType('individual')}
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        cursor: 'pointer',
                        p: 1.5,
                        border: '2px solid',
                        borderColor: downloadType === 'individual' ? 'primary.main' : 'grey.300',
                        borderRadius: 2,
                        bgcolor: downloadType === 'individual' ? 'primary.50' : 'transparent',
                        transition: 'all 0.3s',
                        '&:hover': {
                          borderColor: 'primary.main',
                          bgcolor: 'primary.50'
                        }
                      }}
                    >
                      <Checkbox
                        checked={downloadType === 'individual'}
                        size="small"
                        sx={{ mr: 0.5 }}
                      />
                      <Typography variant="body2">
                        Téléchargement Individuel
                      </Typography>
                    </Box>

                    <Box
                      onClick={() => setDownloadType('bulk')}
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        cursor: 'pointer',
                        p: 1.5,
                        border: '2px solid',
                        borderColor: downloadType === 'bulk' ? 'primary.main' : 'grey.300',
                        borderRadius: 2,
                        bgcolor: downloadType === 'bulk' ? 'primary.50' : 'transparent',
                        transition: 'all 0.3s',
                        '&:hover': {
                          borderColor: 'primary.main',
                          bgcolor: 'primary.50'
                        }
                      }}
                    >
                      <Checkbox
                        checked={downloadType === 'bulk'}
                        size="small"
                        sx={{ mr: 0.5 }}
                      />
                      <Typography variant="body2">
                        Téléchargement en masse
                      </Typography>
                    </Box>

                    <Box
                      onClick={() => setDownloadType('dateRange')}
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        cursor: 'pointer',
                        p: 1.5,
                        border: '2px solid',
                        borderColor: downloadType === 'dateRange' ? 'primary.main' : 'grey.300',
                        borderRadius: 2,
                        bgcolor: downloadType === 'dateRange' ? 'primary.50' : 'transparent',
                        transition: 'all 0.3s',
                        '&:hover': {
                          borderColor: 'primary.main',
                          bgcolor: 'primary.50'
                        }
                      }}
                    >
                      <Checkbox
                        checked={downloadType === 'dateRange'}
                        size="small"
                        sx={{ mr: 0.5 }}
                      />
                      <Typography variant="body2">
                        Plage de dates
                      </Typography>
                    </Box>

                  </Box>
                </Box>
              )}

              {/* UI conditionnelle selon le type - caché pour NPG_SALE et SURCCUSALE et FACTURE_EXPORT */}
              {selectedPos !== 'NPG_SALE' && selectedPos !== 'SURCCUSALE' && selectedPos !== 'FACTURE_EXPORT' && downloadType === 'individual' && (
                <Box>
                  <Typography variant="h5" gutterBottom sx={{ mb: 3 }}>
                    Rechercher une facture
                  </Typography>
                  <Box sx={{ mb: 3 }}>
                    <input
                      type="text"
                      value={numero}
                      onChange={(e) => setNumero(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && rechercherFacture()}
                      placeholder="Entrez le numéro de facture"
                      style={{
                        width: '100%',
                        padding: '12px',
                        fontSize: '16px',
                        border: '1px solid #ccc',
                        borderRadius: '4px'
                      }}
                    />
                  </Box>
                  <Button
                    variant="contained"
                    onClick={() => rechercherFacture()}
                    disabled={loading || !numero}
                    startIcon={loading ? <CircularProgress size={20} color="inherit" /> : <SearchIcon />}
                  >
                    {loading ? 'Recherche...' : 'Rechercher'}
                  </Button>

                  {error && (
                    <Typography color="error" variant="body1" sx={{ mt: 2 }}>
                      {error}
                    </Typography>
                  )}

                  {/* Affichage de la facture trouvée */}
                  {facture && facture.success && (() => {
                    const fkartValue = (facture.data?.[0]?.fkart || '').trim();
                    const isAvoir = fkartValue.includes('G2') || fkartValue.includes('RE') || fkartValue.includes('S1') || fkartValue.includes('CR');
                    return (
                    <Box sx={{ mt: 3 }}>
                      <TableContainer component={Paper}>
                        <Table>
                          <TableHead>
                            <TableRow>
                              <TableCell>Type</TableCell>
                              <TableCell>Numéro</TableCell>
                              <TableCell>Client</TableCell>
                              <TableCell>Date</TableCell>
                              <TableCell align="right">Actions</TableCell>
                            </TableRow>
                          </TableHead>
                          <TableBody>
                            <TableRow hover sx={isAvoir ? { bgcolor: '#fff8e1' } : {}}>
                              <TableCell>
                                <Chip
                                  label={isAvoir ? 'Avoir' : 'Facture'}
                                  color={isAvoir ? 'warning' : 'primary'}
                                  size="small"
                                />
                              </TableCell>
                              <TableCell>{facture.data?.[0]?.numeroFacture || numero}</TableCell>
                              <TableCell>
                                {facture.data?.[0]?.nomClient ||
                                  facture.data?.[0]?.data?.[0]?.nomClient ||
                                  'N/A'}
                              </TableCell>
                              <TableCell>{new Date().toLocaleDateString('fr-FR')}</TableCell>
                              <TableCell align="right">
                                <Button
                                  variant="contained"
                                  color={isAvoir ? 'warning' : 'primary'}
                                  size="small"
                                  startIcon={<DownloadIcon />}
                                  onClick={handleDownloadInvoice}
                                  sx={{ mr: 1 }}
                                >
                                  {isAvoir ? 'Télécharger Avoir' : 'Télécharger'}
                                </Button>
                                <Button
                                  variant="outlined"
                                  size="small"
                                  startIcon={<VisibilityIcon />}
                                  onClick={() => {
                                    setViewMode('download');
                                    setIsDetailViewMode(true);
                                  }}
                                >
                                  Voir détails
                                </Button>
                              </TableCell>
                            </TableRow>
                          </TableBody>
                        </Table>
                      </TableContainer>

                      {/* Détails avoir si c'est un avoir détecté */}
                      {isAvoir && avoirSapResult && avoirSapResult.success && (
                        <Box sx={{ mt: 3 }}>
                          {/* Facture Initiale FNE */}
                          <Paper sx={{ p: 3, mb: 2, bgcolor: '#e8f5e9' }}>
                            <Typography variant="h6" sx={{ mb: 1 }}>Facture Initiale (FNE)</Typography>
                            <Grid container spacing={2}>
                              <Grid item xs={6}><Typography variant="body2" color="text.secondary">N° Facture SAP</Typography><Typography fontWeight="bold">{avoirSapResult.factureInitiale.numero}</Typography></Grid>
                              <Grid item xs={6}><Typography variant="body2" color="text.secondary">Ref FNE</Typography><Typography>{avoirSapResult.factureInitiale.fne_reference || 'N/A'}</Typography></Grid>
                            </Grid>
                          </Paper>

                          {/* Alerte écart d'unité */}
                          {avoirSapResult.hasUnitMismatch && (
                            <Alert severity="error" sx={{ mb: 2 }}>
                              <Typography variant="subtitle2" sx={{ fontWeight: 'bold' }}>
                                Écart d'unité détecté
                              </Typography>
                              <Typography variant="body2">
                                L'unité de certains articles de l'avoir ne correspond pas à celle de la facture initiale. Vérifiez les lignes marquées en rouge ci-dessous avant d'envoyer.
                              </Typography>
                            </Alert>
                          )}

                          {/* Articles matchés */}
                          {avoirSapResult.matchedItems && avoirSapResult.matchedItems.length > 0 && (
                            <Paper sx={{ mb: 3 }}>
                              <Typography variant="h6" sx={{ p: 2, pb: 1 }}>Articles à rembourser</Typography>
                              <TableContainer>
                                <Table size="small">
                                  <TableHead>
                                    <TableRow>
                                      <MuiTableCell>Référence</MuiTableCell>
                                      <MuiTableCell>Description</MuiTableCell>
                                      <MuiTableCell align="center">Unité initiale</MuiTableCell>
                                      <MuiTableCell align="center">Unité avoir</MuiTableCell>
                                      <MuiTableCell align="right">Qté disponible</MuiTableCell>
                                      <MuiTableCell align="right">Qté à rembourser</MuiTableCell>
                                      <MuiTableCell align="right">Montant avoir</MuiTableCell>
                                    </TableRow>
                                  </TableHead>
                                  <TableBody>
                                    {avoirSapResult.matchedItems.map((item, idx) => (
                                      <TableRow key={idx} sx={item.unitMatch === false ? { bgcolor: '#ffebee' } : {}}>
                                        <MuiTableCell>{item.reference || item.avoir_matnr}</MuiTableCell>
                                        <MuiTableCell>{item.description || 'N/A'}</MuiTableCell>
                                        <MuiTableCell align="center">{item.initial_unit || 'N/A'}</MuiTableCell>
                                        <MuiTableCell align="center">
                                          {item.unitMatch === false ? (
                                            <Chip label={item.avoir_unit || 'N/A'} color="error" size="small" />
                                          ) : (
                                            item.avoir_unit || 'N/A'
                                          )}
                                        </MuiTableCell>
                                        <MuiTableCell align="right">{item.quantity_available || 0}</MuiTableCell>
                                        <MuiTableCell align="right" sx={{ fontWeight: 'bold', color: 'warning.main' }}>{item.quantity_to_refund || 0}</MuiTableCell>
                                        <MuiTableCell align="right">{(parseFloat(item.avoir_netwr || 0) * 100).toLocaleString('fr-FR')}</MuiTableCell>
                                      </TableRow>
                                    ))}
                                  </TableBody>
                                </Table>
                              </TableContainer>
                            </Paper>
                          )}

                          {/* Récapitulatif et envoi */}
                          {avoirSapResult.refundPayload && avoirSapResult.refundPayload.items.length > 0 && (
                            <Paper sx={{ p: 3, mb: 3, border: '2px solid #ff9800', bgcolor: '#fff8e1' }}>
                              <Typography variant="h6" sx={{ mb: 2, color: 'warning.dark' }}>
                                Récapitulatif de l'avoir
                              </Typography>
                              <Grid container spacing={2} sx={{ mb: 2 }}>
                                <Grid item xs={6}>
                                  <Typography variant="body2" color="text.secondary">N° Avoir SAP</Typography>
                                  <Typography fontWeight="bold" fontSize="1.1rem">{avoirSapResult.avoir.numero}</Typography>
                                </Grid>
                                <Grid item xs={6}>
                                  <Typography variant="body2" color="text.secondary">Facture initiale FNE</Typography>
                                  <Typography fontWeight="bold" fontSize="1.1rem">{avoirSapResult.factureInitiale.numero} (Ref: {avoirSapResult.factureInitiale.fne_reference || 'N/A'})</Typography>
                                </Grid>
                                <Grid item xs={4}>
                                  <Typography variant="body2" color="text.secondary">Montant total avoir</Typography>
                                  <Typography fontWeight="bold" color="warning.dark">{(parseFloat(avoirSapResult.avoir.montant || 0) * 100).toLocaleString('fr-FR')} {avoirSapResult.avoir.devise}</Typography>
                                </Grid>
                                <Grid item xs={4}>
                                  <Typography variant="body2" color="text.secondary">Nombre d'articles</Typography>
                                  <Typography fontWeight="bold">{avoirSapResult.refundPayload.items.length}</Typography>
                                </Grid>
                                <Grid item xs={4}>
                                  <Typography variant="body2" color="text.secondary">Date avoir</Typography>
                                  <Typography>{avoirSapResult.avoir.date ? `${avoirSapResult.avoir.date.substring(6,8)}/${avoirSapResult.avoir.date.substring(4,6)}/${avoirSapResult.avoir.date.substring(0,4)}` : 'N/A'}</Typography>
                                </Grid>
                              </Grid>

                              <Typography variant="subtitle2" sx={{ mb: 1 }}>Articles qui seront remboursés :</Typography>
                              {avoirSapResult.matchedItems.filter(it => it.quantity_to_refund > 0).map((item, idx) => (
                                <Box key={idx} sx={{ display: 'flex', justifyContent: 'space-between', py: 0.5, borderBottom: '1px solid #eee' }}>
                                  <Typography variant="body2">{item.description || item.reference} ({item.reference})</Typography>
                                  <Typography variant="body2" fontWeight="bold">{item.quantity_to_refund} x remboursé(s)</Typography>
                                </Box>
                              ))}

                              <Box sx={{ display: 'flex', justifyContent: 'center', mt: 3, gap: 2 }}>
                                <Button
                                  variant="outlined"
                                  onClick={() => { setAvoirSapResult(null); setAvoirSapDownloaded(false); }}
                                >
                                  Annuler
                                </Button>
                                <Button
                                  variant="contained"
                                  color="warning"
                                  size="large"
                                  style={{ display: canSendRefund ? undefined : 'none' }}
                                  onClick={handleSendAvoirRefund}
                                  disabled={avoirSapSending || !avoirSapDownloaded || !!avoirSapResult.hasUnitMismatch}
                                  startIcon={avoirSapSending ? <CircularProgress size={20} /> : <UndoIcon />}
                                  sx={{ px: 4 }}
                                >
                                  {avoirSapSending ? 'Envoi en cours...' : 'Confirmer et Envoyer l\'Avoir FNE'}
                                </Button>
                                {!avoirSapDownloaded && (
                                  <Typography variant="caption" color="error" sx={{ display: 'block', textAlign: 'center', mt: 1 }}>
                                    Veuillez d'abord télécharger l'avoir avant de l'envoyer
                                  </Typography>
                                )}
                                {avoirSapResult.hasUnitMismatch && (
                                  <Typography variant="caption" color="error" sx={{ display: 'block', textAlign: 'center', mt: 1 }}>
                                    Envoi bloqué : l'unité d'au moins un article diffère de la facture initiale.
                                  </Typography>
                                )}
                              </Box>
                            </Paper>
                          )}

                          {avoirSapResult.refundPayload && avoirSapResult.refundPayload.items.length === 0 && (
                            <Paper sx={{ p: 2, bgcolor: '#fff3e0', border: '1px solid #ff9800' }}>
                              <Typography color="text.primary">
                                Aucun article n'a pu être matché entre l'avoir SAP et la facture FNE. Vérifiez les références des articles.
                              </Typography>
                            </Paper>
                          )}
                        </Box>
                      )}

                      {/* Résultat partiel avoir */}
                      {isAvoir && avoirSapResult && avoirSapResult.partial && avoirSapResult.avoir && (
                        <Paper sx={{ p: 3, mt: 3, bgcolor: '#fff8e1' }}>
                          <Typography variant="h6" sx={{ mb: 1 }}>Informations partielles de l'avoir</Typography>
                          <Grid container spacing={2}>
                            <Grid item xs={4}><Typography variant="body2" color="text.secondary">N° Avoir</Typography><Typography>{avoirSapResult.avoir.numero}</Typography></Grid>
                            <Grid item xs={4}><Typography variant="body2" color="text.secondary">Type</Typography><Typography>{avoirSapResult.avoir.type || 'N/A'}</Typography></Grid>
                            <Grid item xs={4}><Typography variant="body2" color="text.secondary">Commande</Typography><Typography>{avoirSapResult.avoir.commande || 'N/A'}</Typography></Grid>
                            {avoirSapResult.avoir.factureInitiale && (
                              <Grid item xs={4}><Typography variant="body2" color="text.secondary">Facture initiale</Typography><Typography>{avoirSapResult.avoir.factureInitiale}</Typography></Grid>
                            )}
                          </Grid>
                        </Paper>
                      )}
                    </Box>
                  ); })()}
                </Box>
              )}

              {selectedPos !== 'NPG_SALE' && selectedPos !== 'SURCCUSALE' && downloadType === 'bulk' && (
                <Box>
                  <Typography variant="h5" gutterBottom sx={{ mb: 3 }}>
                    Téléchargement en masse
                  </Typography>

                  <Box sx={{ mb: 4 }}>
                    <textarea
                      value={bulkSearchInput}
                      onChange={(e) => setBulkSearchInput(e.target.value)}
                      placeholder="Numéros de facture (un par ligne ou séparés par virgule)\nExemple:\n90001234\n90001235"
                      style={{
                        width: '100%',
                        padding: '12px',
                        fontSize: '16px',
                        border: '1px solid #ccc',
                        borderRadius: '4px',
                        minHeight: '120px',
                        fontFamily: 'inherit',
                        resize: 'vertical'
                      }}
                    />
                    <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', mt: 2 }}>
                      <Button
                        variant="contained"
                        onClick={handleBulkSearch}
                        disabled={isBulkSearching || !bulkSearchInput.trim()}
                        startIcon={isBulkSearching ? <CircularProgress size={20} color="inherit" /> : <SearchIcon />}
                      >
                        {isBulkSearching ? 'Recherche...' : 'Rechercher'}
                      </Button>

                      {foundInvoices.length > 0 && (
                        <Button
                          variant="contained"
                          color="secondary"
                          onClick={handleBulkDownload}
                          disabled={isBulkSearching || foundInvoices.every(i => i.status === 'already_downloaded' || i.status === 'success')}
                          startIcon={<DownloadIcon />}
                        >
                          Télécharger tout ({foundInvoices.filter(i => i.status === 'found').length})
                        </Button>
                      )}
                    </Box>

                    {/* Progress bar logic if needed */}
                    {bulkDownloadProgress.total > 0 && (
                      <Typography sx={{ mt: 1 }} variant="body2" color="text.secondary">
                        Traitement: {bulkDownloadProgress.current} / {bulkDownloadProgress.total}
                      </Typography>
                    )}
                  </Box>

                  {error && (
                    <Typography color="error" variant="body1" sx={{ mb: 2 }}>
                      {error}
                    </Typography>
                  )}

                  {/* Table des résultats */}
                  {foundInvoices.length > 0 && (
                    <TableContainer component={Paper} sx={{ mt: 3, mb: 4 }}>
                      <Table>
                        <TableHead>
                          <TableRow>
                            <TableCell>Numéro</TableCell>
                            <TableCell>Client</TableCell>
                            <TableCell align="right">Statut</TableCell>
                            <TableCell align="right">Actions</TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {foundInvoices.map((inv, idx) => (
                            <TableRow
                              key={`${inv.numero}-${idx}`}
                              hover
                              sx={{
                                bgcolor: inv.isInitialOf ? '#e3f2fd' : (inv.status === 'awaiting_initial' ? '#fff3e0' : 'inherit'),
                                borderLeft: inv.isInitialOf ? '3px solid #1976d2' : (inv.status === 'awaiting_initial' ? '3px solid #ed6c02' : 'none'),
                              }}
                            >
                              <TableCell>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                                  <span>{inv.numero}</span>
                                  {inv.isInitialOf && (
                                    <Tooltip title={`Facture initiale liée à l'avoir ${inv.isInitialOf}`}>
                                      <Chip label={`init de ${inv.isInitialOf}`} size="small" color="primary" variant="outlined" sx={{ height: 20, fontSize: '0.65rem' }} />
                                    </Tooltip>
                                  )}
                                  {inv.linkedInitial && (
                                    <Tooltip title={`Avoir bloqué — facture initiale ${inv.linkedInitial} requise`}>
                                      <Chip label={`init: ${inv.linkedInitial}`} size="small" color="warning" variant="outlined" sx={{ height: 20, fontSize: '0.65rem' }} />
                                    </Tooltip>
                                  )}
                                </Box>
                              </TableCell>
                              <TableCell>{inv.client}</TableCell>
                              <TableCell align="right">
                                {inv.status === 'already_downloaded' && (
                                  <Chip label="Déjà téléchargé" color="warning" size="small" />
                                )}
                                {inv.status === 'found' && (
                                  <Chip label="Prêt à télécharger" color="primary" size="small" variant="outlined" />
                                )}
                                {inv.status === 'downloading' && (
                                  <Chip label="Téléchargement..." color="info" size="small" />
                                )}
                                {inv.status === 'success' && (
                                  <Chip label="Téléchargé" color="success" size="small" />
                                )}
                                {inv.status === 'error' && (
                                  <Chip label="Erreur" color="error" size="small" />
                                )}
                                {inv.status === 'avoir_unresolved' && (
                                  <Chip label="Avoir : facture initiale absente" color="warning" size="small" />
                                )}
                                {inv.status === 'awaiting_initial' && (
                                  <Chip label="En attente envoi initiale FNE" color="warning" size="small" />
                                )}
                              </TableCell>
                              <TableCell align="right">
                                <Tooltip title="Voir détails">
                                  <IconButton
                                    size="small"
                                    color="primary"
                                    onClick={() => {
                                      setFacture(inv.data);
                                      setViewMode('download');
                                      setIsDetailViewMode(true);
                                    }}
                                  >
                                    <VisibilityIcon fontSize="small" />
                                  </IconButton>
                                </Tooltip>
                                <Tooltip title={
                                  inv.avoirResolution?.success === false
                                    ? "Avoir : la facture initiale sera recherchée/téléchargée d'abord"
                                    : "Télécharger cette facture individuellement"
                                }>
                                  <span>
                                    <IconButton
                                      size="small"
                                      color="secondary"
                                      disabled={
                                        inv.status === 'already_downloaded' ||
                                        inv.status === 'success' ||
                                        inv.status === 'downloading'
                                      }
                                      onClick={() => handleDownloadOneFromBulk(idx)}
                                    >
                                      <DownloadIcon fontSize="small" />
                                    </IconButton>
                                  </span>
                                </Tooltip>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  )}
                </Box>
              )}

              {selectedPos !== 'NPG_SALE' && selectedPos !== 'SURCCUSALE' && downloadType === 'dateRange' && (
                <Box>
                  <Typography variant="h5" gutterBottom sx={{ mb: 3 }}>
                    Rechercher par plage de dates
                  </Typography>

                  <Box sx={{ mb: 4, display: 'flex', gap: 2, alignItems: 'center' }}>
                    <TextField
                      label="De"
                      type="date"
                      value={dateRangeFrom}
                      onChange={(e) => setDateRangeFrom(e.target.value)}
                      InputLabelProps={{ shrink: true }}
                      size="small"
                    />
                    <TextField
                      label="À"
                      type="date"
                      value={dateRangeTo}
                      onChange={(e) => setDateRangeTo(e.target.value)}
                      InputLabelProps={{ shrink: true }}
                      size="small"
                    />
                    <Button
                      variant="contained"
                      onClick={handleDateRangeSearch}
                      disabled={isSearchingByDate || !dateRangeFrom || !dateRangeTo}
                      startIcon={isSearchingByDate ? <CircularProgress size={20} color="inherit" /> : <SearchIcon />}
                    >
                      {isSearchingByDate ? 'Recherche...' : 'Rechercher'}
                    </Button>

                    <FormControl size="small" sx={{ minWidth: 170 }}>
                      <InputLabel>Type de facture</InputLabel>
                      <Select
                        value={dateRangeTypeFilter}
                        label="Type de facture"
                        onChange={(e) => {
                          setDateRangeTypeFilter(e.target.value);
                          setSelectedDateRangeInvoices([]);
                        }}
                      >
                        <MenuItem value="all">Tout</MenuItem>
                        <MenuItem value="invoice">Facture initiale</MenuItem>
                        <MenuItem value="refund">Avoir</MenuItem>
                      </Select>
                    </FormControl>

                    {filteredInvoicesByDate.length > 0 && (
                      <Button
                        variant="contained"
                        color="secondary"
                        onClick={handleDownloadSelectedDateRange}
                        disabled={isSearchingByDate || selectedDateRangeInvoices.length === 0}
                        startIcon={<DownloadIcon />}
                      >
                        Télécharger sélection ({selectedDateRangeInvoices.length})
                      </Button>
                    )}
                    {filteredInvoicesByDate.length > 0 && (
                      <Button
                        variant="outlined"
                        onClick={handleDateRangeSelectAll}
                        disabled={isSearchingByDate}
                      >
                        Tout sélectionner (max 15)
                      </Button>
                    )}
                  </Box>

                  {error && (
                    <Typography color="error" variant="body1" sx={{ mb: 2 }}>
                      {error}
                    </Typography>
                  )}

                  {/* Table des résultats par date */}
                  {filteredInvoicesByDate.length > 0 && (
                    <TableContainer component={Paper} sx={{ mt: 3, mb: 4 }}>
                      <Table>
                        <TableHead>
                          <TableRow>
                            <TableCell padding="checkbox">Select</TableCell>
                            <TableCell>Numéro</TableCell>
                            <TableCell>Date SAP</TableCell>
                            <TableCell>Type</TableCell>
                            <TableCell>Client</TableCell>
                            <TableCell>TOTAL NET HT</TableCell>
                            <TableCell align="right">Statut</TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {filteredInvoicesByDate.map((inv) => (
                            <TableRow key={inv.numero} hover onClick={() => {
                              if (inv.status !== 'already_downloaded' && inv.status !== 'success') {
                                handleDateRangeSelection(inv.numero);
                              }
                            }} sx={{ cursor: 'pointer' }}>
                              <TableCell padding="checkbox">
                                <Checkbox
                                  checked={selectedDateRangeInvoices.includes(inv.numero)}
                                  onChange={(e) => {
                                    e.stopPropagation();
                                    handleDateRangeSelection(inv.numero);
                                  }}
                                  disabled={inv.status === 'already_downloaded' || inv.status === 'success'}
                                />
                              </TableCell>
                              <TableCell>{inv.numero}</TableCell>
                              <TableCell>{inv.date}</TableCell>
                              <TableCell>
                                <Chip
                                  label={isAvoirType(inv.type) ? 'Avoir' : 'Facture'}
                                  color={isAvoirType(inv.type) ? 'warning' : 'primary'}
                                  size="small"
                                  variant="outlined"
                                />
                              </TableCell>
                              <TableCell>
                                <Typography variant="body2" sx={{ fontWeight: 'bold' }}>{inv.nomClient}</Typography>
                                <Typography variant="caption" color="text.secondary">{inv.client}</Typography>
                              </TableCell>
                              <TableCell>
                                {parseFloat(inv.montant).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".")} {inv.devise}
                              </TableCell>
                              <TableCell align="right">
                                {inv.status === 'already_downloaded' && (
                                  <Chip label="Déjà téléchargé" color="warning" size="small" />
                                )}
                                {inv.status === 'found' && (
                                  <Chip label="Prêt" color="primary" size="small" variant="outlined" />
                                )}
                                {inv.status === 'success' && (
                                  <Chip label="Téléchargé" color="success" size="small" />
                                )}
                                {inv.status === 'error' && (
                                  <Chip label="Erreur" color="error" size="small" />
                                )}
                                {inv.status === 'avoir_unresolved' && (
                                  <Chip label="Avoir non résolu — télécharger individuellement" color="warning" size="small" />
                                )}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  )}
                </Box>
              )}

            </Box>
          </Container>
        ) : viewMode === 'list' ? (
          <Container maxWidth="lg">
            <Typography variant="h5" gutterBottom sx={{ mb: 3 }}>
              Factures Téléchargées (Non Envoyées)
            </Typography>

            {listOnlyErrors && (
              <Alert
                severity="warning"
                sx={{ mb: 2 }}
                action={
                  <Button color="inherit" size="small" onClick={() => setListOnlyErrors(false)}>
                    Voir tout
                  </Button>
                }
              >
                Filtre actif : <b>factures en erreur uniquement</b>{selectedPos ? ` (type ${selectedPos})` : ''}.
              </Alert>
            )}

            {/* Filtres et recherche */}
            <Box sx={{ mb: 3, display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}>
              {/* Filtre par plage de dates */}
              <TextField
                size="small"
                type="date"
                label="Date (de)"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                InputLabelProps={{ shrink: true }}
                sx={{ minWidth: 150 }}
              />
              <TextField
                size="small"
                type="date"
                label="Date (à)"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                InputLabelProps={{ shrink: true }}
                sx={{ minWidth: 150 }}
              />

              {/* Recherche */}
              <TextField
                size="small"
                multiline
                maxRows={4}
                placeholder="Rechercher par N° ou client... (Entrée/Saut de ligne pour plusieurs)"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon />
                    </InputAdornment>
                  ),
                }}
                sx={{ minWidth: 250, flexGrow: 1 }}
              />

              {/* Boutons pour réinitialiser les filtres */}
              <Button
                variant="outlined"
                size="small"
                onClick={() => {
                  setSearchTerm('');
                  setDateFrom('');
                  setDateTo('');
                }}
              >
                Réinitialiser
              </Button>

              {selectedInvoiceIds.length > 0 && (
                <>
                  <Button
                    variant="contained"
                    color="secondary"
                    style={{ display: canSendInvoice ? undefined : 'none' }}
                    onClick={handleBulkSend}
                    disabled={isBulkSending}
                    startIcon={isBulkSending ? <CircularProgress size={20} color="inherit" /> : <SendIcon />}
                    sx={{ ml: 2 }}
                  >
                    Envoyer ({selectedInvoiceIds.length})
                  </Button>
                  <Button
                    variant="contained"
                    color="error"
                    style={{ display: canDeleteInvoice ? undefined : 'none' }}
                    onClick={handleBulkDelete}
                    disabled={isBulkSending}
                    startIcon={isBulkSending ? <CircularProgress size={20} color="inherit" /> : <DeleteIcon />}
                    sx={{ ml: 1 }}
                  >
                    Supprimer ({selectedInvoiceIds.length})
                  </Button>
                </>
              )}

              <Button
                variant="outlined"
                color="primary"
                onClick={handleSelectAll}
                disabled={isBulkSending || downloadedInvoices.length === 0}
                sx={{ ml: 1 }}
              >
                Sélectionner tout (max 15)
              </Button>

              <Button
                variant="contained"
                color="secondary"
                style={{ display: canSendInvoice ? undefined : 'none' }}
                onClick={handleSelectAllAndSend}
                disabled={isBulkSending || downloadedInvoices.length === 0}
                startIcon={isBulkSending ? <CircularProgress size={20} color="inherit" /> : <SendIcon />}
                sx={{ ml: 1 }}
              >
                Tout Envoyer (max 15)
              </Button>
            </Box>

            {/* Affichage du nombre de résultats */}
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              {downloadedInvoices.length} facture(s) trouvée(s)
            </Typography>

            <TableContainer component={Paper}>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell padding="checkbox">Select</TableCell>
                    <TableCell>Type</TableCell>
                    <TableCell sortDirection={sortBy === 'numero' ? sortOrder.toLowerCase() : false}>
                      <TableSortLabel
                        active={sortBy === 'numero'}
                        direction={sortBy === 'numero' ? sortOrder.toLowerCase() : 'asc'}
                        onClick={() => handleSort('numero')}
                        sx={{
                          '&:hover': { color: 'primary.dark' },
                          '&:hover .MuiTableSortLabel-icon': { opacity: 1, color: 'primary.main' },
                          '&.Mui-active': { color: 'primary.main' },
                          '&.Mui-active .MuiTableSortLabel-icon': { color: 'primary.main' }
                        }}
                      >
                        N° Facture
                      </TableSortLabel>
                    </TableCell>
                    <TableCell sortDirection={sortBy === 'client' ? sortOrder.toLowerCase() : false}>
                      <TableSortLabel
                        active={sortBy === 'client'}
                        direction={sortBy === 'client' ? sortOrder.toLowerCase() : 'asc'}
                        onClick={() => handleSort('client')}
                        sx={{
                          '&:hover': { color: 'primary.dark' },
                          '&:hover .MuiTableSortLabel-icon': { opacity: 1, color: 'primary.main' },
                          '&.Mui-active': { color: 'primary.main' },
                          '&.Mui-active .MuiTableSortLabel-icon': { color: 'primary.main' }
                        }}
                      >
                        Client
                      </TableSortLabel>
                    </TableCell>
                    <TableCell sortDirection={sortBy === 'username' ? sortOrder.toLowerCase() : false}>
                      <TableSortLabel
                        active={sortBy === 'username'}
                        direction={sortBy === 'username' ? sortOrder.toLowerCase() : 'asc'}
                        onClick={() => handleSort('username')}
                        sx={{
                          '&:hover': { color: 'primary.dark' },
                          '&:hover .MuiTableSortLabel-icon': { opacity: 1, color: 'primary.main' },
                          '&.Mui-active': { color: 'primary.main' },
                          '&.Mui-active .MuiTableSortLabel-icon': { color: 'primary.main' }
                        }}
                      >
                        Téléchargé par
                      </TableSortLabel>
                    </TableCell>
                    <TableCell sortDirection={sortBy === 'download_date' ? sortOrder.toLowerCase() : false}>
                      <TableSortLabel
                        active={sortBy === 'download_date'}
                        direction={sortBy === 'download_date' ? sortOrder.toLowerCase() : 'asc'}
                        onClick={() => handleSort('download_date')}
                        sx={{
                          '&:hover': { color: 'primary.dark' },
                          '&:hover .MuiTableSortLabel-icon': { opacity: 1, color: 'primary.main' },
                          '&.Mui-active': { color: 'primary.main' },
                          '&.Mui-active .MuiTableSortLabel-icon': { color: 'primary.main' }
                        }}
                      >
                        Date de téléchargement
                      </TableSortLabel>
                    </TableCell>
                    <TableCell>Point de Vente</TableCell>
                    <TableCell align="right">TOTAL NET HT</TableCell>
                    <TableCell align="right">Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {(() => {
                    const visibleInvoices = listOnlyErrors
                      ? downloadedInvoices.filter(inv => inv.status === 'failed')
                      : downloadedInvoices;

                    // ─── Groupement par N°Dossier (factures EXPORT) ───
                    // Construit une séquence d'entrées : soit un header de dossier
                    // (ligne dépliable), soit une facture standalone.
                    const groupsMap = new Map();
                    const withoutDossier = [];
                    for (const inv of visibleInvoices) {
                      const d = getNumeroDossier(inv);
                      if (!d) { withoutDossier.push(inv); continue; }
                      if (!groupsMap.has(d)) groupsMap.set(d, []);
                      groupsMap.get(d).push(inv);
                    }
                    const sortedDossiers = Array.from(groupsMap.entries())
                      .sort(([a], [b]) => a.localeCompare(b));
                    const sequence = [];
                    for (const [dossier, invs] of sortedDossiers) {
                      sequence.push({ type: 'header', dossier, invoices: invs });
                      if (expandedDossiers.has(dossier)) {
                        for (const inv of invs) sequence.push({ type: 'invoice', invoice: inv, inDossier: true });
                      }
                    }
                    for (const inv of withoutDossier) sequence.push({ type: 'invoice', invoice: inv, inDossier: false });

                    return sequence.length > 0 ? (
                      sequence
                        .slice(downloadedPage * downloadedRowsPerPage, (downloadedPage + 1) * downloadedRowsPerPage)
                        .map((entry) => {
                      if (entry.type === 'header') {
                        const { dossier, invoices: dossierInvoices } = entry;
                        const expanded = expandedDossiers.has(dossier);
                        const totalHT = dossierInvoices.reduce((sum, inv) => {
                          const d = inv.computedDetails || invoiceDetails[inv.id];
                          return sum + (Number(d?.totalNetHT) || 0);
                        }, 0);
                        const eligibleIds = dossierInvoices
                          .filter(inv => {
                            const isTemplate = String(inv.id).startsWith('TMP_') ||
                              (inv.data && (
                                (Array.isArray(inv.data) && inv.data[0]?.source === 'template_import') ||
                                (inv.data.source === 'template_import') ||
                                (inv.data.data?.[0]?.source === 'template_import')
                              ));
                            const isVerified = inv.verified || inv.verified === 1 || inv.verified === true;
                            const alreadySent = sentInvoices.some(s =>
                              (s.numero_facture === inv.numero || s.numero_facture === inv.numeroFacture) &&
                              s.status !== 'failed'
                            );
                            return (isTemplate || isVerified) && !alreadySent;
                          })
                          .map(inv => inv.id);
                        return (
                          <TableRow
                            key={`dossier-header-${dossier}`}
                            sx={{ bgcolor: '#e8f0fe', '&:hover': { bgcolor: '#d2e3fc' } }}
                          >
                            <TableCell colSpan={9} sx={{ py: 1 }}>
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
                                <IconButton
                                  size="small"
                                  onClick={() => setExpandedDossiers(prev => {
                                    const next = new Set(prev);
                                    if (next.has(dossier)) next.delete(dossier); else next.add(dossier);
                                    return next;
                                  })}
                                  aria-label={expanded ? 'Replier' : 'Déplier'}
                                  sx={{ p: 0.5 }}
                                >
                                  {expanded ? <ArrowDropDownIcon /> : <ArrowForwardIcon fontSize="small" />}
                                </IconButton>
                                <Chip
                                  label={`Dossier ${dossier}`}
                                  color="primary"
                                  size="small"
                                  sx={{ fontWeight: 600 }}
                                />
                                <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                                  {dossierInvoices.length} facture(s)
                                  {totalHT > 0 && ` · Total HT : ${formatMontant(totalHT)}`}
                                </Typography>
                                <Box sx={{ flexGrow: 1 }} />
                                <Button
                                  size="small"
                                  variant="outlined"
                                  onClick={() => setSelectedInvoiceIds(prev => {
                                    const set = new Set(prev);
                                    eligibleIds.forEach(id => set.add(id));
                                    return Array.from(set).slice(0, 15);
                                  })}
                                  disabled={eligibleIds.length === 0}
                                  title={eligibleIds.length === 0
                                    ? "Aucune facture éligible (déjà envoyée ou non vérifiée)"
                                    : `Sélectionne les ${eligibleIds.length} factures éligibles du dossier`}
                                >
                                  Sélectionner ({eligibleIds.length})
                                </Button>
                                <Button
                                  size="small"
                                  variant="contained"
                                  color="secondary"
                                  startIcon={<SendIcon />}
                                  onClick={async () => {
                                    setSelectedInvoiceIds(eligibleIds.slice(0, 15));
                                    setTimeout(() => handleBulkSend(), 50);
                                  }}
                                  disabled={isBulkSending || eligibleIds.length === 0}
                                >
                                  Envoyer le dossier
                                </Button>
                              </Box>
                            </TableCell>
                          </TableRow>
                        );
                      }
                      const invoice = entry.invoice;
                      const inDossier = entry.inDossier === true;
                      const isVerified = invoice.verified || invoice.verified === 1 || invoice.verified === true;
                      const invoiceFkart = (() => {
                        try {
                          const d = typeof invoice.data === 'string' ? JSON.parse(invoice.data) : invoice.data;
                          const firstItem = Array.isArray(d) ? d[0] : (d?.data?.[0] || d);
                          return (firstItem?.fkart || '').trim();
                        } catch { return ''; }
                      })();
                      const isDownloadedAvoir = invoiceFkart.includes('G2') || invoiceFkart.includes('RE') || invoiceFkart.includes('S1') || invoiceFkart.includes('CR');
                      return (
                        <TableRow
                          key={invoice.id}
                          hover
                          sx={{
                            bgcolor: invoice.status === 'failed'
                              ? '#FFA500'
                              : isDownloadedAvoir
                                ? '#fff8e1'
                                : inDossier
                                  ? '#e3f2fd'
                                  : (isVerified ? 'inherit' : '#e3f2fd'),
                            borderLeft: inDossier ? '3px solid #1976d2' : 'none',
                            '&.MuiTableRow-hover:hover': {
                              bgcolor: invoice.status === 'failed'
                                ? '#FF8C00'
                                : isDownloadedAvoir
                                  ? '#fff3e0'
                                  : inDossier
                                    ? '#bbdefb'
                                    : (isVerified ? 'action.hover' : '#bbdefb')
                            }
                          }}
                        >
                          <TableCell padding="checkbox">
                            <Checkbox
                              checked={selectedInvoiceIds.includes(invoice.id)}
                              onChange={() => handleToggleSelection(invoice.id)}
                              disabled={!isVerified}
                              color="primary"
                            />
                          </TableCell>
                          <TableCell>
                            <Chip
                              label={isDownloadedAvoir ? 'Avoir' : 'Facture'}
                              color={isDownloadedAvoir ? 'warning' : 'primary'}
                              size="small"
                            />
                          </TableCell>
                          <TableCell>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                              {invoice.status === 'failed' && (
                                <Tooltip title="Dernière tentative d'envoi échouée">
                                  <ErrorOutlineIcon color="error" fontSize="small" />
                                </Tooltip>
                              )}
                              <span>{invoice.computedDetails?.numeroFacture || (invoiceDetails[invoice.id]?.numeroFacture) || 'Chargement...'}</span>
                              {isDownloadedAvoir && (() => {
                                // Pour un avoir : récupérer le numéro de la facture initiale depuis _avoirResolution
                                try {
                                  const d = typeof invoice.data === 'string' ? JSON.parse(invoice.data) : invoice.data;
                                  const arr = Array.isArray(d) ? d : (d?.data || []);
                                  const avoirRes = arr.find(x => x?._avoirResolution)?._avoirResolution;
                                  const initialNum = avoirRes?.factureInitiale?.numero || avoirRes?.avoir?.factureInitiale;
                                  if (initialNum) {
                                    return (
                                      <Tooltip title={`Facture initiale liée à cet avoir : ${initialNum}`}>
                                        <Chip
                                          icon={<UndoIcon style={{ fontSize: 12 }} />}
                                          label={initialNum}
                                          size="small"
                                          variant="outlined"
                                          sx={{ height: 20, fontSize: '0.7rem', borderColor: '#ed6c02', color: '#ed6c02' }}
                                        />
                                      </Tooltip>
                                    );
                                  }
                                } catch { /* ignore */ }
                                return null;
                              })()}
                            </Box>
                          </TableCell>
                          <TableCell>
                            {invoice.computedDetails?.nomClient || (invoiceDetails[invoice.id]?.nomClient) || 'Chargement...'}
                          </TableCell>
                          <TableCell>{invoice.username}</TableCell>
                          <TableCell>{new Date(invoice.download_date || invoice.date).toLocaleString('fr-FR')}</TableCell>
                          <TableCell>
                            {(() => {
                              const details = invoice.computedDetails || invoiceDetails[invoice.id];
                              const invoiceNumber = details?.numeroFacture || invoice.numero || (Array.isArray(invoice.data) ? invoice.data[0]?.numeroFacture : invoice.data?.numeroFacture);
                              return getModifiedValue(invoiceNumber, 'PointOfSale', details?.pointOfSale || 'N/A');
                            })()}
                          </TableCell>
                          <TableCell align="right">
                            {(() => {
                              const details = invoice.computedDetails || invoiceDetails[invoice.id];
                              if (!details) return '...';

                              // Détection robuste de template
                              const isTemplate = String(invoice.id).startsWith('TMP_') ||
                                (invoice.data && (
                                  (Array.isArray(invoice.data) && invoice.data[0]?.source === 'template_import') ||
                                  (invoice.data.source === 'template_import') ||
                                  (invoice.data.data?.[0]?.source === 'template_import')
                                ));

                              return isTemplate
                                ? formatMontantSimple(details.totalNetHT)
                                : formatMontant(details.totalNetHT);
                            })()}
                          </TableCell>
                          <TableCell align="right">
                            <IconButton
                              onClick={() => handleViewInvoice(invoice)}
                              color="primary"
                              aria-label="Voir la facture"
                            >
                              <VisibilityIcon />
                            </IconButton>
                            <IconButton
                              onClick={() => handleSendInvoice(invoice)}
                              color="secondary"
                              aria-label="Envoyer la facture"
                              style={{ display: canSendInvoice ? undefined : 'none' }}
                              sx={{ ml: 1 }}
                              disabled={
                                // Désactiver si pas vérifiée (sauf pour les imports template)
                                (() => {
                                  const isTemplate = String(invoice.id).startsWith('TMP_') ||
                                    (invoice.data && (
                                      (Array.isArray(invoice.data) && invoice.data[0]?.source === 'template_import') ||
                                      (invoice.data.source === 'template_import') ||
                                      (invoice.data.data?.[0]?.source === 'template_import')
                                    ));
                                  return (!isTemplate && !invoice.verified && invoice.verified !== 1 && invoice.verified !== true);
                                })() ||
                                // Désactiver si déjà envoyée
                                sentInvoices.some(sentInvoice =>
                                  (sentInvoice.numero_facture === invoice.numero ||
                                    sentInvoice.numero_facture === invoice.numeroFacture ||
                                    sentInvoice.numero_facture === (invoice.data?.[0]?.data?.[0]?.numeroFacture) ||
                                    sentInvoice.numero_facture === (invoice.data?.[0]?.success?.data?.[0]?.numeroFacture)) &&
                                  sentInvoice.status !== 'failed'
                                ) ||
                                // Déjà marquée FNE dans SAP → envoi bloqué
                                invoice.fne_marked
                              }
                              title={
                                invoice.fne_marked
                                  ? 'Facture déjà marquée FNE dans SAP — envoi bloqué'
                                  : (!String(invoice.id).startsWith('TMP_') && !invoice.verified && invoice.verified !== 1 && invoice.verified !== true)
                                  ? "Vous devez d'abord vérifier la facture en cliquant sur 'Voir Détails'"
                                  : sentInvoices.some(sentInvoice =>
                                    (sentInvoice.numero_facture === invoice.numero ||
                                      sentInvoice.numero_facture === invoice.numeroFacture ||
                                      sentInvoice.numero_facture === (invoice.data?.[0]?.data?.[0]?.numeroFacture) ||
                                      sentInvoice.numero_facture === (invoice.data?.[0]?.success?.data?.[0]?.numeroFacture)) &&
                                    sentInvoice.status !== 'failed'
                                  )
                                    ? "Cette facture a déjà été envoyée et ne peut pas être envoyée à nouveau"
                                    : "Envoyer la facture"
                              }
                            >
                              <SendIcon />
                            </IconButton>
                            <IconButton
                              onClick={() => confirmDeleteInvoice(invoice)}
                              color="error"
                              aria-label="Supprimer la facture"
                              style={{ display: canDeleteInvoice ? undefined : 'none' }}
                              sx={{ ml: 1 }}
                              disabled={sentInvoices.some(sentInvoice =>
                                sentInvoice.numero_facture === invoice.numero ||
                                sentInvoice.numero_facture === invoice.numeroFacture
                              )}
                              title={sentInvoices.some(sentInvoice =>
                                sentInvoice.numero_facture === invoice.numero ||
                                sentInvoice.numero_facture === invoice.numeroFacture
                              ) ? "Cette facture a déjà été envoyée et ne peut pas être supprimée" : "Supprimer la facture"}
                            >
                              <DeleteIcon />
                            </IconButton>
                          </TableCell>
                        </TableRow>
                      );
                    })
                    ) : (
                      <TableRow>
                        <TableCell colSpan={9} align="center" sx={{ py: 3 }}>
                          {downloadedInvoices.length === 0
                            ? "Aucune facture téléchargée"
                            : (listOnlyErrors
                              ? "Aucune facture en erreur pour ce type"
                              : "Aucune facture correspondant aux filtres")
                          }
                        </TableCell>
                      </TableRow>
                    );
                  })()}
                </TableBody>
              </Table>
              <TablePagination
                component="div"
                count={(() => {
                  const inv = listOnlyErrors
                    ? downloadedInvoices.filter(i => i.status === 'failed')
                    : downloadedInvoices;
                  let total = 0;
                  const seenDossiers = new Set();
                  for (const it of inv) {
                    const d = getNumeroDossier(it);
                    if (!d) { total += 1; continue; }
                    if (!seenDossiers.has(d)) { seenDossiers.add(d); total += 1; } // header
                    if (expandedDossiers.has(d)) total += 1;
                  }
                  return total;
                })()}
                page={downloadedPage}
                onPageChange={(e, p) => setDownloadedPage(p)}
                rowsPerPage={downloadedRowsPerPage}
                onRowsPerPageChange={(e) => { setDownloadedRowsPerPage(parseInt(e.target.value, 10)); setDownloadedPage(0); }}
                rowsPerPageOptions={[20, 50, 100]}
                labelRowsPerPage="Lignes par page"
                labelDisplayedRows={({ from, to, count }) => `${from}-${to} sur ${count}`}
              />
            </TableContainer>
          </Container>

        ) : viewMode === 'sent' ? (
          <Container maxWidth={false}>
            <Typography variant="h5" gutterBottom sx={{ mb: 3 }}>
              Factures Envoyées
            </Typography>

            {/* Filtres et recherche pour les factures envoyées */}
            <Box sx={{ mb: 3, display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}>
              {/* Filtre par plage de date d'envoi */}
              <TextField
                size="small"
                type="date"
                label="Date d'envoi (de)"
                value={sentDateFrom}
                onChange={(e) => setSentDateFrom(e.target.value)}
                InputLabelProps={{ shrink: true }}
                sx={{ minWidth: 150 }}
              />
              <TextField
                size="small"
                type="date"
                label="Date d'envoi (à)"
                value={sentDateTo}
                onChange={(e) => setSentDateTo(e.target.value)}
                InputLabelProps={{ shrink: true }}
                sx={{ minWidth: 150 }}
              />

              {/* Recherche par numéro de facture ou référence */}
              <TextField
                size="small"
                multiline
                maxRows={4}
                placeholder="Rechercher par N° facture ou référence... (Entrée/Saut de ligne pour plusieurs)"
                value={sentSearchTerm}
                onChange={(e) => setSentSearchTerm(e.target.value)}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon />
                    </InputAdornment>
                  ),
                }}
                sx={{ minWidth: 300, flexGrow: 1 }}
                helperText="Vous pouvez coller une liste de numéros (un par ligne)"
              />

              {/* Filtre par utilisateur */}
              <TextField
                size="small"
                placeholder="Filtrer par utilisateur..."
                value={sentUserFilter}
                onChange={(e) => setSentUserFilter(e.target.value)}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon />
                    </InputAdornment>
                  ),
                }}
                sx={{ minWidth: 200 }}
              />

              {/* Filtre par type de facture */}
              <FormControl size="small" sx={{ minWidth: 150 }}>
                <InputLabel>Type de facture</InputLabel>
                <Select
                  value={sentInvoiceTypeFilter}
                  label="Type de facture"
                  onChange={(e) => setSentInvoiceTypeFilter(e.target.value)}
                >
                  <MenuItem value="all">Tout</MenuItem>
                  <MenuItem value="error">En Erreur</MenuItem>
                  <MenuItem value="manual">Manuelle</MenuItem>
                  <MenuItem value="normal">Normale</MenuItem>
                  <MenuItem value="with_refunds">Avec avoir(s)</MenuItem>
                  <MenuItem value="with_cancellation">Avec annulation FNE</MenuItem>
                </Select>
              </FormControl>

              {/* Boutons pour réinitialiser les filtres */}
              <Button
                variant="outlined"
                size="small"
                onClick={() => {
                  setSentDateFrom('');
                  setSentDateTo('');
                  setSentSearchTerm('');
                  setSentUserFilter('');
                  setSentInvoiceTypeFilter('all');
                  setSentSortBy('SendOn');
                  setSentSortOrder('DESC');
                  setSentPage(0);
                }}
              >
                Réinitialiser
              </Button>

              <Button
                variant={sentExpandAll ? 'contained' : 'outlined'}
                size="small"
                onClick={() => setSentExpandAll(v => !v)}
                startIcon={sentExpandAll ? <ArrowDropDownIcon /> : <ArrowForwardIcon />}
                sx={{ ml: 'auto' }}
              >
                {sentExpandAll ? 'Tout replier' : 'Tout déplier'}
              </Button>

              <Button
                variant="contained"
                color="success"
                size="small"
                startIcon={<FileDownloadIcon />}
                onClick={handleExportSentInvoices}
              >
                Exporter (XLS)
              </Button>
            </Box>

            {/* Affichage du nombre de résultats */}
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              {sentInvoices.length} facture(s) envoyée(s) trouvée(s)
            </Typography>

            <TableContainer component={Paper}>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ py: 1, px: 1, fontSize: '0.8rem' }}>Type</TableCell>
                    <TableCell
                      sortDirection={sentSortBy === 'numero_facture' ? sentSortOrder.toLowerCase() : false}
                      sx={{ py: 1, px: 1, fontSize: '0.8rem' }}
                    >
                      <TableSortLabel
                        active={sentSortBy === 'numero_facture'}
                        direction={sentSortBy === 'numero_facture' ? sentSortOrder.toLowerCase() : 'asc'}
                        onClick={() => handleSentSort('numero_facture')}
                        sx={{
                          '&:hover': { color: 'primary.dark' },
                          '&:hover .MuiTableSortLabel-icon': { opacity: 1, color: 'primary.main' },
                          '&.Mui-active': { color: 'primary.main' },
                          '&.Mui-active .MuiTableSortLabel-icon': { color: 'primary.main' }
                        }}
                      >
                        N° Facture
                      </TableSortLabel>
                    </TableCell>
                    <TableCell sx={{ py: 1, px: 1, fontSize: '0.8rem' }}>Client</TableCell>
                    <TableCell sx={{ py: 1, px: 1, fontSize: '0.8rem' }}>Point de Vente</TableCell>
                    <TableCell align="right" sx={{ py: 1, px: 1, fontSize: '0.8rem' }}>TOTAL A PAYER</TableCell>
                    <TableCell
                      sortDirection={sentSortBy === 'username' ? sentSortOrder.toLowerCase() : false}
                      sx={{ py: 1, px: 1, fontSize: '0.8rem' }}
                    >
                      <TableSortLabel
                        active={sentSortBy === 'username'}
                        direction={sentSortBy === 'username' ? sentSortOrder.toLowerCase() : 'asc'}
                        onClick={() => handleSentSort('username')}
                        sx={{
                          '&:hover': { color: 'primary.dark' },
                          '&:hover .MuiTableSortLabel-icon': { opacity: 1, color: 'primary.main' },
                          '&.Mui-active': { color: 'primary.main' },
                          '&.Mui-active .MuiTableSortLabel-icon': { color: 'primary.main' }
                        }}
                      >
                        Envoyée par
                      </TableSortLabel>
                    </TableCell>
                    <TableCell sx={{ py: 1, px: 1, fontSize: '0.8rem' }}>Référence FNE</TableCell>
                    <TableCell
                      sortDirection={sentSortBy === 'SendOn' ? sentSortOrder.toLowerCase() : false}
                      sx={{ py: 1, px: 1, fontSize: '0.8rem' }}
                    >
                      <TableSortLabel
                        active={sentSortBy === 'SendOn'}
                        direction={sentSortBy === 'SendOn' ? sentSortOrder.toLowerCase() : 'asc'}
                        onClick={() => handleSentSort('SendOn')}
                        sx={{
                          '&:hover': { color: 'primary.dark' },
                          '&:hover .MuiTableSortLabel-icon': { opacity: 1, color: 'primary.main' },
                          '&.Mui-active': { color: 'primary.main' },
                          '&.Mui-active .MuiTableSortLabel-icon': { color: 'primary.main' }
                        }}
                      >
                        Date d'envoi
                      </TableSortLabel>
                    </TableCell>
                    <TableCell sx={{ py: 1, px: 1, fontSize: '0.8rem' }}>Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {sentInvoices.length > 0 ? (() => {
                    // ─── Groupement hiérarchique : chaque facture (non-refund) devient un groupe,
                    //     les avoirs liés (via initial_invoice_numero) sont imbriqués dessous.
                    const groups = [];
                    const indexByNumero = new Map();
                    sentInvoices.forEach(inv => {
                      if (inv.invoice_type !== 'refund') {
                        groups.push({ parent: inv, children: [], orphan: false });
                        if (!indexByNumero.has(inv.numero_facture)) {
                          indexByNumero.set(inv.numero_facture, groups.length - 1);
                        }
                      }
                    });
                    sentInvoices.forEach(inv => {
                      if (inv.invoice_type === 'refund') {
                        const parentNum = inv.initial_invoice_numero || inv.numero_facture;
                        const idx = indexByNumero.get(parentNum);
                        if (idx !== undefined) {
                          groups[idx].children.push(inv);
                        } else {
                          groups.push({ parent: inv, children: [], orphan: true });
                        }
                      }
                    });

                    // ─── Niveau supplémentaire : groupement par N°Dossier (factures EXPORT) ───
                    // On enveloppe les groupes (parent+avoirs) existants par leur N°Dossier.
                    // Une "entry" affichée est soit { type:'dossier', dossier, dossierGroups }
                    // soit { type:'group', group } (= rendu existant parent+avoirs).
                    const dossierMap = new Map();
                    const withoutDossierGroups = [];
                    for (const g of groups) {
                      const d = getNumeroDossierSent(g.parent, downloadedInvoices);
                      if (d) {
                        if (!dossierMap.has(d)) dossierMap.set(d, []);
                        dossierMap.get(d).push(g);
                      } else {
                        withoutDossierGroups.push(g);
                      }
                    }
                    const sortedDossierEntries = Array.from(dossierMap.entries())
                      .sort(([a], [b]) => a.localeCompare(b));
                    const sequence = [];
                    for (const [dossier, dossierGroups] of sortedDossierEntries) {
                      sequence.push({ type: 'dossier', dossier, dossierGroups });
                      if (expandedSentDossiers.has(dossier)) {
                        for (const g of dossierGroups) sequence.push({ type: 'group', group: g, inDossier: true });
                      }
                    }
                    for (const g of withoutDossierGroups) sequence.push({ type: 'group', group: g, inDossier: false });

                    const pagedEntries = sequence.slice(sentPage * sentRowsPerPage, (sentPage + 1) * sentRowsPerPage);

                    // Helper : rend une ligne (parent ou child)
                    const renderRow = (invoice, opts = {}) => {
                      const { isChild = false, hasChildren = false, expanded = false, onToggle, group, inDossier = false } = opts;
                      const isRefund = invoice.invoice_type === 'refund';

                      // Total net du groupe (parent - avoirs) affiché sur la ligne parent
                      let groupNetTtc = null;
                      if (!isChild && group && group.children && group.children.length > 0) {
                        const parentTtc = invoice.total_ttc || 0;
                        const childrenTtc = group.children.reduce((acc, c) => acc + (c.total_ttc || 0), 0);
                        groupNetTtc = parentTtc - childrenTtc;
                      }

                      return (
                        <TableRow
                          key={invoice.id}
                          hover
                          sx={{
                            backgroundColor: invoice.status === 'failed'
                              ? '#FFA500'
                              : isChild
                                ? '#fafafa'
                                : (inDossier ? '#e3f2fd' : 'inherit'),
                            '&:hover': {
                              backgroundColor: invoice.status === 'failed'
                                ? '#FF8C00'
                                : (inDossier && !isChild ? '#bbdefb' : 'rgba(0, 0, 0, 0.04)')
                            },
                            borderLeft: isChild
                              ? '3px solid #ed6c02'
                              : (inDossier ? '3px solid #1976d2' : 'none'),
                          }}
                        >
                          <TableCell sx={{ py: 0.5, px: 1, fontSize: '0.75rem' }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, pl: isChild ? 3 : 0 }}>
                              {hasChildren && !isChild && (
                                <IconButton size="small" onClick={onToggle} sx={{ p: 0.25 }}>
                                  {expanded ? <ArrowDropDownIcon fontSize="small" /> : <ArrowForwardIcon fontSize="small" />}
                                </IconButton>
                              )}
                              {isChild && <UndoIcon fontSize="small" sx={{ color: '#ed6c02' }} />}
                              <Chip
                                label={isRefund ? 'Avoir' : 'Facture'}
                                color={isRefund ? 'warning' : 'primary'}
                                size="small"
                                sx={{ height: 20, fontSize: '0.7rem' }}
                              />
                              {invoice.is_cancellation && (
                                <Tooltip title={`Annulation FNE de doublon${invoice.api_response?.cancelled_fne_reference ? ` — réf annulée : ${invoice.api_response.cancelled_fne_reference}` : ''}`}>
                                  <Chip
                                    label="Annulation"
                                    size="small"
                                    color="error"
                                    variant="outlined"
                                    sx={{ height: 18, fontSize: '0.65rem', fontWeight: 600 }}
                                  />
                                </Tooltip>
                              )}
                              {group?.orphan && !isChild && (
                                <Tooltip title="Avoir orphelin — facture initiale introuvable dans la période">
                                  <Chip label="orphelin" size="small" color="default" variant="outlined" sx={{ height: 16, fontSize: '0.6rem' }} />
                                </Tooltip>
                              )}
                              {!isChild && group?.children?.length > 0 && (
                                <Chip
                                  label={`${group.children.length} avoir${group.children.length > 1 ? 's' : ''}`}
                                  size="small"
                                  variant="outlined"
                                  sx={{ height: 16, fontSize: '0.6rem', borderColor: '#ed6c02', color: '#ed6c02' }}
                                />
                              )}
                            </Box>
                          </TableCell>
                          <TableCell sx={{ py: 0.5, px: 1, fontSize: '0.78rem' }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexWrap: 'nowrap' }}>
                              {invoice.numero_facture}
                              {!isChild && (() => {
                                const dossier = getNumeroDossierSent(invoice, downloadedInvoices);
                                if (!dossier) return null;
                                return (
                                  <Tooltip title={`Appartient au dossier ${dossier}`}>
                                    <Chip
                                      label={dossier}
                                      size="small"
                                      color="primary"
                                      variant="outlined"
                                      sx={{ height: 16, fontSize: '0.6rem', px: 0.5 }}
                                    />
                                  </Tooltip>
                                );
                              })()}
                              {invoice.is_manual && (
                                <Tooltip title={`Saisie manuelle effectuée par ${invoice.manual_by || 'Inconnu'} le ${invoice.manual_on ? new Date(invoice.manual_on).toLocaleString('fr-FR') : 'Date inconnue'}`}>
                                  <Chip
                                    label="Man"
                                    size="small"
                                    color="secondary"
                                    variant="outlined"
                                    sx={{ height: 16, fontSize: '0.6rem', px: 0.5 }}
                                  />
                                </Tooltip>
                              )}
                              {invoice.status === 'failed' && (
                                <Tooltip title={`Échec de l'envoi: ${invoice.api_response?.error || 'Erreur inconnue'}. Allez vérifier dans la FNE.`}>
                                  <ErrorOutlineIcon color="error" sx={{ cursor: 'help' }} fontSize="small" />
                                </Tooltip>
                              )}
                            </Box>
                          </TableCell>
                          <TableCell sx={{ py: 0.5, px: 1, fontSize: '0.78rem', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {invoice.client_name || 'Client Inconnu'}
                          </TableCell>
                          <TableCell sx={{ py: 0.5, px: 1, fontSize: '0.78rem' }}>{invoice.point_of_sale || 'N/A'}</TableCell>
                          <TableCell align="right" sx={{ py: 0.5, px: 1, fontSize: '0.78rem', fontWeight: 'bold' }}>
                            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                              <span>
                                {invoice.is_template
                                  ? formatMontantSimple(invoice.total_ttc || 0)
                                  : formatMontant(invoice.total_ttc || 0)}
                              </span>
                              {groupNetTtc !== null && groupNetTtc !== invoice.total_ttc && (
                                <Tooltip title={`Montant net après ${group.children.length} avoir${group.children.length > 1 ? 's' : ''}`}>
                                  <Typography variant="caption" sx={{ color: groupNetTtc >= 0 ? 'success.main' : 'error.main', fontWeight: 600 }}>
                                    net : {invoice.is_template ? formatMontantSimple(groupNetTtc) : formatMontant(groupNetTtc)}
                                  </Typography>
                                </Tooltip>
                              )}
                            </Box>
                          </TableCell>
                          <TableCell sx={{ py: 0.5, px: 1, fontSize: '0.78rem' }}>{invoice.username}</TableCell>
                          <TableCell sx={{ py: 0.5, px: 1, fontSize: '0.78rem' }}>
                            {(() => {
                              const resp = invoice.api_response || {};
                              if (isRefund) {
                                // Référence de l'avoir FNE uniquement (ex: A9904279V26...)
                                return resp.credit_note_reference ||
                                  resp.creditNoteReference ||
                                  resp.refund_reference ||
                                  resp.refundReference ||
                                  resp.reference ||
                                  resp.fne_response?.reference ||
                                  invoice.reference || 'N/A';
                              }
                              return invoice.reference || resp.reference || 'N/A';
                            })()}
                          </TableCell>
                          <TableCell sx={{ py: 0.5, px: 1, fontSize: '0.78rem' }}>{new Date(invoice.send_date).toLocaleString('fr-FR')}</TableCell>
                          <TableCell sx={{ py: 0.5, px: 0.5, whiteSpace: 'nowrap' }}>
                            {/* 1. Bouton Voir */}
                            <IconButton
                              size="small"
                              onClick={() => handleViewSentInvoice(invoice)}
                              title="Voir les détails de la facture"
                              sx={{ mr: 0.5 }}
                            >
                              <VisibilityIcon fontSize="small" />
                            </IconButton>

                            {/* 2. Bouton Imprimer */}
                            <IconButton
                              size="small"
                              onClick={() => {
                                const fneToken = invoice.fne_token ||
                                  invoice.api_response?.token ||
                                  invoice.api_response?.data?.token ||
                                  invoice.api_response?.response?.token ||
                                  invoice.api_response?.result?.token;

                                handlePrintInvoiceWithLog(fneToken, invoice.numero_facture);
                              }}
                              title="Imprimer la facture"
                              sx={{ mr: 0.5 }}
                            >
                              <PrintIcon fontSize="small" />
                            </IconButton>

                            {/* 3. Bouton Créer Avoir (si pas un avoir) */}
                            {canSendRefund && invoice.invoice_type !== 'refund' && (
                              <IconButton
                                size="small"
                                onClick={async () => {
                                  // Normaliser pour la comparaison
                                  const normalize = (val) => val ? String(val).trim().toUpperCase() : '';
                                  const targetNum = normalize(invoice.numero_facture);

                                  // Fonction helper pour vérifier la correspondance
                                  const isMatchingInvoice = (inv, useDetailsState = true) => {
                                    const invNumero = normalize(inv.numero);
                                    let invNumeroFromDetails = null;
                                    if (useDetailsState) {
                                      const invDetails = invoiceDetails[inv.id];
                                      invNumeroFromDetails = normalize(invDetails?.numeroFacture);
                                    }
                                    let invNumeroFromData = null;
                                    if (inv.data) {
                                      try {
                                        const parsedData = typeof inv.data === 'string' ? JSON.parse(inv.data) : inv.data;
                                        invNumeroFromData = normalize(
                                          parsedData?.data?.[0]?.numeroFacture ||
                                          parsedData?.[0]?.numeroFacture ||
                                          parsedData?.numeroFacture
                                        );
                                      } catch (e) { }
                                    }
                                    return invNumero === targetNum ||
                                      (useDetailsState && invNumeroFromDetails === targetNum) ||
                                      invNumeroFromData === targetNum;
                                  };

                                  // Recherche locale puis serveur
                                  let foundInvoice = null;
                                  if (downloadedInvoices && downloadedInvoices.length > 0) {
                                    foundInvoice = downloadedInvoices.find(inv => isMatchingInvoice(inv, true));
                                  }

                                  if (!foundInvoice) {
                                    try {
                                      const response = await fetch(`${API_ENDPOINTS.DOWNLOADED_INVOICES.BASE}?search=${invoice.numero_facture}&includeSent=true`);
                                      if (response.ok) {
                                        const result = await response.json();
                                        if (result.data && Array.isArray(result.data)) {
                                          foundInvoice = result.data.find(inv => isMatchingInvoice(inv, false));
                                        }
                                      }
                                    } catch (err) {
                                      console.error("Erreur recharge facture pour avoir:", err);
                                    }
                                  }

                                  if (foundInvoice) {
                                    await handleOpenRefundModal(foundInvoice);
                                  } else {
                                    notify(`Facture non trouvée (${invoice.numero_facture}). Impossible de créer l'avoir.`);
                                  }
                                }}
                                color="warning"
                                title="Créer un avoir (remboursement)"
                                sx={{ mr: 0.5 }}
                              >
                                <UndoIcon fontSize="small" />
                              </IconButton>
                            )}

                            {/* 4. Bouton Saisie Manuelle (échec, manuel, OU référence FNE absente/N/A) */}
                            {(() => {
                              const refValue = invoice.reference || invoice.api_response?.reference || '';
                              const refIsMissing = !refValue || String(refValue).trim().toUpperCase() === 'N/A';
                              const showManual = invoice.status === 'failed' || invoice.is_manual || refIsMissing;
                              if (!showManual) return null;
                              return (
                                <IconButton
                                  size="small"
                                  onClick={() => {
                                    setManualFneData({
                                      numeroFacture: invoice.numero_facture || '',
                                      fneReference: refIsMissing ? '' : refValue
                                    });
                                    setManualFneOpen(true);
                                  }}
                                  title={refIsMissing ? 'Saisie manuelle FNE (référence absente)' : 'Saisie manuelle FNE'}
                                  color="info"
                                >
                                  <EditIcon fontSize="small" />
                                </IconButton>
                              );
                            })()}
                          </TableCell>
                        </TableRow>
                      );
                    };

                    return pagedEntries.flatMap((entry) => {
                      // ─── Ligne d'en-tête de dossier (dépliable) ───
                      if (entry.type === 'dossier') {
                        const { dossier, dossierGroups } = entry;
                        const expanded = expandedSentDossiers.has(dossier);
                        const nbFactures = dossierGroups.length;
                        const nbAvoirs = dossierGroups.reduce((acc, g) => acc + g.children.length, 0);
                        const totalTtc = dossierGroups.reduce((acc, g) => {
                          const parentTtc = g.parent.total_ttc || 0;
                          const childrenTtc = g.children.reduce((s, c) => s + (c.total_ttc || 0), 0);
                          return acc + (parentTtc - childrenTtc);
                        }, 0);
                        const isTemplate = dossierGroups.some(g => g.parent.is_template);
                        return [(
                          <TableRow
                            key={`sent-dossier-${dossier}`}
                            sx={{ bgcolor: '#e8f0fe', '&:hover': { bgcolor: '#d2e3fc' } }}
                          >
                            <TableCell colSpan={9} sx={{ py: 0.75 }}>
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
                                <IconButton
                                  size="small"
                                  onClick={() => setExpandedSentDossiers(prev => {
                                    const next = new Set(prev);
                                    if (next.has(dossier)) next.delete(dossier); else next.add(dossier);
                                    return next;
                                  })}
                                  aria-label={expanded ? 'Replier' : 'Déplier'}
                                  sx={{ p: 0.25 }}
                                >
                                  {expanded ? <ArrowDropDownIcon /> : <ArrowForwardIcon fontSize="small" />}
                                </IconButton>
                                <Chip
                                  label={`Dossier ${dossier}`}
                                  color="primary"
                                  size="small"
                                  sx={{ fontWeight: 600 }}
                                />
                                <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                                  {nbFactures} facture{nbFactures > 1 ? 's' : ''}
                                  {nbAvoirs > 0 && ` · ${nbAvoirs} avoir${nbAvoirs > 1 ? 's' : ''}`}
                                  {totalTtc !== 0 && ` · Net TTC : ${isTemplate ? formatMontantSimple(totalTtc) : formatMontant(totalTtc)}`}
                                </Typography>
                              </Box>
                            </TableCell>
                          </TableRow>
                        )];
                      }
                      // ─── Groupe normal (parent + avoirs) ───
                      const g = entry.group;
                      const inDossier = entry.inDossier === true;
                      const rows = [];
                      const hasChildren = g.children.length > 0;
                      const expanded = sentExpandAll || !!sentExpanded[g.parent.id];
                      const onToggle = () => setSentExpanded(prev => ({ ...prev, [g.parent.id]: !prev[g.parent.id] }));
                      rows.push(renderRow(g.parent, { isChild: false, hasChildren, expanded, onToggle, group: g, inDossier }));
                      if (expanded && hasChildren) {
                        g.children.forEach(c => rows.push(renderRow(c, { isChild: true, inDossier })));
                      }
                      return rows;
                    });
                  })() : (
                    <TableRow>
                      <TableCell colSpan={9} align="center" sx={{ py: 3 }}>
                        {sentInvoices.length === 0
                          ? "Aucune facture envoyée"
                          : "Aucune facture correspondant aux filtres"
                        }
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
              <TablePagination
                component="div"
                count={(() => {
                  // Compte des entries affichées : headers dossier + groupes parent (visibles si dossier déplié ou sans dossier)
                  const numeros = new Set();
                  const allGroups = [];
                  sentInvoices.forEach(i => {
                    if (i.invoice_type !== 'refund') {
                      allGroups.push(i);
                      numeros.add(i.numero_facture);
                    }
                  });
                  sentInvoices.forEach(i => {
                    if (i.invoice_type === 'refund') {
                      const parentNum = i.initial_invoice_numero || i.numero_facture;
                      if (!numeros.has(parentNum)) allGroups.push(i);
                    }
                  });
                  const seenDossiers = new Set();
                  let total = 0;
                  for (const inv of allGroups) {
                    const d = getNumeroDossierSent(inv, downloadedInvoices);
                    if (!d) { total += 1; continue; }
                    if (!seenDossiers.has(d)) { seenDossiers.add(d); total += 1; } // header
                    if (expandedSentDossiers.has(d)) total += 1;
                  }
                  return total;
                })()}
                page={sentPage}
                onPageChange={(e, p) => setSentPage(p)}
                rowsPerPage={sentRowsPerPage}
                onRowsPerPageChange={(e) => { setSentRowsPerPage(parseInt(e.target.value, 10)); setSentPage(0); }}
                rowsPerPageOptions={[20, 50, 100]}
                labelRowsPerPage="Groupes par page"
                labelDisplayedRows={({ from, to, count }) => `${from}-${to} sur ${count} factures`}
              />
            </TableContainer>
          </Container>

        ) : viewMode === 'settings' ? (
          <SettingsPage />

        ) : viewMode === 'fne-cancellations' ? (
          <FneCancellationsPage />

        ) : viewMode === 'bl-validation' ? (
          <BlValidationPage />

        ) : viewMode === 'auto-download' ? (
          isAdmin() ? <AutoDownloadPage /> : <Box sx={{ p: 3 }}><Alert severity="error">Accès réservé aux administrateurs.</Alert></Box>

        ) : viewMode === 'non-fne' ? (
          (isAdmin() || hasPermission('non_fne.view') || hasPermission('non_fne.manage') || hasPermission('non_fne.delete'))
            ? <NonFnePage />
            : <Box sx={{ p: 3 }}><Alert severity="error">Accès non autorisé.</Alert></Box>

        ) : null}
      </Box>

      {/* Modal de chargement résolution avoir */}
      <Dialog open={avoirResolving} PaperProps={{ sx: { borderRadius: 3, p: 2, textAlign: 'center', minWidth: 350 } }}>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, py: 4 }}>
          <CircularProgress size={50} color="warning" />
          <Typography variant="h6" sx={{ mt: 1 }}>
            Avoir détecté
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Recherche de la facture initiale FNE en cours...
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Veuillez patienter, ne pas télécharger avant la fin.
          </Typography>
        </DialogContent>
      </Dialog>

      {/* Modal de chargement envoi FNE */}
      <Dialog
        open={!!fneSending}
        PaperProps={{ sx: { borderRadius: 3, p: 2, textAlign: 'center', minWidth: 400 } }}
      >
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, py: 4 }}>
          <CircularProgress size={56} color="primary" />
          <Typography variant="h6" sx={{ mt: 1 }}>
            Envoi à la FNE en cours…
          </Typography>
          {fneSending?.numeroFacture && (
            <Typography variant="body2" sx={{ fontFamily: 'monospace', bgcolor: '#f5f5f5', px: 1.5, py: 0.5, borderRadius: 1 }}>
              {fneSending.numeroFacture}
            </Typography>
          )}
          <Typography variant="body2" color="text.secondary">
            Certification de la facture par la DGI. Ne ferme pas cette fenêtre.
          </Typography>
          <Typography variant="caption" color="text.secondary">
            ⚠ Un double envoi consomme un sticker fiscal supplémentaire
          </Typography>
        </DialogContent>
      </Dialog>

      {/* Modal AVOIR NON RÉSOLU — facture initiale introuvable par les stratégies SAP.
          Permet la saisie manuelle du n° facture initiale et une recherche SAP. */}
      <Dialog
        open={!!unresolvedAvoir}
        onClose={() => { if (!unresolvedSearching) { setUnresolvedAvoir(null); setUnresolvedManualInput(''); } }}
        PaperProps={{ sx: { borderRadius: 3, minWidth: 500 } }}
      >
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1, color: 'error.main' }}>
          <ReportProblemIcon color="error" />
          Avoir non résolu
        </DialogTitle>
        <DialogContent>
          <Box sx={{ bgcolor: '#ffebee', p: 1.5, borderRadius: 1, mb: 2, border: '1px solid #ef9a9a' }}>
            <Typography variant="body2" sx={{ mb: 0.5 }}>
              <strong>Avoir :</strong> {unresolvedAvoir?.numeroAvoir}
            </Typography>
            <Typography variant="body2" sx={{ mb: 0.5 }}>
              <strong>N° commande SAP :</strong> {unresolvedAvoir?.commande || 'inconnu'}
            </Typography>
            <Typography variant="body2">
              <strong>Type FKART :</strong> {unresolvedAvoir?.type || '?'}
            </Typography>
          </Box>

          <Typography variant="body2" sx={{ mb: 1.5 }}>
            Le système n'a pas pu identifier automatiquement la facture initiale liée à cet avoir.
            Saisis le numéro de la facture initiale ci-dessous et lance la recherche.
          </Typography>

          <TextField
            label="N° de la facture initiale"
            placeholder="Ex: 8000060570"
            value={unresolvedManualInput}
            onChange={(e) => setUnresolvedManualInput(e.target.value)}
            fullWidth
            size="small"
            disabled={unresolvedSearching}
            sx={{ mb: 1 }}
          />

          <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
            Astuce : tu peux retrouver le numéro de la facture initiale via le numéro de commande
            <strong> {unresolvedAvoir?.commande || ''} </strong>
            dans SAP (transaction VA03 ou VF03).
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => { setUnresolvedAvoir(null); setUnresolvedManualInput(''); }} disabled={unresolvedSearching}>
            Annuler
          </Button>
          <Button
            variant="contained"
            color="primary"
            startIcon={unresolvedSearching ? <CircularProgress size={16} color="inherit" /> : <SearchIcon />}
            disabled={unresolvedSearching || !unresolvedManualInput.trim()}
            onClick={async () => {
              const initialNum = unresolvedManualInput.trim();
              if (!initialNum) return;
              setUnresolvedSearching(true);
              try {
                // Vérifier l'existence de la facture initiale dans SAP
                const respInit = await axios.post(API_ENDPOINTS.SAP.SEARCH, {
                  VBELN: initialNum,
                  KONV_READ: 'X'
                });
                if (!respInit.data?.success) {
                  notify(`La facture ${initialNum} n'existe pas dans SAP ou la recherche a échoué.`);
                  setUnresolvedSearching(false);
                  return;
                }
                const target = unresolvedAvoir;
                setUnresolvedAvoir(null);
                setUnresolvedManualInput('');
                setUnresolvedSearching(false);

                if (target?.bulkAvoirIdx !== undefined) {
                  // Contexte bulk : insérer la facture initiale dans la liste
                  await fetchAndInsertInitialInBulk(initialNum, target.bulkAvoirIdx, target.numeroAvoir);
                  notify({
                    severity: 'success',
                    title: 'Facture initiale ajoutée',
                    message:
                      `Facture initiale ${initialNum} ajoutée à la liste.\n\n` +
                      `Étapes :\n1. Télécharge la facture ${initialNum}\n2. Envoie-la à la FNE\n3. Retente l'avoir ${target.numeroAvoir}`,
                  });
                } else {
                  // Contexte recherche simple : naviguer vers la facture initiale
                  setError('');
                  setAvoirSapResult(null);
                  rechercherFacture(initialNum);
                }
              } catch (e) {
                console.error('Erreur recherche facture initiale manuelle:', e);
                notify(`Erreur lors de la recherche de la facture ${initialNum}.`);
                setUnresolvedSearching(false);
              }
            }}
          >
            {unresolvedSearching ? 'Recherche…' : 'Rechercher dans SAP'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Modal proposition téléchargement facture initiale absente FNE */}
      <Dialog
        open={!!missingInitialInvoice}
        onClose={() => setMissingInitialInvoice(null)}
        PaperProps={{ sx: { borderRadius: 3, minWidth: 500 } }}
      >
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1, color: 'warning.dark' }}>
          <ReportProblemIcon color="warning" />
          Téléchargement de l'avoir bloqué
        </DialogTitle>
        <DialogContent>
          <Box sx={{ bgcolor: '#fff3e0', p: 1.5, borderRadius: 1, mb: 2, border: '1px solid #ffb74d' }}>
            <Typography variant="body2" sx={{ mb: 0.5 }}>
              <strong>Avoir :</strong> {missingInitialInvoice?.numeroAvoir || '—'}
            </Typography>
            <Typography variant="body2">
              <strong>Facture initiale liée :</strong> {missingInitialInvoice?.numeroFacture}
            </Typography>
          </Box>

          <Typography variant="body2" sx={{ mb: 1.5, fontWeight: 500 }}>
            État actuel de la facture initiale :
          </Typography>
          {missingInitialInvoice?.alreadyDownloaded ? (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, mb: 2 }}>
              <Typography variant="body2" color="success.main">✓ Téléchargée en local</Typography>
              <Typography variant="body2" color="error.main">✗ <strong>Non envoyée à la FNE</strong></Typography>
            </Box>
          ) : (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, mb: 2 }}>
              <Typography variant="body2" color="error.main">✗ <strong>Non téléchargée</strong></Typography>
              <Typography variant="body2" color="error.main">✗ <strong>Non envoyée à la FNE</strong></Typography>
            </Box>
          )}

          <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic' }}>
            {missingInitialInvoice?.alreadyDownloaded
              ? `Va dans "Factures Téléchargées", envoie ${missingInitialInvoice?.numeroFacture} à la FNE, puis retente le téléchargement de cet avoir.`
              : `Télécharge d'abord la facture initiale ci-dessous, envoie-la à la FNE, puis retente l'avoir.`
            }
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          {revalidatingAvoir && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mr: 'auto', color: 'text.secondary' }}>
              <CircularProgress size={14} />
              <Typography variant="caption">Vérification de l'état FNE…</Typography>
            </Box>
          )}
          <Button onClick={() => setMissingInitialInvoice(null)}>Fermer</Button>
          {!missingInitialInvoice?.alreadyDownloaded && (
            <Tooltip
              title={
                !canFetchInitialForAvoir
                  ? "Vous n'avez pas l'autorisation de récupérer la facture initiale d'un avoir bloqué. Contactez un administrateur."
                  : ''
              }
            >
              <span>
                <Button
                  variant="contained"
                  color="warning"
                  startIcon={fetchingInitialInvoice ? <CircularProgress size={16} color="inherit" /> : <DownloadIcon />}
                  disabled={fetchingInitialInvoice || !canFetchInitialForAvoir}
                  onClick={async () => {
                    const target = missingInitialInvoice;
                    setFetchingInitialInvoice(true);
                    try {
                      if (target?.bulkAvoirIdx !== undefined) {
                        // Contexte bulk : insérer la facture initiale dans la liste
                        await fetchAndInsertInitialInBulk(target.numeroFacture, target.bulkAvoirIdx, target.numeroAvoir);
                      } else {
                        // Contexte recherche simple : redirection
                        setAvoirSapResult(null);
                        await rechercherFacture(target.numeroFacture);
                      }
                    } finally {
                      setFetchingInitialInvoice(false);
                      setMissingInitialInvoice(null);
                    }
                  }}
                >
                  {fetchingInitialInvoice ? 'Récupération…' : 'Télécharger la facture initiale'}
                </Button>
              </span>
            </Tooltip>
          )}
        </DialogActions>
      </Dialog>

      {/* Modal de BLOCAGE : articles de l'avoir incohérents avec la facture initiale */}
      <Dialog
        open={!!itemsMismatch}
        onClose={() => setItemsMismatch(null)}
        maxWidth="lg"
        fullWidth
        PaperProps={{ sx: { borderTop: '4px solid #d32f2f', borderRadius: 2 } }}
      >
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1, color: 'error.main' }}>
          <ReportProblemIcon color="error" />
          Avoir incompatible avec la facture initiale
        </DialogTitle>
        <DialogContent dividers>
          <Box sx={{ bgcolor: '#fff5f5', p: 2, borderRadius: 1, mb: 2, border: '1px solid #ffcdd2' }}>
            <Typography variant="body2" sx={{ mb: 0.5 }}>
              <strong>Avoir :</strong> {itemsMismatch?.numeroAvoir || '—'}
            </Typography>
            <Typography variant="body2" sx={{ mb: 1 }}>
              <strong>Facture initiale :</strong> {itemsMismatch?.numeroInitiale || '—'}
            </Typography>
            <Typography variant="body2" color="error">
              {itemsMismatch?.message ||
                "Les articles de l'avoir ne correspondent pas à ceux de la facture initiale."}
            </Typography>
            {itemsMismatch && (
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
                {itemsMismatch.matchedItemsCount} / {itemsMismatch.totalAvoirItemsCount} article(s) appariés
                {itemsMismatch.kind === 'UNIT_MISMATCH'
                  ? ` · ${itemsMismatch.unitMismatchItems?.length || 0} avec unités divergentes`
                  : ` · ${itemsMismatch.unmatchedAvoirItems?.length || 0} non appariés`}
              </Typography>
            )}
          </Box>

          {/* Variante UNIT_MISMATCH : table des articles avec unités divergentes */}
          {itemsMismatch?.kind === 'UNIT_MISMATCH' ? (
            <Box>
              <Box
                sx={{
                  bgcolor: '#fff5f5',
                  px: 1.5,
                  py: 0.75,
                  borderRadius: '4px 4px 0 0',
                  border: '1px solid #ffcdd2',
                  borderBottom: 'none',
                }}
              >
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', lineHeight: 1.1 }}>
                  Articles avec unités divergentes (avoir vs facture initiale)
                </Typography>
                <Typography variant="subtitle1" fontWeight={700} sx={{ fontFamily: 'monospace' }}>
                  {itemsMismatch?.numeroAvoir || '—'}
                  <Typography component="span" variant="caption" sx={{ ml: 1, color: 'text.secondary', fontFamily: 'inherit' }}>
                    ({(itemsMismatch?.unitMismatchItems?.length || 0)} article{(itemsMismatch?.unitMismatchItems?.length || 0) > 1 ? 's' : ''})
                  </Typography>
                </Typography>
              </Box>
              <TableContainer
                component={Paper}
                variant="outlined"
                sx={{ maxHeight: 360, borderRadius: '0 0 4px 4px', borderTop: 'none' }}
              >
                <Table size="small" stickyHeader>
                  <TableHead>
                    <TableRow>
                      <MuiTableCell>Référence</MuiTableCell>
                      <MuiTableCell>Description</MuiTableCell>
                      <MuiTableCell align="right">Qté avoir</MuiTableCell>
                      <MuiTableCell align="center">Unité avoir</MuiTableCell>
                      <MuiTableCell align="center">Unité facture initiale</MuiTableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {(itemsMismatch?.unitMismatchItems || []).length === 0 ? (
                      <TableRow>
                        <MuiTableCell colSpan={5} align="center" sx={{ color: 'text.secondary', py: 2 }}>
                          Aucun article avec unité divergente
                        </MuiTableCell>
                      </TableRow>
                    ) : (
                      (itemsMismatch?.unitMismatchItems || []).map((it, idx) => (
                        <TableRow key={idx} sx={{ bgcolor: '#ffebee' }}>
                          <MuiTableCell sx={{ fontFamily: 'monospace', fontSize: 12 }}>{it.matnr_normalized || it.matnr || '—'}</MuiTableCell>
                          <MuiTableCell sx={{ fontSize: 12 }}>{it.description || '—'}</MuiTableCell>
                          <MuiTableCell align="right">{it.quantity}</MuiTableCell>
                          <MuiTableCell align="center" sx={{ fontWeight: 700, color: 'error.main' }}>{it.avoir_unit || '—'}</MuiTableCell>
                          <MuiTableCell align="center">{it.initial_unit || '—'}</MuiTableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </TableContainer>
            </Box>
          ) : (
            /* Variante NO_MATCHING_ITEMS (par défaut) : articles non présents dans la facture initiale */
            (() => {
              const unmatched = (itemsMismatch?.unmatchedAvoirItems && itemsMismatch.unmatchedAvoirItems.length > 0)
                ? itemsMismatch.unmatchedAvoirItems
                : (itemsMismatch?.avoirSapItems || []).filter(it => it && it.matched === false);

              return (
                <Box>
                  <Box
                    sx={{
                      bgcolor: '#fff5f5',
                      px: 1.5,
                      py: 0.75,
                      borderRadius: '4px 4px 0 0',
                      border: '1px solid #ffcdd2',
                      borderBottom: 'none',
                    }}
                  >
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', lineHeight: 1.1 }}>
                      Articles de l'avoir non présents dans la facture initiale
                    </Typography>
                    <Typography variant="subtitle1" fontWeight={700} sx={{ fontFamily: 'monospace' }}>
                      {itemsMismatch?.numeroAvoir || '—'}
                      <Typography component="span" variant="caption" sx={{ ml: 1, color: 'text.secondary', fontFamily: 'inherit' }}>
                        ({unmatched.length} article{unmatched.length > 1 ? 's' : ''})
                      </Typography>
                    </Typography>
                  </Box>
                  <TableContainer
                    component={Paper}
                    variant="outlined"
                    sx={{ maxHeight: 360, borderRadius: '0 0 4px 4px', borderTop: 'none' }}
                  >
                    <Table size="small" stickyHeader>
                      <TableHead>
                        <TableRow>
                          <MuiTableCell>Référence</MuiTableCell>
                          <MuiTableCell>Description</MuiTableCell>
                          <MuiTableCell align="right">Qté</MuiTableCell>
                          <MuiTableCell align="center">Unité</MuiTableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {unmatched.length === 0 ? (
                          <TableRow>
                            <MuiTableCell colSpan={4} align="center" sx={{ color: 'text.secondary', py: 2 }}>
                              Aucun article non matché
                            </MuiTableCell>
                          </TableRow>
                        ) : (
                          unmatched.map((it, idx) => (
                            <TableRow key={idx} sx={{ bgcolor: '#ffebee' }}>
                              <MuiTableCell sx={{ fontFamily: 'monospace', fontSize: 12 }}>{it.matnr || it.matnr_normalized || '—'}</MuiTableCell>
                              <MuiTableCell sx={{ fontSize: 12 }}>{it.description || '—'}</MuiTableCell>
                              <MuiTableCell align="right">{it.quantity}</MuiTableCell>
                              <MuiTableCell align="center">{it.unit || '—'}</MuiTableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </TableContainer>
                </Box>
              );
            })()
          )}

          <Alert severity="warning" variant="outlined" sx={{ mt: 2 }}>
            <strong>Que faire ?</strong>{' '}
            {itemsMismatch?.kind === 'UNIT_MISMATCH'
              ? "L'avoir et la facture initiale n'utilisent pas la même unité de vente sur certains articles. Vérifie côté SAP pour corriger l'unité, ou recrée l'avoir dans la même unité que la facture initiale. L'avoir ne peut pas être envoyé à la FNE en l'état."
              : "L'incohérence vient de SAP — l'avoir référence des articles qui n'ont jamais été facturés sur cette facture initiale (ou avec une autre codification). Vérifie côté SAP que l'avoir pointe sur la bonne facture initiale, ou recrée l'avoir avec les articles corrects. Tu ne peux pas envoyer cet avoir à la FNE en l'état."}
          </Alert>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={() => setItemsMismatch(null)} variant="contained" color="error">
            Fermer
          </Button>
        </DialogActions>
      </Dialog>

      {/* Modal pour afficher la réponse de l'API */}
      <Dialog
        open={apiResponseModal.open}
        onClose={closeApiResponseModal}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>
          {apiResponseModal.invoiceType === 'refund' ? 'Détails de l\'avoir' : 'Réponse de l\'API d\'envoi'}
        </DialogTitle>
        <DialogContent>
          {apiResponseModal.data && (
            <Box>
              <Typography variant="body1" gutterBottom>
                <strong>NCC:</strong> {apiResponseModal.data.ncc}
              </Typography>
              <Typography variant="body1" gutterBottom>
                <strong>Référence:</strong> {apiResponseModal.data.reference}
              </Typography>
              {apiResponseModal.data.balance_funds !== undefined && (
                <Typography variant="body1" gutterBottom>
                  <strong>Solde des fonds:</strong> {apiResponseModal.data.balance_funds}
                </Typography>
              )}
              {apiResponseModal.data.warning !== undefined && (
                <Typography variant="body1" gutterBottom>
                  <strong>Avertissement:</strong> {apiResponseModal.data.warning ? 'Oui' : 'Non'}
                </Typography>
              )}

              {/* Afficher les quantités remboursées pour les avoirs */}
              {apiResponseModal.invoiceType === 'refund' && apiResponseModal.data.refund_items && (
                <Box sx={{ mt: 3 }}>
                  <Typography variant="h6" gutterBottom>
                    Quantités remboursées:
                  </Typography>
                  <TableContainer component={Paper} variant="outlined" sx={{ mt: 1 }}>
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell>ID Article</TableCell>
                          <TableCell>Référence</TableCell>
                          <TableCell align="right">Quantité remboursée</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {apiResponseModal.data.refund_items.map((item, index) => (
                          <TableRow key={index}>
                            <TableCell>{item.id}</TableCell>
                            <TableCell>{(() => {
                              // Chercher la référence dans la facture FNE si disponible
                              // const refFromFne = apiResponseFneInvoice?.items?.find(i => String(i.fne_item_id) === String(item.id))?.reference;
                              const refFromFne = null;
                              const fallbackRef = item.reference || item.ref || item.reference_code || null;
                              return refFromFne ?? fallbackRef ?? 'N/A';
                            })()}</TableCell>
                            <TableCell align="right">{item.quantity}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                </Box>
              )}

              <Typography variant="body1" gutterBottom sx={{ mt: 2 }}>
                <strong>Token:</strong>
                <Box component="span" sx={{ display: 'flex', alignItems: 'center', mt: 1 }}>
                  <TextField
                    fullWidth
                    value={apiResponseModal.data.token}
                    variant="outlined"
                    size="small"
                    readOnly
                    sx={{ mr: 1 }}
                  />
                  <IconButton
                    size="small"
                    onClick={async () => {
                      console.log('Bouton copie cliqué');
                      console.log('Token à copier:', apiResponseModal.data?.token);
                      await copyTokenToClipboard(apiResponseModal.data?.token);
                    }}
                    title="Copier le token"
                  >
                    <ContentCopyIcon fontSize="small" />
                  </IconButton>
                </Box>
              </Typography>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={closeApiResponseModal}>Fermer</Button>
        </DialogActions>
      </Dialog>

      {/* Boîte de dialogue de saisie manuelle FNE */}
      <Dialog
        open={manualFneOpen}
        onClose={() => !manualFneLoading && setManualFneOpen(false)}
        maxWidth="sm"
        fullWidth
        PaperProps={{
          sx: { borderRadius: 2, boxShadow: '0 8px 32px rgba(0,0,0,0.1)' }
        }}
      >
        <DialogTitle sx={{
          bgcolor: 'info.main',
          color: 'white',
          display: 'flex',
          alignItems: 'center',
          gap: 1
        }}>
          <EditIcon />
          <Typography variant="h6" component="span">
            Saisie Manuelle Référence FNE
          </Typography>
        </DialogTitle>
        <DialogContent sx={{ py: 3, mt: 2 }}>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            Utilisez ce formulaire pour lier manuellement un numéro de facture SAP à une référence FNE reçue par email,
            lorsque l'envoi automatique a échoué.
          </Typography>

          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <TextField
              label="Numéro de Facture SAP"
              fullWidth
              variant="outlined"
              value={manualFneData.numeroFacture}
              placeholder="Ex: 8000012345"
              onChange={(e) => setManualFneData({ ...manualFneData, numeroFacture: e.target.value })}
              disabled={true} // Toujours désactivé car pré-rempli
            />
            <TextField
              label="Référence FNE"
              fullWidth
              variant="outlined"
              value={manualFneData.fneReference}
              placeholder="Saisissez la référence reçue par email"
              onChange={(e) => setManualFneData({ ...manualFneData, fneReference: e.target.value })}
              autoFocus
            />
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 3 }}>
          <Button
            onClick={() => setManualFneOpen(false)}
            disabled={manualFneLoading}
            variant="outlined"
          >
            Annuler
          </Button>
          <Button
            variant="contained"
            color="primary"
            onClick={() => {
              if (!manualFneData.fneReference) {
                notify('Veuillez saisir une référence FNE');
                return;
              }
              // Ouvrir la confirmation au lieu de valider direct
              setConfirmManualEntryDialogOpen(true);
            }}
            disabled={manualFneLoading || !manualFneData.fneReference}
            startIcon={manualFneLoading ? <CircularProgress size={20} color="inherit" /> : <CheckCircleIcon />}
          >
            Valider
          </Button>
        </DialogActions>
      </Dialog>

      {/* Dialog de confirmation pour l'enregistrement manuel */}
      <Dialog
        open={confirmManualEntryDialogOpen}
        onClose={() => setConfirmManualEntryDialogOpen(false)}
      >
        <DialogTitle>Confirmer l'enregistrement manuel</DialogTitle>
        <DialogContent>
          <Typography>
            Êtes-vous sûr de vouloir lier manuellement la facture <b>{manualFneData.numeroFacture}</b> à la référence FNE <b>{manualFneData.fneReference}</b> ?
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
            Cette action est irréversible et mettra à jour le statut de la facture comme "Envoyée".
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmManualEntryDialogOpen(false)} color="inherit">
            Non, Annuler
          </Button>
          <Button
            onClick={() => {
              setConfirmManualEntryDialogOpen(false);
              handleManualRegister();
            }}
            color="primary"
            variant="contained"
            autoFocus
          >
            Oui, Confirmer
          </Button>
        </DialogActions>
      </Dialog>


      {/* Boîte de dialogue de confirmation d'envoi de facture */}
      {/* Boîte de dialogue de confirmation d'envoi de facture */}
      <Dialog
        open={confirmDialogOpen}
        onClose={() => setConfirmDialogOpen(false)}
        aria-labelledby="alert-dialog-title"
        aria-describedby="alert-dialog-description"
      >
        <DialogTitle id="alert-dialog-title">
          Confirmer l'envoi de la facture
        </DialogTitle>
        <DialogContent>
          <Typography>
            Êtes-vous sûr de vouloir envoyer la facture {invoiceToSend?.numero || invoiceToSend?.data?.[0]?.data?.[0]?.numeroFacture || ''} ?
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmDialogOpen(false)}>Annuler</Button>
          <Button onClick={confirmSendInvoice} color="primary" autoFocus>
            Confirmer
          </Button>
        </DialogActions>
      </Dialog>

      {/* Boîte de dialogue de confirmation de suppression */}
      <Dialog
        open={openDeleteDialog}
        onClose={handleCancelDelete}
        aria-labelledby="alert-dialog-title"
        aria-describedby="alert-dialog-description"
      >
        <DialogTitle id="alert-dialog-title">
          Confirmer la suppression
        </DialogTitle>
        <DialogContent>
          <Typography>
            Êtes-vous sûr de vouloir supprimer la facture {invoiceToDelete?.numero} ?
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCancelDelete}>Annuler</Button>
          <Button onClick={handleDeleteInvoice} color="error" autoFocus>
            Supprimer
          </Button>
        </DialogActions>
      </Dialog>

      {/* Modal de progression pour le téléchargement en masse */}
      <Dialog
        open={showBulkDownloadModal}
        maxWidth="sm"
        fullWidth
        PaperProps={{
          sx: {
            borderRadius: 3,
            p: 2
          }
        }}
      >
        <DialogTitle sx={{ textAlign: 'center', pb: 1 }}>
          <Typography variant="h5" component="div" sx={{ fontWeight: 600, color: 'primary.main' }}>
            Téléchargement en cours...
          </Typography>
        </DialogTitle>
        <DialogContent sx={{ pt: 3 }}>
          <Box sx={{ width: '100%' }}>
            {/* Barre de progression */}
            <Box sx={{ mb: 3 }}>
              <LinearProgress
                variant="determinate"
                value={(bulkDownloadProgress.current / bulkDownloadProgress.total) * 100}
                sx={{
                  height: 10,
                  borderRadius: 5,
                  backgroundColor: 'rgba(25, 118, 210, 0.1)',
                  '& .MuiLinearProgress-bar': {
                    borderRadius: 5,
                    background: 'linear-gradient(90deg, #1976d2 0%, #42a5f5 100%)'
                  }
                }}
              />
            </Box>

            {/* Compteur et pourcentage */}
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
              <Typography variant="body1" sx={{ fontWeight: 500 }}>
                {bulkDownloadProgress.current} / {bulkDownloadProgress.total} factures
              </Typography>
              <Typography variant="h6" sx={{ fontWeight: 600, color: 'primary.main' }}>
                {Math.round((bulkDownloadProgress.current / bulkDownloadProgress.total) * 100)}%
              </Typography>
            </Box>

            {/* Message de succès quand terminé */}
            {bulkDownloadProgress.current === bulkDownloadProgress.total && bulkDownloadProgress.total > 0 && (
              <Box sx={{
                mt: 3,
                p: 2,
                bgcolor: 'success.light',
                borderRadius: 2,
                textAlign: 'center'
              }}>
                <Typography variant="body1" sx={{ color: 'success.dark', fontWeight: 500 }}>
                  ✓ Téléchargement terminé avec succès !
                </Typography>
              </Box>
            )}
          </Box>
        </DialogContent>
      </Dialog >

      {/* Modal de facture déjà téléchargée */}
      {/* Modal de facture déjà téléchargée */}
      <Dialog
        open={openDownloadModal}
        onClose={handleCloseDownloadModal}
        aria-labelledby="download-dialog-title"
        aria-describedby="download-dialog-description"
      >
        <DialogTitle id="download-dialog-title">
          Facture déjà téléchargée
        </DialogTitle>
        <DialogContent>
          <Typography>
            Cette facture a déjà été téléchargée par <strong>{existingInvoiceInfo?.username}</strong>.
          </Typography>
          <Typography sx={{ mt: 2 }}>
            <strong>Numéro:</strong> {existingInvoiceInfo?.numero}<br />
            <strong>Client:</strong> {existingInvoiceInfo?.client}<br />
            <strong>Date:</strong> {existingInvoiceInfo?.date ? new Date(existingInvoiceInfo.date).toLocaleString('fr-FR') : 'N/A'}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={handleCloseDownloadModal}
            variant="contained"
          >
            OK
          </Button>
        </DialogActions>
      </Dialog>

      {/* Modal de résultat d'import du template */}
      {/* Modal de résultat d'import du template */}
      <Dialog
        open={importResult.open}
        onClose={() => setImportResult(prev => ({ ...prev, open: false }))}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle sx={{ bgcolor: importResult.errorCount > 0 ? 'warning.light' : 'success.light', color: 'white' }}>
          Résultat de l'import du template
        </DialogTitle>
        <DialogContent dividers>
          <Box sx={{ mb: 3, p: 2, borderRadius: 1, bgcolor: 'grey.50' }}>
            <Typography variant="h6" gutterBottom color="primary">
              Résumé de l'opération
            </Typography>
            <Grid container spacing={2}>
              <Grid item xs={6}>
                <Typography variant="body1">
                  ✅ <strong>{importResult.successCount}</strong> facture(s) importée(s) ({importResult.successfulLinesCount || 0} lignes).
                </Typography>
              </Grid>
              <Grid item xs={6}>
                <Typography variant="body1" color={importResult.errorCount > 0 ? 'error.main' : 'text.secondary'}>
                  {importResult.errorCount > 0 ? '❌ ' : '✔️ '} <strong>{importResult.errorCount}</strong> facture(s) en erreur ou ignorée(s).
                </Typography>
              </Grid>
            </Grid>
          </Box>

          {importResult.skippedLines && importResult.skippedLines.length > 0 && (
            <Box sx={{ mt: 2 }}>
              <Typography variant="h6" gutterBottom color="error" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <ReportProblemIcon fontSize="small" />
                Détails des lignes sautées ({importResult.skippedLines.length})
              </Typography>
              <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 400 }}>
                <Table size="small" stickyHeader>
                  <TableHead>
                    <TableRow bgcolor="grey.100">
                      <TableCell><strong>Facture</strong></TableCell>
                      <TableCell><strong>Client</strong></TableCell>
                      <TableCell><strong>Ref</strong></TableCell>
                      <TableCell><strong>Raison / Erreur</strong></TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {importResult.skippedLines.map((line, idx) => (
                      <TableRow key={idx} hover>
                        <TableCell>{line.facture}</TableCell>
                        <TableCell>{line.client}</TableCell>
                        <TableCell>{line.ref}</TableCell>
                        <TableCell color="error.main">{line.error}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </Box>
          )}

          {importResult.errors && importResult.errors.length > 0 && importResult.skippedLines.length === 0 && (
            <Box sx={{ mt: 2, p: 2, bgcolor: 'error.lighter', borderRadius: 1 }}>
              <Typography variant="subtitle1" gutterBottom color="error.main" fontWeight="bold">
                Erreurs générales :
              </Typography>
              {importResult.errors.map((msg, idx) => (
                <Typography key={idx} variant="body2" sx={{ mb: 0.5 }}>
                  • {msg}
                </Typography>
              ))}
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => setImportResult(prev => ({ ...prev, open: false }))}
            variant="contained"
            color="primary"
            autoFocus
          >
            Fermer
          </Button>
        </DialogActions>
      </Dialog>

      {/* Modal pour créer un avoir (refund) */}
      {/* Modal pour créer un avoir (refund) */}
      <Dialog
        open={refundModalOpen}
        onClose={handleCloseRefundModal}
        maxWidth="md"
        fullWidth
        aria-labelledby="refund-dialog-title"
      >
        <DialogTitle id="refund-dialog-title">
          Créer un Bon Avoir
        </DialogTitle>
        <DialogContent>
          {isLoadingFneInvoice ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 200 }}>
              <CircularProgress />
            </Box>
          ) : fneInvoiceData && fneInvoiceData.items && fneInvoiceData.items.length > 0 ? (
            <Box>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                Facture: {refundInvoice?.numero || refundInvoice?.numeroFacture || ''}
              </Typography>
              <FormControlLabel
                sx={{ mb: 1 }}
                control={
                  <Checkbox
                    checked={refundFullInvoice}
                    onChange={(e) => handleToggleFullRefund(e.target.checked)}
                  />
                }
                label="Avoir total — rembourser toute la facture (mêmes quantités que la facture)"
              />
              <TableContainer component={Paper} variant="outlined">
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableCell>Référence</TableCell>
                      <TableCell>Description</TableCell>
                      <TableCell align="right">Quantité initiale</TableCell>
                      <TableCell align="right">Quantité à rembourser</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {fneInvoiceData.items.map((item) => (
                      <TableRow key={item.fne_item_id}>
                        <TableCell>{item.reference || 'N/A'}</TableCell>
                        <TableCell>{item.description || 'N/A'}</TableCell>
                        <TableCell align="right">{item.quantity || 0}</TableCell>
                        <TableCell align="right">
                          <TextField
                            type="number"
                            size="small"
                            placeholder="0"
                            inputProps={{ min: 0, max: item.quantity || 0 }}
                            value={refundQuantities[item.fne_item_id] || ''}
                            onFocus={(e) => e.target.select()}
                            onChange={(e) => {
                              const raw = e.target.value;
                              if (raw === '') {
                                handleRefundQuantityChange(item.fne_item_id, 0);
                                return;
                              }
                              const value = parseInt(raw, 10);
                              if (Number.isNaN(value)) return;
                              const maxQuantity = item.quantity || 0;
                              handleRefundQuantityChange(item.fne_item_id, Math.min(Math.max(0, value), maxQuantity));
                            }}
                            sx={{ width: 100 }}
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </Box>
          ) : (
            <Typography color="error">
              Aucune donnée de facture FNE trouvée. Assurez-vous que la facture a été envoyée avec succès.
            </Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseRefundModal} disabled={isSendingRefund}>
            Annuler
          </Button>
          <Button
            onClick={handleSendRefund}
            variant="contained"
            color="warning"
            disabled={isLoadingFneInvoice || isSendingRefund || !fneInvoiceData || Object.values(refundQuantities).every(q => q === 0)}
            startIcon={isSendingRefund ? <CircularProgress size={20} /> : <UndoIcon />}
          >
            {isSendingRefund ? 'Envoi en cours...' : 'Envoyer Avoir'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Modal de confirmation avant envoi de l'avoir */}
      <Dialog
        open={confirmRefundDialogOpen}
        onClose={() => setConfirmRefundDialogOpen(false)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>Confirmer l'envoi de l'avoir</DialogTitle>
        <DialogContent>
          <Typography>
            Êtes-vous sûr de vouloir envoyer ce bon d'avoir ?
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmRefundDialogOpen(false)}>
            Annuler
          </Button>
          <Button
            onClick={executeRefund}
            variant="contained"
            color="warning"
            disabled={isSendingRefund}
            startIcon={isSendingRefund ? <CircularProgress size={20} /> : null}
          >
            {isSendingRefund ? 'Envoi en cours...' : 'Confirmer'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Modal de confirmation d'envoi */}
      {/* Modal de confirmation d'envoi */}
      <Dialog
        open={sendConfirmation.open}
        onClose={() => setSendConfirmation({ open: false, response: null, invoiceNumber: '' })}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle sx={{ bgcolor: '#4caf50', color: 'white' }}>
          <Box display="flex" alignItems="center">
            <CheckCircleIcon sx={{ mr: 1 }} />
            Facture envoyée avec succès
          </Box>
        </DialogTitle>
        <DialogContent sx={{ mt: 2 }}>
          <Box mb={3}>
            <Typography variant="h6" gutterBottom>
              Facture #{sendConfirmation.invoiceNumber}
            </Typography>

            <Grid container spacing={2} sx={{ mb: 2 }}>
              <Grid item xs={4}><strong>NCC:</strong></Grid>
              <Grid item xs={8}>{sendConfirmation.response?.ncc || 'N/A'}</Grid>

              <Grid item xs={4}><strong>Référence:</strong></Grid>
              <Grid item xs={8}>
                {sendConfirmation.response?.credit_note_reference ||
                  sendConfirmation.response?.creditNoteReference ||
                  sendConfirmation.response?.refund_reference ||
                  sendConfirmation.response?.reference || 'N/A'}
              </Grid>

              <Grid item xs={4}><strong>Lien:</strong></Grid>
              <Grid item xs={8}>
                <Typography
                  component="a"
                  href={sendConfirmation.response?.token}
                  target="_blank"
                  rel="noopener noreferrer"
                  sx={{
                    color: 'primary.main',
                    textDecoration: 'none',
                    '&:hover': { textDecoration: 'underline' }
                  }}
                >
                  {sendConfirmation.response?.token || 'N/A'}
                </Typography>
              </Grid>
            </Grid>
          </Box>

          <Box sx={{ mt: 2, display: 'flex', justifyContent: 'flex-end', gap: 2 }}>
            <Button
              variant="contained"
              color="primary"
              startIcon={<PrintIcon />}
              onClick={() => {
                const token = sendConfirmation.response?.token ||
                  sendConfirmation.response?.data?.token ||
                  sendConfirmation.response?.response?.token;

                handlePrintInvoiceWithLog(token, sendConfirmation.invoiceNumber);
              }}
            >
              Imprimer la facture
            </Button>

            <Button
              variant="outlined"
              onClick={() => setSendConfirmation({ open: false, response: null, invoiceNumber: '' })}
            >
              Fermer
            </Button>
          </Box>
        </DialogContent>
      </Dialog>

      {/* Modal d'erreur d'envoi */}
      <Dialog
        open={errorModalOpen}
        onClose={handleCloseErrorModal}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle style={{ backgroundColor: '#f8d7da', color: '#721c24' }}>Erreur d'envoi</DialogTitle>
        <DialogContent style={{ padding: '20px' }}>
          <Typography variant="body1">{errorModalMessage}</Typography>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={handleCloseErrorModal}
            color="primary"
            variant="contained"
          >
            Fermer
          </Button>
        </DialogActions>
      </Dialog>

      {/* Modal de sélection des Points de Vente */}
      <Dialog
        open={posDialogOpen}
        onClose={() => !posLoading && setPosDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Sélectionner les Points de Vente Actifs (SURCCUSALE)</DialogTitle>
        <DialogContent dividers>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Cochez les points de vente que vous souhaitez autoriser lors de l'importation par template.
          </Typography>
          <List sx={{ pt: 0 }}>
            {allPointsOfSale.map((pos) => (
              <ListItem
                key={pos.id}
                disablePadding
              >
                <ListItemButton onClick={() => handleTogglePosSelection(pos.id)} dense>
                  <ListItemIcon>
                    <Checkbox
                      edge="start"
                      checked={!!posSelections[pos.id]}
                      tabIndex={-1}
                      disableRipple
                    />
                  </ListItemIcon>
                  <ListItemText primary={pos.libelle} />
                </ListItemButton>
              </ListItem>
            ))}
          </List>
          {allPointsOfSale.length === 0 && (
            <Typography variant="body2" sx={{ textAlign: 'center', py: 2 }}>
              Aucun point de vente trouvé dans la base de données.
            </Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPosDialogOpen(false)} disabled={posLoading}>
            Annuler
          </Button>
          <Button
            onClick={handleSavePosSelections}
            variant="contained"
            color="primary"
            disabled={posLoading}
            startIcon={posLoading ? <CircularProgress size={20} /> : <CheckCircleIcon />}
          >
            {posLoading ? 'Enregistrement...' : 'Valider Sélection'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Modal de sélection du format de téléchargement */}
      <Dialog
        open={downloadFormatDialogOpen}
        onClose={() => setDownloadFormatDialogOpen(false)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>Choisir le format du template</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ mb: 2 }}>
            Sélectionnez le format de fichier que vous souhaitez télécharger pour préparer vos données.
          </Typography>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            <Button
              variant="outlined"
              fullWidth
              startIcon={<FileDownloadIcon />}
              onClick={() => handleExportTemplateExcel('xlsx')}
              sx={{ justifyContent: 'flex-start', py: 1.5 }}
            >
              Excel (.xlsx) - Recommandé
            </Button>
            <Button
              variant="outlined"
              fullWidth
              startIcon={<FileDownloadIcon />}
              onClick={() => handleExportTemplateExcel('xls')}
              sx={{ justifyContent: 'flex-start', py: 1.5 }}
            >
              Excel 97-2003 (.xls)
            </Button>
            <Button
              variant="outlined"
              fullWidth
              startIcon={<FileDownloadIcon />}
              onClick={handleExportTemplateCSV}
              sx={{ justifyContent: 'flex-start', py: 1.5 }}
            >
              Texte CSV (.csv)
            </Button>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDownloadFormatDialogOpen(false)}>
            Annuler
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

function App() {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="100vh">
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Router>
      <Routes>
        <Route
          path="/login"
          element={!isAuthenticated ? <Login /> : <Navigate to="/" />}
        />
        <Route
          path="/"
          element={isAuthenticated ? <MainApp /> : <Navigate to="/login" />}
        />
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </Router>
  );
}

export default App;
