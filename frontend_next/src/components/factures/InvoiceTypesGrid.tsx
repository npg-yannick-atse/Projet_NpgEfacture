"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import * as Icons from "lucide-react";
import { invoiceTypesApi, extractError } from "@/lib/api";
import type { InvoiceType, InvoiceTypeStats } from "@/types";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { cn } from "@/lib/utils";

function pickIcon(name?: string) {
  if (!name) return Icons.Receipt;
  const Comp = (Icons as unknown as Record<string, Icons.LucideIcon>)[name];
  return Comp ?? Icons.Receipt;
}

function darken(hex: string, amount = 40): string {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) return hex;
  const n = parseInt(hex.slice(1), 16);
  const r = Math.max(0, ((n >> 16) & 0xff) - amount);
  const g = Math.max(0, ((n >> 8) & 0xff) - amount);
  const b = Math.max(0, (n & 0xff) - amount);
  return `#${[r, g, b].map((x) => x.toString(16).padStart(2, "0")).join("")}`;
}

export function InvoiceTypesGrid() {
  const [types, setTypes] = useState<InvoiceType[]>([]);
  const [stats, setStats] = useState<InvoiceTypeStats>({ downloaded: {}, errors: {} });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>("");

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const [t, s] = await Promise.all([
          invoiceTypesApi.listInvoiceTypes(),
          invoiceTypesApi.getInvoiceTypeStats(),
        ]);
        if (!mounted) return;
        setTypes(t);
        setStats(s);
      } catch (err) {
        if (!mounted) return;
        setError(extractError(err));
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  if (loading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-64 rounded-xl" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  if (types.length === 0) {
    return (
      <Alert>
        <AlertDescription>
          Aucun type de facture actif. Un administrateur doit en créer dans Paramètres.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {types.map((t) => {
        const Icon = pickIcon(t.icon_name);
        const base = /^#[0-9a-f]{6}$/i.test(t.color_hex ?? "") ? t.color_hex! : "#1976d2";
        const downloadedCount = stats.downloaded?.[t.code] ?? 0;
        const errorCount = stats.errors?.[t.code] ?? 0;
        return (
          <Link
            key={t.id}
            href={`/telechargees?type=${encodeURIComponent(t.code)}`}
            className={cn(
              "group relative overflow-hidden rounded-xl p-5 text-white shadow-md transition-all",
              "hover:-translate-y-1 hover:shadow-xl",
            )}
            style={{
              background: `linear-gradient(135deg, ${base} 0%, ${darken(base)} 100%)`,
            }}
          >
            <div className="flex items-center mb-4">
              <div className="h-12 w-12 rounded-lg bg-white/20 backdrop-blur-sm flex items-center justify-center">
                <Icon className="h-6 w-6 text-white" />
              </div>
            </div>

            <div className="flex gap-2 mb-3">
              <div className="flex-1 rounded-md bg-white/20 backdrop-blur-sm px-2 py-1.5">
                <div className="text-[10px] opacity-85">Téléchargées →</div>
                <div className="text-xl font-bold leading-tight">{downloadedCount}</div>
              </div>
              <div
                className={cn(
                  "flex-1 rounded-md backdrop-blur-sm px-2 py-1.5",
                  errorCount > 0 ? "bg-red-500/85" : "bg-white/15",
                )}
              >
                <div className="text-[10px] opacity-85">En erreur →</div>
                <div className="text-xl font-bold leading-tight">{errorCount}</div>
              </div>
            </div>

            <div>
              <div className="font-bold leading-snug line-clamp-2 min-h-[2.5rem]">
                {t.label}
              </div>
              <div className="font-mono text-[11px] opacity-85 tracking-wider mt-1">
                {t.code}
              </div>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
