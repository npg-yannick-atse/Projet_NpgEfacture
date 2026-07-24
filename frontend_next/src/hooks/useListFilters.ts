"use client";

import { useEffect, useMemo, useState } from "react";
import { useDebounce } from "./useDebounce";
import type { ListFilters } from "@/types";

export function useListFilters(initial: ListFilters = {}) {
  const [search, setSearch] = useState(initial.search ?? "");
  const [startDate, setStartDate] = useState(initial.startDate ?? "");
  const [endDate, setEndDate] = useState(initial.endDate ?? "");
  const [pointOfSale, setPointOfSale] = useState(initial.pointOfSale ?? "");

  const debouncedSearch = useDebounce(search, 350);

  const filters = useMemo<ListFilters>(
    () => ({
      search: debouncedSearch || undefined,
      startDate: startDate || undefined,
      endDate: endDate || undefined,
      pointOfSale: pointOfSale || undefined,
    }),
    [debouncedSearch, startDate, endDate, pointOfSale],
  );

  // Sync from initial when query string changes (e.g. ?type=...)
  useEffect(() => {
    if (initial.pointOfSale !== undefined) setPointOfSale(initial.pointOfSale);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial.pointOfSale]);

  function reset() {
    setSearch("");
    setStartDate("");
    setEndDate("");
    setPointOfSale("");
  }

  return {
    search,
    setSearch,
    startDate,
    setStartDate,
    endDate,
    setEndDate,
    pointOfSale,
    setPointOfSale,
    filters,
    reset,
  };
}
