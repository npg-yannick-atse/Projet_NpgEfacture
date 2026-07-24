import {
  getClientName,
  getInvoiceNumber,
  getPartners,
  getVbrkHeader,
  getVbrpItems,
} from "@/lib/facture-utils";
import type {
  FactureData,
  FneInvoicePayload,
  FneItem,
  FneTaxCode,
} from "@/types";

const SAP_AMOUNT_DIVISOR = 10;
const DEFAULT_ESTABLISHMENT = "Nouvelle Parfumerie Gandour";
const DEFAULT_POINT_OF_SALE = "NPG_SIEGE_FACTURATION";

export function mapMeasurementUnit(unit: string | undefined): string {
  if (!unit) return "pce";
  const u = unit.toUpperCase();
  if (u === "KAR") return "CRN";
  if (u === "ST") return "pce";
  return unit;
}

function toTaxCode(rate: number | string | undefined): FneTaxCode {
  const n = Number(String(rate ?? "").replace(",", "."));
  if (!Number.isFinite(n) || n === 0) return "TVAC";
  if (n === 18) return "TVA";
  return "TVAC";
}

export interface BuildOptions {
  template?: FneInvoicePayload["template"];
  paymentMethod?: FneInvoicePayload["paymentMethod"];
  clientNcc?: string;
  clientEmail?: string;
  clientPhone?: string;
  pointOfSale?: string;
  commercialMessage?: string;
  clientSellerName?: string;
}

export function buildFnePayload(
  facture: FactureData,
  options: BuildOptions = {},
): FneInvoicePayload {
  const items = getVbrpItems(facture);
  const partners = getPartners(facture);
  const header = getVbrkHeader(facture);
  const ag = partners.find((p) => p.PARVW === "AG");

  const fneItems: FneItem[] = items.map((it) => ({
    reference: it.MATNR ?? "",
    description: it.ARKTX ?? "",
    quantity: Number(it.FKIMG) || 0,
    amount: (Number(it.NETWR) || 0) / SAP_AMOUNT_DIVISOR,
    discount: 0,
    measurementUnit: mapMeasurementUnit(it.VRKME),
    taxes: [toTaxCode(undefined)],
    customTaxes: [],
  }));

  return {
    invoiceType: "sale",
    paymentMethod: options.paymentMethod ?? "check",
    template: options.template ?? "B2B",
    clientNcc: options.clientNcc ?? "",
    clientCompanyName: getClientName(facture) || ag?.NAME1 || "",
    clientPhone:
      options.clientPhone ??
      (facture as { clientPhone?: string }).clientPhone ??
      "",
    clientEmail:
      options.clientEmail ??
      (facture as { clientEmail?: string }).clientEmail ??
      "",
    clientSellerName: options.clientSellerName ?? "",
    pointOfSale: options.pointOfSale ?? DEFAULT_POINT_OF_SALE,
    establishment: DEFAULT_ESTABLISHMENT,
    commercialMessage: options.commercialMessage ?? "",
    foreignCurrency: header?.WAERK && header.WAERK !== "XOF" ? header.WAERK : "",
    foreignCurrencyRate: 0,
    items: fneItems,
    customTaxes: [],
    discount: 0,
  };
}

export interface FneValidationResult {
  ok: boolean;
  missing: string[];
}

export function validateFnePayload(payload: FneInvoicePayload): FneValidationResult {
  const missing: string[] = [];
  const blank = (v: string | null | undefined) =>
    v === null || v === undefined || String(v).trim() === "";

  const isB2FExport =
    payload.template === "B2F" && payload.pointOfSale === "FACTURE_EXPORT";

  if (blank(payload.clientCompanyName)) missing.push("Nom client");
  if (blank(payload.clientPhone)) missing.push("Téléphone client");
  if (!isB2FExport && blank(payload.clientEmail)) missing.push("Email client");
  if (blank(payload.pointOfSale)) missing.push("Point de vente");
  if (blank(payload.establishment)) missing.push("Établissement");
  if (payload.template === "B2B" && blank(payload.clientNcc)) {
    missing.push("NCC client (obligatoire pour B2B)");
  }
  if (payload.items.length === 0) missing.push("Au moins une ligne");

  return { ok: missing.length === 0, missing };
}

export function getFactureInvoiceNumber(facture: FactureData): string {
  return getInvoiceNumber(facture);
}
