import { api } from "./client";
import { ENDPOINTS } from "./endpoints";
import type { ListFilters, SentInvoiceRow } from "@/types";

interface ListResponse {
  success: boolean;
  data: SentInvoiceRow[];
  count: number;
}

export async function listSent(filters: ListFilters = {}): Promise<ListResponse> {
  const { data } = await api.get<ListResponse>(ENDPOINTS.LOGS.SENT_INVOICES, {
    params: {
      ...(filters.search ? { search: filters.search } : {}),
      ...(filters.startDate ? { startDate: filters.startDate } : {}),
      ...(filters.endDate ? { endDate: filters.endDate } : {}),
      ...(filters.username ? { username: filters.username } : {}),
      ...(filters.pointOfSale ? { pointOfSale: filters.pointOfSale } : {}),
      ...(filters.sortBy ? { sortBy: filters.sortBy } : {}),
      ...(filters.sortOrder ? { sortOrder: filters.sortOrder } : {}),
    },
  });
  return data;
}
