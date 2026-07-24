import * as XLSX from "xlsx";

export interface ExcelColumn<T> {
  key: string;
  header: string;
  accessor: (row: T) => string | number | null | undefined;
}

export function exportToExcel<T>(
  rows: T[],
  columns: ExcelColumn<T>[],
  fileName: string,
  sheetName = "Données",
): void {
  const data = rows.map((row) =>
    columns.reduce<Record<string, string | number>>((acc, col) => {
      const v = col.accessor(row);
      acc[col.header] = v == null ? "" : (v as string | number);
      return acc;
    }, {}),
  );

  const ws = XLSX.utils.json_to_sheet(data, {
    header: columns.map((c) => c.header),
  });

  // Auto-size columns
  ws["!cols"] = columns.map((col) => {
    const maxLen = Math.max(
      col.header.length,
      ...data.map((r) => String(r[col.header] ?? "").length),
    );
    return { wch: Math.min(maxLen + 2, 60) };
  });

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);

  const safeName = fileName.endsWith(".xlsx") ? fileName : `${fileName}.xlsx`;
  XLSX.writeFile(wb, safeName);
}
