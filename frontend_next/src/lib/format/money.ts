/**
 * SAP stocke les montants multipliés par 10. On divise puis on formate en fr-FR.
 */
export function formatMontantSap(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === "") return "0";
  const n = Number(value);
  if (Number.isNaN(n)) return "0";
  return Math.round(n / 10).toLocaleString("fr-FR", {
    maximumFractionDigits: 0,
    minimumFractionDigits: 0,
  });
}

export function formatMontant(value: number | string | null | undefined, decimals = 0): string {
  if (value === null || value === undefined || value === "") return "0";
  const n = Number(value);
  if (Number.isNaN(n)) return "0";
  return n.toLocaleString("fr-FR", {
    maximumFractionDigits: decimals,
    minimumFractionDigits: decimals,
  });
}

export function formatTotalHT(value: number | string | null | undefined): string {
  return formatMontant(value, 3);
}
