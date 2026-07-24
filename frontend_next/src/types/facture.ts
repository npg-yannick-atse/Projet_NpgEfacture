export interface VbrkHeader {
  VBELN: string;
  FKART: string;
  FKDAT: string;
  KUNNR: string;
  NETWR: number;
  WAERK: string;
  ZTERM?: string;
  numeroFacture?: string;
  nomClient?: string;
}

export interface VbrpItem {
  VBELN: string;
  POSNR: string;
  MATNR: string;
  ARKTX: string;
  FKIMG: number;
  VRKME: string;
  NETWR: number;
  KZWI1?: number;
}

export interface VbpaPartner {
  PARVW: string;
  KUNNR: string;
  NAME1?: string;
  ADRNR?: string;
}

export interface KomvCondition {
  KSCHL: string;
  KBETR: number;
  KWERT: number;
  WAERS: string;
}

export interface ClientAddress {
  KUNNR: string;
  NAME1?: string;
  STRAS?: string;
  ORT01?: string;
  PSTLZ?: string;
  TELF1?: string;
  SMTP_ADDR?: string;
}

export interface FactureData {
  VBRK_I?: VbrkHeader;
  XVBRP?: VbrpItem[];
  XVBPA?: VbpaPartner[];
  XKOMV?: KomvCondition[];
  numeroFacture?: string;
  nomClient?: string;
  fkart?: string;
  kunnr?: string;
  clientEmail?: string;
  clientPhone?: string;
  [key: string]: unknown;
}

export interface SapInvoiceResponse {
  success: boolean;
  message?: string;
  data: FactureData | FactureData[] | { data: FactureData | FactureData[] };
}

export interface InvoiceListItem {
  numero: string;
  client: string;
  date: string;
  montantHT: number;
  devise: string;
  fkart: string;
  status?: string;
}

export interface InvoiceType {
  id: number;
  code: string;
  label: string;
  icon_name?: string;
  color_hex?: string;
  active?: boolean;
}

export interface InvoiceTypeStats {
  downloaded: Record<string, number>;
  errors: Record<string, number>;
}
