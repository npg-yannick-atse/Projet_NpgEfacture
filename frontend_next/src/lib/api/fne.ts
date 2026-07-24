import { api } from "./client";
import { ENDPOINTS } from "./endpoints";
import type { ApiListResponse, FneDuplicateGroup } from "@/types";

export async function listDuplicates(): Promise<FneDuplicateGroup[]> {
  const { data } = await api.get<ApiListResponse<FneDuplicateGroup>>(
    ENDPOINTS.FNE.DUPLICATES,
  );
  return data.data ?? [];
}

export async function cancelDuplicate(payload: {
  fne_invoice_id: string;
  reason?: string;
}): Promise<{ success: boolean; message?: string; reference?: string }> {
  const { data } = await api.post(ENDPOINTS.FNE.CANCEL_DUPLICATE, payload);
  return data;
}

export async function refundFne(payload: {
  invoiceId: string;
  items?: unknown[];
  username?: string;
  numeroAvoir: string;
  clientName?: string;
  montantAvoir?: number;
  devise?: string;
}) {
  const { data } = await api.post(ENDPOINTS.FNE_INVOICES.REFUND, payload);
  return data;
}

export async function getFneByInvoiceNumber(numero: string) {
  const { data } = await api.get(ENDPOINTS.FNE_INVOICES.BY_SAP_NUMBER, {
    params: { numero },
  });
  return data;
}
