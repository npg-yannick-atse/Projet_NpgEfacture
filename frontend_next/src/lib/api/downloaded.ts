import { api } from "./client";
import { ENDPOINTS } from "./endpoints";
import type { DownloadedInvoiceRow, ListFilters } from "@/types";

interface ListResponse {
  success: boolean;
  data: DownloadedInvoiceRow[];
  count: number;
}

export interface SaveDownloadedPayload {
  id: string;
  username: string;
  numero: string;
  date?: string | null;
  client: string;
  data: unknown;
  invoice_type_code?: string | null;
}

export async function saveDownloaded(payload: SaveDownloadedPayload) {
  const { data } = await api.post(ENDPOINTS.DOWNLOADED_INVOICES.BASE, payload);
  return data;
}

export async function getDownloadedByNumero(
  numero: string,
): Promise<DownloadedInvoiceRow | null> {
  const { data } = await api.get<ListResponse>(ENDPOINTS.DOWNLOADED_INVOICES.BASE, {
    params: { search: numero, includeSent: "true" },
  });
  return (data.data ?? []).find((r) => r.numero === numero) ?? null;
}

export async function listDownloaded(filters: ListFilters = {}): Promise<ListResponse> {
  const { data } = await api.get<ListResponse>(ENDPOINTS.DOWNLOADED_INVOICES.BASE, {
    params: {
      ...(filters.search ? { search: filters.search } : {}),
      ...(filters.startDate ? { startDate: filters.startDate } : {}),
      ...(filters.endDate ? { endDate: filters.endDate } : {}),
      ...(filters.pointOfSale ? { pointOfSale: filters.pointOfSale } : {}),
      ...(filters.sortBy ? { sortBy: filters.sortBy } : {}),
      ...(filters.sortOrder ? { sortOrder: filters.sortOrder } : {}),
      ...(filters.includeSent ? { includeSent: "true" } : {}),
    },
  });
  return data;
}

export async function deleteDownloaded(id: string | number): Promise<{ success: boolean; message?: string }> {
  const { data } = await api.delete(`${ENDPOINTS.DOWNLOADED_INVOICES.BASE}/${encodeURIComponent(String(id))}`);
  return data;
}

export async function bulkDeleteDownloaded(ids: Array<string | number>): Promise<{ success: boolean; deleted: number }> {
  const { data } = await api.post(ENDPOINTS.DOWNLOADED_INVOICES.BULK_DELETE, { ids });
  return data;
}

export async function toggleVerified(id: string | number): Promise<{ success: boolean; verified: boolean }> {
  const { data } = await api.put(ENDPOINTS.DOWNLOADED_INVOICES.VERIFY(id));
  return data;
}
