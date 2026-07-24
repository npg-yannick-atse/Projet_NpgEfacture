export interface DownloadedInvoiceRow {
  id: string;
  username: string;
  numero: string;
  date: string;
  client: string;
  data: unknown;
  download_date: string;
  verified: boolean | number;
  invoice_type_code?: string | null;
  modifications?: Record<string, unknown> | null;
  computedDetails?: {
    numeroFacture?: string;
    nomClient?: string;
    totalTTC?: number;
    totalNetHT?: number;
    pointOfSale?: string;
  };
}

export type SentStatus = "success" | "failed";

export interface SentInvoiceRow {
  id: number | string;
  numero_facture: string;
  username: string;
  sent_by: string;
  send_date: string;
  api_response?: Record<string, unknown> | null;
  invoice_type: "invoice" | "refund" | "cancellation" | string;
  reference?: string | null;
  is_cancellation?: boolean;
  initial_invoice_numero?: string | null;
  initial_invoice_reference?: string | null;
  point_of_sale?: string;
  client_name: string;
  total_ttc: number;
  fne_invoice_id?: string | null;
  fne_created_at?: string | null;
  is_template?: boolean;
  status: SentStatus;
  is_manual?: boolean;
  manual_on?: string | null;
  manual_by?: string | null;
  is_orphan?: boolean;
}

export interface ListFilters {
  search?: string;
  startDate?: string;
  endDate?: string;
  pointOfSale?: string;
  sortBy?: string;
  sortOrder?: "ASC" | "DESC";
  includeSent?: boolean;
  username?: string;
}
