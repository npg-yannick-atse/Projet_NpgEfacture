export type FneStatus = "pending" | "sent" | "error" | "refunded" | "cancelled";

export interface FneInvoice {
  id: number;
  sap_invoice_number: string;
  fne_id?: string;
  fne_reference?: string;
  status: FneStatus;
  signed_at?: string;
  error_message?: string;
  invoice_type?: string;
  is_refund?: boolean;
  refund_of_id?: number | null;
  pdf_url?: string;
  qr_code?: string;
  created_at: string;
  updated_at: string;
}

export interface FneInvoiceItem {
  id: number;
  fne_invoice_id: number;
  description: string;
  quantity: number;
  unit_price: number;
  total: number;
  vat_code?: string;
}
