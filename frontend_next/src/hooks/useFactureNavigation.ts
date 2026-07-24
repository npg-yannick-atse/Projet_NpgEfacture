"use client";

import { useMemo } from "react";

const STORAGE_KEY = "ef:facture-nav";

export interface FactureNavContext {
  numeros: string[];
  source?: string;
}

export function setFactureNavigation(ctx: FactureNavContext): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(ctx));
  } catch {
    // ignore
  }
}

function readContext(): FactureNavContext | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as FactureNavContext) : null;
  } catch {
    return null;
  }
}

export function useFactureNavigation(currentNumero: string) {
  return useMemo(() => {
    const ctx = readContext();
    if (!ctx || !Array.isArray(ctx.numeros)) {
      return { prev: null, next: null, source: null, position: null };
    }
    const idx = ctx.numeros.indexOf(currentNumero);
    if (idx === -1) {
      return { prev: null, next: null, source: ctx.source ?? null, position: null };
    }
    return {
      prev: idx > 0 ? ctx.numeros[idx - 1] : null,
      next: idx < ctx.numeros.length - 1 ? ctx.numeros[idx + 1] : null,
      source: ctx.source ?? null,
      position: { current: idx + 1, total: ctx.numeros.length },
    };
  }, [currentNumero]);
}
