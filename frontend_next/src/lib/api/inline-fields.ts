import { api } from "./client";
import { ENDPOINTS } from "./endpoints";

export type InlineFieldName =
  | "ClientEmail"
  | "ClientPhone"
  | "Template"
  | "PaymentMethod"
  | "InvoiceType"
  | "isRne"
  | "PointOfSale";

export interface InlineFieldModification {
  id: number;
  invoice_number: string;
  field_name: InlineFieldName;
  old_value: string | null;
  new_value: string;
  user_id: number;
  user_name: string | null;
  apply_to_all: boolean;
  line_number: number | null;
  modification_date: string;
}

export interface UpdateInlineFieldPayload {
  invoiceNumber: string;
  fieldName: InlineFieldName;
  newValue: string;
  oldValue?: string | null;
  applyToAll?: boolean;
  lineNumber?: number | null;
  userId: number;
  userName?: string;
}

export async function updateField(payload: UpdateInlineFieldPayload) {
  const { data } = await api.post(ENDPOINTS.INLINE_FIELDS.UPDATE_FIELD, payload);
  return data;
}

export async function getModifications(
  invoiceNumber: string,
): Promise<InlineFieldModification[]> {
  const { data } = await api.get<{ success: boolean; data: InlineFieldModification[] }>(
    ENDPOINTS.INLINE_FIELDS.BY_INVOICE(invoiceNumber),
  );
  return data.data ?? [];
}

export function pickLatest(
  modifications: InlineFieldModification[],
): Partial<Record<InlineFieldName, string>> {
  const latest: Partial<Record<InlineFieldName, string>> = {};
  for (const m of modifications) {
    if (!(m.field_name in latest)) {
      latest[m.field_name] = m.new_value;
    }
  }
  return latest;
}
