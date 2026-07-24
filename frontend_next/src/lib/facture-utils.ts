import type {
  FactureData,
  KomvCondition,
  SapInvoiceResponse,
  VbpaPartner,
  VbrkHeader,
  VbrpItem,
} from "@/types";

/**
 * Le backend SAP renvoie un format hétérogène : tantôt response.data.data, tantôt
 * response.data.data.data, tantôt un tableau, tantôt un objet. Cette fonction
 * normalise et renvoie toujours un tableau de FactureData.
 */
export function extractFactureLines(response: SapInvoiceResponse): FactureData[] {
  if (!response?.data) return [];
  const root = response.data as unknown;

  if (Array.isArray(root)) return root as FactureData[];

  if (typeof root === "object" && root !== null) {
    const obj = root as { data?: FactureData | FactureData[] };
    if (Array.isArray(obj.data)) return obj.data;
    if (obj.data) return [obj.data];
    return [root as FactureData];
  }

  return [];
}

export function getVbrkHeader(line: FactureData): VbrkHeader | null {
  const direct = (line as { VBRK_I?: VbrkHeader }).VBRK_I;
  if (direct) return direct;
  const maybe = line as unknown as VbrkHeader;
  if (maybe?.VBELN || maybe?.FKART || maybe?.KUNNR) return maybe;
  return null;
}

export function getVbrpItems(line: FactureData): VbrpItem[] {
  const items = (line as { XVBRP?: VbrpItem[] }).XVBRP;
  return Array.isArray(items) ? items : [];
}

export function getPartners(line: FactureData): VbpaPartner[] {
  const partners = (line as { XVBPA?: VbpaPartner[] }).XVBPA;
  return Array.isArray(partners) ? partners : [];
}

export function getKomvConditions(line: FactureData): KomvCondition[] {
  const direct = (line as { XKOMV?: KomvCondition[] }).XKOMV;
  if (Array.isArray(direct)) return direct;
  const items = getVbrpItems(line);
  const aggregated: KomvCondition[] = [];
  for (const it of items) {
    const itemKomv = (it as unknown as { XKOMV?: KomvCondition[] }).XKOMV;
    if (Array.isArray(itemKomv)) aggregated.push(...itemKomv);
  }
  return aggregated;
}

export function getInvoiceNumber(line: FactureData): string {
  return (
    (line as { numeroFacture?: string }).numeroFacture ??
    (line as { VBELN?: string }).VBELN ??
    getVbrkHeader(line)?.VBELN ??
    ""
  );
}

export function getClientName(line: FactureData): string {
  const partners = getPartners(line);
  const ag = partners.find((p) => p.PARVW === "AG");
  return (
    (line as { nomClient?: string }).nomClient ??
    ag?.NAME1 ??
    partners[0]?.NAME1 ??
    ""
  );
}

export function isAvoirFkart(fkart: string | undefined): boolean {
  if (!fkart) return false;
  const f = fkart.trim();
  return f.includes("G2") || f.includes("RE") || f.includes("S1") || f.includes("CR");
}
