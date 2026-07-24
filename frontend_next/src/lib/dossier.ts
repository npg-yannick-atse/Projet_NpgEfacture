/**
 * Le N°Dossier regroupe une ou plusieurs factures EXPORT.
 * Stocké dans le payload data (premier item) au moment de l'import Excel.
 * On accepte plusieurs alias pour rester robuste face aux variations d'écriture.
 */

const DOSSIER_ALIASES = [
  "numero_dossier",
  "numeroDossier",
  "N°Dossier",
  "NoDossier",
  "no_dossier",
  "n_dossier",
  "dossier",
  "Dossier",
  "folder",
  "folder_no",
] as const;

const NORMALIZED_ALIASES = DOSSIER_ALIASES.map((a) => normalize(a));

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

function extractFromObject(obj: unknown): string | null {
  if (!obj || typeof obj !== "object") return null;
  const record = obj as Record<string, unknown>;
  // Direct match first (fast path)
  for (const alias of DOSSIER_ALIASES) {
    const v = record[alias];
    if (typeof v === "string" && v.trim()) return v.trim();
    if (typeof v === "number") return String(v);
  }
  // Normalized comparison (handles "N° Dossier", "N_Dossier", etc.)
  for (const key of Object.keys(record)) {
    if (NORMALIZED_ALIASES.includes(normalize(key))) {
      const v = record[key];
      if (typeof v === "string" && v.trim()) return v.trim();
      if (typeof v === "number") return String(v);
    }
  }
  return null;
}

/** Read the dossier number from a DownloadedInvoiceRow-like object. */
export function getDossierFromDownloaded(row: {
  data?: unknown;
  modifications?: Record<string, unknown> | null;
}): string | null {
  // 1. modifications inline override
  const fromMod = row.modifications ? extractFromObject(row.modifications) : null;
  if (fromMod) return fromMod;

  // 2. data : array → first item, or object directly
  const data = row.data;
  if (Array.isArray(data)) {
    for (const item of data) {
      const v = extractFromObject(item);
      if (v) return v;
    }
    return null;
  }
  return extractFromObject(data);
}

/** Read the dossier number from a SentInvoiceRow-like object. */
export function getDossierFromSent(row: {
  api_response?: Record<string, unknown> | null;
}): string | null {
  return extractFromObject(row.api_response);
}

export interface DossierGroup<T> {
  /** null pour les lignes sans dossier */
  dossier: string | null;
  rows: T[];
}

export function groupByDossier<T>(
  rows: T[],
  getKey: (row: T) => string | null,
): DossierGroup<T>[] {
  const groups = new Map<string, T[]>();
  const noDossier: T[] = [];

  for (const row of rows) {
    const key = getKey(row);
    if (!key) {
      noDossier.push(row);
    } else {
      const arr = groups.get(key) ?? [];
      arr.push(row);
      groups.set(key, arr);
    }
  }

  const result: DossierGroup<T>[] = Array.from(groups.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([dossier, rows]) => ({ dossier, rows }));

  if (noDossier.length > 0) {
    result.push({ dossier: null, rows: noDossier });
  }

  return result;
}

/** True if at least one row has a dossier — useful to decide between flat and grouped view. */
export function hasAnyDossier<T>(
  rows: T[],
  getKey: (row: T) => string | null,
): boolean {
  return rows.some((r) => Boolean(getKey(r)));
}
