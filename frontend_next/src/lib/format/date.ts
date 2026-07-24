/**
 * SAP renvoie souvent des dates au format YYYYMMDD ou YYYY-MM-DD.
 */
export function formatDate(value: string | null | undefined): string {
  if (!value) return "";
  const trimmed = String(value).trim();
  if (!trimmed) return "";

  // YYYYMMDD
  if (/^\d{8}$/.test(trimmed)) {
    const y = trimmed.slice(0, 4);
    const m = trimmed.slice(4, 6);
    const d = trimmed.slice(6, 8);
    return `${d}/${m}/${y}`;
  }

  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) return trimmed;
  return date.toLocaleDateString("fr-FR");
}

export function toIsoDate(value: string | null | undefined): string {
  if (!value) return "";
  if (/^\d{8}$/.test(value)) {
    return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
  }
  return value;
}
