export const ENDPOINTS = {
  AUTH: {
    LOGIN: "/api/auth/login",
  },
  SAP: {
    SEARCH: "/api/sap/invoices",
    INVOICE_DETAILS: "/api/sap/invoice-details",
    SEND_INVOICE: "/api/sap/send-invoice",
    CLIENT_ADDRESS: "/api/sap/client-address",
    INVOICES_BY_DATE: "/api/sap/invoices-by-date",
    RESOLVE_AVOIR: "/api/sap/resolve-avoir",
  },
  LOGS: {
    DOWNLOAD: "/api/logs/download",
    DELETE: "/api/logs/delete",
    SEND: "/api/logs/send",
    PRINT: "/api/logs/print",
    CHECK_SENT: (numero: string) =>
      `/api/logs/check-sent/${encodeURIComponent(numero)}`,
    SENT_INVOICES: "/api/sent-invoices",
  },
  DOWNLOADED_INVOICES: {
    BASE: "/api/downloaded-invoices",
    BULK_DELETE: "/api/downloaded-invoices/bulk-delete",
    VERIFY: (id: number | string) => `/api/downloaded-invoices/${id}/verify`,
  },
  NOTIFICATIONS: {
    TRIGGER: "/api/notifications/trigger",
  },
  FNE_INVOICES: {
    BY_SAP_NUMBER: "/api/fne-invoices/by-sap-number",
    REFUND: "/api/fne-invoices/refund",
    BY_ID: (id: number | string) => `/api/fne-invoices/${id}`,
    ITEMS_BY_IDS: "/api/fne-invoices/items/by-ids",
    MANUAL_REGISTER: "/api/fne-invoices/manual-register",
  },
  INLINE_FIELDS: {
    UPDATE_STATUS: "/api/inline-fields/status",
    UPDATE_FIELD: "/api/inline-fields",
    BY_INVOICE: (numero: string) =>
      `/api/inline-fields/invoice/${encodeURIComponent(numero)}`,
  },
  POINT_OF_SALE: {
    BASE: "/api/point-of-sale",
    BULK_UPDATE: "/api/point-of-sale/bulk-update",
  },
  SETTINGS: {
    ME: "/api/settings/me",
    ROLES: "/api/settings/roles",
    USERS: "/api/settings/users",
    LDAP_USERS: "/api/settings/ldap-users",
    USER_TYPE: (id: number | string) => `/api/settings/users/${id}/type`,
    USER_ROLES: (id: number | string) => `/api/settings/users/${id}/roles`,
    USER: (id: number | string) => `/api/settings/users/${id}`,
  },
  FNE: {
    DUPLICATES: "/api/fne/duplicates",
    CANCEL_DUPLICATE: "/api/fne/cancel-duplicate",
  },
  INVOICE_TYPES: {
    BASE: "/api/invoice-types",
    STATS: "/api/invoice-types/stats",
    BY_ID: (id: number | string) => `/api/invoice-types/${id}`,
  },
} as const;
