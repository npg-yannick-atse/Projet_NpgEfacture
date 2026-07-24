// Configuration de l'API
export const API_BASE_URL = 'http://10.10.2.55:8050'; // IP du serveur (backend PROD)

// URLs des endpoints
export const API_ENDPOINTS = {
  AUTH: {
    LOGIN: `${API_BASE_URL}/api/auth/login`,
  },
  SAP: {
    SEARCH: `${API_BASE_URL}/api/sap/invoices`,
    INVOICE_DETAILS: `${API_BASE_URL}/api/sap/invoice-details`,
    SEND_INVOICE: `${API_BASE_URL}/api/sap/send-invoice`,
    CLIENT_ADDRESS: `${API_BASE_URL}/api/sap/client-address`,
    INVOICES_BY_DATE: `${API_BASE_URL}/api/sap/invoices-by-date`,
    RESOLVE_AVOIR: `${API_BASE_URL}/api/sap/resolve-avoir`,
  },
  LOGS: {
    DOWNLOAD: `${API_BASE_URL}/api/logs/download`,
    DELETE: `${API_BASE_URL}/api/logs/delete`,
    SEND: `${API_BASE_URL}/api/logs/send`,
    PRINT: `${API_BASE_URL}/api/logs/print`,
    CHECK_SENT: (numeroFacture) => `${API_BASE_URL}/api/logs/check-sent/${encodeURIComponent(numeroFacture)}`,
    SENT_INVOICES: `${API_BASE_URL}/api/sent-invoices`,
  },
  DOWNLOADED_INVOICES: {
    BASE: `${API_BASE_URL}/api/downloaded-invoices`,
    BULK_DELETE: `${API_BASE_URL}/api/downloaded-invoices/bulk-delete`,
  },
  NOTIFICATIONS: {
    TRIGGER: `${API_BASE_URL}/api/notifications/trigger`,
  },
  FNE_INVOICES: {
    BY_SAP_NUMBER: `${API_BASE_URL}/api/fne-invoices/by-sap-number`,
    REFUND: `${API_BASE_URL}/api/fne-invoices/refund`,
    BY_ID: (id) => `${API_BASE_URL}/api/fne-invoices/${id}`,
    ITEMS_BY_IDS: `${API_BASE_URL}/api/fne-invoices/items/by-ids`,
    MANUAL_REGISTER: `${API_BASE_URL}/api/fne-invoices/manual-register`,
  },
  INLINE_FIELDS: {
    UPDATE_STATUS: `${API_BASE_URL}/api/inline-fields/status`,
    UPDATE_FIELD: `${API_BASE_URL}/api/inline-fields`,
    BY_INVOICE: (invoiceNumber) => `${API_BASE_URL}/api/inline-fields/invoice/${invoiceNumber}`,
  },
  POINT_OF_SALE: {
    BASE: `${API_BASE_URL}/api/point-of-sale`,
    BULK_UPDATE: `${API_BASE_URL}/api/point-of-sale/bulk-update`
  },
  VERIFY_INVOICE: (id) => `${API_BASE_URL}/api/downloaded-invoices/${id}/verify`,
  SETTINGS: {
    ME: `${API_BASE_URL}/api/settings/me`,
    ROLES: `${API_BASE_URL}/api/settings/roles`,
    USERS: `${API_BASE_URL}/api/settings/users`,
    LDAP_USERS: `${API_BASE_URL}/api/settings/ldap-users`,
    USER_TYPE: (idUser) => `${API_BASE_URL}/api/settings/users/${idUser}/type`,
    USER_ROLES: (idUser) => `${API_BASE_URL}/api/settings/users/${idUser}/roles`,
    USER: (idUser) => `${API_BASE_URL}/api/settings/users/${idUser}`,
  },
  FNE: {
    DUPLICATES: `${API_BASE_URL}/api/fne/duplicates`,
    CANCEL_DUPLICATE: `${API_BASE_URL}/api/fne/cancel-duplicate`,
    PRINT_PROXY: (numero) => `${API_BASE_URL}/api/fne/print/${encodeURIComponent(numero)}`,
    PRINT_MULTI: `${API_BASE_URL}/api/fne/print-multi`,
  },
  INVOICE_TYPES: {
    BASE: `${API_BASE_URL}/api/invoice-types`,
    STATS: `${API_BASE_URL}/api/invoice-types/stats`,
    BY_ID: (id) => `${API_BASE_URL}/api/invoice-types/${id}`,
  },
  BL_VALIDATIONS: {
    LIST: `${API_BASE_URL}/api/bl-validations`,
    INVOICE: (numero) => `${API_BASE_URL}/api/bl-validations/invoice/${encodeURIComponent(numero)}`,
    VALIDATE_LOGISTIQUE: (numero) => `${API_BASE_URL}/api/bl-validations/invoice/${encodeURIComponent(numero)}/logistique`,
    VALIDATE_COMMERCIAL: (numero) => `${API_BASE_URL}/api/bl-validations/invoice/${encodeURIComponent(numero)}/commercial`,
    VALIDATE_COMPTABILITE: (numero) => `${API_BASE_URL}/api/bl-validations/invoice/${encodeURIComponent(numero)}/comptabilite`,
    RECORD_PRINT: (numero) => `${API_BASE_URL}/api/bl-validations/invoice/${encodeURIComponent(numero)}/print`,
  },
  AUTO_DOWNLOAD: {
    CONFIG: `${API_BASE_URL}/api/auto-download/config`,
    RUN_NOW: `${API_BASE_URL}/api/auto-download/run-now`,
    STOP: `${API_BASE_URL}/api/auto-download/stop`,
    RUNS: `${API_BASE_URL}/api/auto-download/runs`,
  },
  NON_FNE: {
    BASE: `${API_BASE_URL}/api/non-fne`,
    CHECK: `${API_BASE_URL}/api/non-fne/check`,
    BY_NUMERO: (numero) => `${API_BASE_URL}/api/non-fne/${encodeURIComponent(numero)}`,
  },
};
