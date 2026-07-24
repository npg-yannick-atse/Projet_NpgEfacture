"use client";

import { Search, X } from "lucide-react";
import { type ReactNode } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface FilterBarProps {
  search: string;
  onSearchChange: (v: string) => void;
  startDate?: string;
  endDate?: string;
  onStartDateChange?: (v: string) => void;
  onEndDateChange?: (v: string) => void;
  onReset?: () => void;
  searchPlaceholder?: string;
  extra?: ReactNode;
}

export function FilterBar({
  search,
  onSearchChange,
  startDate,
  endDate,
  onStartDateChange,
  onEndDateChange,
  onReset,
  searchPlaceholder = "Rechercher (numéro, client...)",
  extra,
}: FilterBarProps) {
  return (
    <div className="rounded-md border border-slate-200 bg-white p-3 flex flex-wrap items-end gap-3">
      <div className="flex-1 min-w-[240px]">
        <label className="text-xs font-medium text-slate-600 block mb-1">Recherche</label>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={searchPlaceholder}
            className="pl-9"
          />
        </div>
      </div>

      {onStartDateChange && (
        <div>
          <label className="text-xs font-medium text-slate-600 block mb-1">Du</label>
          <Input
            type="date"
            value={startDate ?? ""}
            onChange={(e) => onStartDateChange(e.target.value)}
            className="w-[160px]"
          />
        </div>
      )}

      {onEndDateChange && (
        <div>
          <label className="text-xs font-medium text-slate-600 block mb-1">Au</label>
          <Input
            type="date"
            value={endDate ?? ""}
            onChange={(e) => onEndDateChange(e.target.value)}
            className="w-[160px]"
          />
        </div>
      )}

      {extra}

      {onReset && (
        <Button type="button" variant="ghost" size="sm" onClick={onReset} className="text-slate-600">
          <X className="h-4 w-4" />
          <span>Réinitialiser</span>
        </Button>
      )}
    </div>
  );
}
