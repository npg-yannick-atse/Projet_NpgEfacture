export type FneTemplate = "B2B" | "B2C" | "B2F" | "B2G";
export type FnePaymentMethod = "cash" | "check" | "transfer" | "credit-card" | "mobile-money";
export type FneInvoiceTypeKind = "sale" | "refund" | "purchase";
export type FneTaxCode = "TVA" | "TVAB" | "TVAC" | "TVAD";

export interface FneItem {
  reference: string;
  description: string;
  quantity: number;
  amount: number;
  discount?: number;
  measurementUnit: string;
  taxes: FneTaxCode[];
  customTaxes: Array<{ name: string; amount: number }>;
}

export interface FneCustomTax {
  name: string;
  amount: number;
}

export interface FneInvoicePayload {
  invoiceType: FneInvoiceTypeKind;
  paymentMethod: FnePaymentMethod;
  template: FneTemplate;
  clientNcc: string;
  clientCompanyName: string;
  clientPhone: string;
  clientEmail: string;
  clientSellerName: string;
  pointOfSale: string;
  establishment: string;
  commercialMessage: string;
  foreignCurrency: string;
  foreignCurrencyRate: number;
  items: FneItem[];
  customTaxes: FneCustomTax[];
  discount: number;
}

export interface SendInvoiceResult {
  success: boolean;
  message?: string;
  invoiceNumber?: string;
  timestamp?: string;
  response?: {
    success: boolean;
    ncc?: string;
    reference?: string;
    token?: string;
  };
  error?: string;
  previous_status?: string;
  previous_by?: string;
  previous_on?: string;
  fne_reference?: string;
  fne_invoice_id?: string;
}

export interface CheckSentResponse {
  alreadySent: boolean;
  sentBy?: string;
  sentOn?: string;
  status?: string;
}
