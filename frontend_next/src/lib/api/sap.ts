import { api } from "./client";
import { ENDPOINTS } from "./endpoints";
import type {
  CheckSentResponse,
  ClientAddress,
  FneInvoicePayload,
  SapInvoiceResponse,
  SendInvoiceResult,
} from "@/types";

export async function searchInvoice(
  vbeln: string,
  options: { konvRead?: boolean } = {},
): Promise<SapInvoiceResponse> {
  const { data } = await api.post<SapInvoiceResponse>(ENDPOINTS.SAP.SEARCH, {
    VBELN: vbeln.trim(),
    KONV_READ: options.konvRead === false ? "" : "X",
  });
  return data;
}

export interface SapInvoiceListItem {
  numero: string;
  date: string;
  client: string;
  type: string;
  montant: string | number;
  devise: string;
  bzirk?: string;
  kdgrp?: string;
  nomClient?: string;
}

export async function getInvoicesByDate(params: {
  startDate: string;
  endDate: string;
}): Promise<{ success: boolean; data: SapInvoiceListItem[] }> {
  const { data } = await api.post<{ success: boolean; data: SapInvoiceListItem[] }>(
    ENDPOINTS.SAP.INVOICES_BY_DATE,
    params,
  );
  return data;
}

export async function getClientAddress(kunnr: string): Promise<ClientAddress | null> {
  const { data } = await api.get<{ success: boolean; data: ClientAddress | ClientAddress[] }>(
    `${ENDPOINTS.SAP.CLIENT_ADDRESS}/${encodeURIComponent(kunnr)}`,
  );
  if (!data?.success) return null;
  return Array.isArray(data.data) ? data.data[0] ?? null : data.data ?? null;
}

export interface RefundItem {
  id?: number | string;
  reference?: string;
  description?: string;
  quantity?: number;
  maxQuantity?: number;
  amount?: number;
  [key: string]: unknown;
}

export interface AvoirResolution {
  success: boolean;
  error?: string;
  message?: string;
  avoir?: {
    numero: string;
    montant?: number;
    devise?: string;
    factureInitiale?: string;
  };
  factureInitiale?: {
    numero: string;
    reference?: string;
  };
  refundPayload?: {
    invoiceId: string;
    items: Array<RefundItem>;
  };
  matchedItemsCount?: number;
  totalAvoirItemsCount?: number;
  partial?: boolean;
}

export async function resolveAvoir(numeroAvoir: string): Promise<AvoirResolution> {
  const { data } = await api.post<AvoirResolution>(ENDPOINTS.SAP.RESOLVE_AVOIR, {
    numeroAvoir: numeroAvoir.trim(),
  });
  return data;
}

export async function sendInvoice(payload: Record<string, unknown>) {
  const { data } = await api.post(ENDPOINTS.SAP.SEND_INVOICE, payload);
  return data;
}

export async function sendInvoiceByNumber(
  invoiceNumber: string,
  payload: FneInvoicePayload,
): Promise<SendInvoiceResult> {
  const { data } = await api.post<SendInvoiceResult>(
    `${ENDPOINTS.SAP.SEND_INVOICE}/${encodeURIComponent(invoiceNumber)}`,
    payload,
  );
  return data;
}

export async function checkAlreadySent(invoiceNumber: string): Promise<CheckSentResponse> {
  const { data } = await api.get<CheckSentResponse>(
    ENDPOINTS.LOGS.CHECK_SENT(invoiceNumber),
  );
  return data;
}

export async function triggerNotification(payload: {
  invoiceNumber: string;
  event?: string;
  data?: Record<string, unknown>;
}) {
  try {
    const { data } = await api.post(ENDPOINTS.NOTIFICATIONS.TRIGGER, payload);
    return data;
  } catch {
    // Notifications are non-critical — don't surface errors to the user.
    return null;
  }
}

export async function logPrintAction(invoiceNumber: string) {
  try {
    const { data } = await api.post(ENDPOINTS.LOGS.PRINT, {
      numero_facture: invoiceNumber,
    });
    return data;
  } catch {
    return null;
  }
}

export async function logDownloadAction(invoiceNumber: string) {
  try {
    const { data } = await api.post(ENDPOINTS.LOGS.DOWNLOAD, {
      numero_facture: invoiceNumber,
    });
    return data;
  } catch {
    return null;
  }
}
