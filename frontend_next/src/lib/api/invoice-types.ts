import { api } from "./client";
import { ENDPOINTS } from "./endpoints";
import type {
  ApiListResponse,
  ApiResponse,
  InvoiceType,
  InvoiceTypeFull,
  InvoiceTypeStats,
} from "@/types";

export async function listInvoiceTypes(includeInactive = false): Promise<InvoiceType[]> {
  const { data } = await api.get<ApiListResponse<InvoiceType>>(
    ENDPOINTS.INVOICE_TYPES.BASE,
    { params: includeInactive ? { all: 1 } : undefined },
  );
  return data.data ?? [];
}

export async function getInvoiceTypeStats(): Promise<InvoiceTypeStats> {
  const { data } = await api.get<ApiResponse<InvoiceTypeStats>>(
    ENDPOINTS.INVOICE_TYPES.STATS,
  );
  return data.data ?? { downloaded: {}, errors: {} };
}

export interface InvoiceTypeInput {
  code: string;
  label: string;
  icon_name?: string | null;
  color_hex?: string | null;
  display_order?: number;
  active?: boolean;
}

export async function createInvoiceType(input: InvoiceTypeInput): Promise<InvoiceTypeFull> {
  const { data } = await api.post<ApiResponse<InvoiceTypeFull>>(
    ENDPOINTS.INVOICE_TYPES.BASE,
    input,
  );
  return data.data;
}

export async function updateInvoiceType(
  id: number,
  patch: Partial<InvoiceTypeInput>,
): Promise<InvoiceTypeFull> {
  const { data } = await api.put<ApiResponse<InvoiceTypeFull>>(
    ENDPOINTS.INVOICE_TYPES.BY_ID(id),
    patch,
  );
  return data.data;
}

export async function deleteInvoiceType(id: number): Promise<{ success: boolean; softDeleted?: boolean; message?: string }> {
  const { data } = await api.delete<{ success: boolean; softDeleted?: boolean; message?: string }>(
    ENDPOINTS.INVOICE_TYPES.BY_ID(id),
  );
  return data;
}
