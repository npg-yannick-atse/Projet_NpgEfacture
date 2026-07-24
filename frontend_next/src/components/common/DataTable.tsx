"use client";

import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";

export interface DataTableColumn<T> {
  key: string;
  header: string;
  render?: (row: T) => ReactNode;
  accessor?: (row: T) => string | number | null | undefined;
  align?: "left" | "right" | "center";
  className?: string;
  sortable?: boolean;
  width?: string;
}

interface DataTableProps<T> {
  data: T[];
  columns: DataTableColumn<T>[];
  rowKey: (row: T) => string | number;
  loading?: boolean;
  empty?: ReactNode;
  pageSize?: number;
  selectable?: boolean;
  onSelectionChange?: (ids: Array<string | number>) => void;
  onRowClick?: (row: T) => void;
}

export function DataTable<T>({
  data,
  columns,
  rowKey,
  loading,
  empty,
  pageSize = 25,
  selectable,
  onSelectionChange,
  onRowClick,
}: DataTableProps<T>) {
  const [page, setPage] = useState(0);
  const [sort, setSort] = useState<{ key: string; dir: "asc" | "desc" } | null>(null);
  const [selected, setSelected] = useState<Set<string | number>>(new Set());

  const sorted = useMemo(() => {
    if (!sort) return data;
    const col = columns.find((c) => c.key === sort.key);
    if (!col?.accessor) return data;
    const acc = col.accessor;
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...data].sort((a, b) => {
      const av = acc(a);
      const bv = acc(b);
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
      return String(av).localeCompare(String(bv), "fr") * dir;
    });
  }, [data, sort, columns]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const safePage = Math.min(page, totalPages - 1);
  const paginated = useMemo(
    () => sorted.slice(safePage * pageSize, (safePage + 1) * pageSize),
    [sorted, safePage, pageSize],
  );

  function toggleSort(col: DataTableColumn<T>) {
    if (!col.sortable) return;
    setSort((prev) => {
      if (prev?.key !== col.key) return { key: col.key, dir: "asc" };
      if (prev.dir === "asc") return { key: col.key, dir: "desc" };
      return null;
    });
  }

  // Notify parent of selection changes via effect to avoid setState-during-render
  // when onSelectionChange triggers updates in the parent component.
  // Use a ref to keep onSelectionChange stable so changing parent identity
  // doesn't refire the effect uselessly.
  const onSelectionChangeRef = useRef(onSelectionChange);
  useEffect(() => {
    onSelectionChangeRef.current = onSelectionChange;
  }, [onSelectionChange]);

  const isFirstSelectionRender = useRef(true);
  useEffect(() => {
    if (isFirstSelectionRender.current) {
      isFirstSelectionRender.current = false;
      return;
    }
    onSelectionChangeRef.current?.(Array.from(selected));
  }, [selected]);

  function toggleSelect(id: string | number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    setSelected((prev) => {
      const allOnPageIds = paginated.map(rowKey);
      const allSelected = allOnPageIds.every((id) => prev.has(id));
      const next = new Set(prev);
      if (allSelected) allOnPageIds.forEach((id) => next.delete(id));
      else allOnPageIds.forEach((id) => next.add(id));
      return next;
    });
  }

  if (loading) {
    return (
      <div className="rounded-md border border-slate-200 bg-white">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-12 m-2 rounded-sm" />
        ))}
      </div>
    );
  }

  if (sorted.length === 0) {
    return (
      <div className="rounded-md border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">
        {empty ?? "Aucun résultat."}
      </div>
    );
  }

  const allOnPageSelected =
    selectable && paginated.length > 0 && paginated.every((r) => selected.has(rowKey(r)));

  return (
    <div className="rounded-md border border-slate-200 bg-white overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            {selectable && (
              <TableHead className="w-10">
                <input
                  type="checkbox"
                  checked={!!allOnPageSelected}
                  onChange={toggleSelectAll}
                  className="h-4 w-4 rounded border-slate-300"
                  aria-label="Tout sélectionner"
                />
              </TableHead>
            )}
            {columns.map((col) => {
              const active = sort?.key === col.key;
              return (
                <TableHead
                  key={col.key}
                  style={col.width ? { width: col.width } : undefined}
                  className={cn(
                    col.align === "right" && "text-right",
                    col.align === "center" && "text-center",
                    col.sortable && "cursor-pointer select-none",
                    col.className,
                  )}
                  onClick={() => toggleSort(col)}
                >
                  <span className="inline-flex items-center gap-1">
                    {col.header}
                    {col.sortable && active && sort.dir === "asc" && <ChevronUp className="h-3 w-3" />}
                    {col.sortable && active && sort.dir === "desc" && <ChevronDown className="h-3 w-3" />}
                  </span>
                </TableHead>
              );
            })}
          </TableRow>
        </TableHeader>
        <TableBody>
          {paginated.map((row) => {
            const id = rowKey(row);
            return (
              <TableRow
                key={id}
                className={cn(onRowClick && "cursor-pointer")}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
              >
                {selectable && (
                  <TableCell className="w-10" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={selected.has(id)}
                      onChange={() => toggleSelect(id)}
                      className="h-4 w-4 rounded border-slate-300"
                      aria-label={`Sélectionner ${id}`}
                    />
                  </TableCell>
                )}
                {columns.map((col) => (
                  <TableCell
                    key={col.key}
                    className={cn(
                      col.align === "right" && "text-right",
                      col.align === "center" && "text-center",
                      col.className,
                    )}
                  >
                    {col.render ? col.render(row) : (col.accessor?.(row) ?? "")}
                  </TableCell>
                ))}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200 text-xs text-slate-600">
        <span>
          {sorted.length} ligne{sorted.length > 1 ? "s" : ""}
          {selectable && selected.size > 0 ? ` · ${selected.size} sélectionnée(s)` : ""}
        </span>
        <Pagination page={safePage} totalPages={totalPages} onChange={setPage} />
      </div>
    </div>
  );
}

function Pagination({
  page,
  totalPages,
  onChange,
}: {
  page: number;
  totalPages: number;
  onChange: (p: number) => void;
}) {
  if (totalPages <= 1) return null;
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        disabled={page === 0}
        onClick={() => onChange(page - 1)}
        className="px-2 py-1 rounded border border-slate-300 disabled:opacity-50 hover:bg-slate-50"
      >
        Précédent
      </button>
      <span className="tabular-nums">
        {page + 1} / {totalPages}
      </span>
      <button
        type="button"
        disabled={page >= totalPages - 1}
        onClick={() => onChange(page + 1)}
        className="px-2 py-1 rounded border border-slate-300 disabled:opacity-50 hover:bg-slate-50"
      >
        Suivant
      </button>
    </div>
  );
}
