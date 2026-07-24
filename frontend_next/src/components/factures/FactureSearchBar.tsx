"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";

export function FactureSearchBar() {
  const router = useRouter();
  const [numero, setNumero] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkText, setBulkText] = useState("");

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const val = numero.trim();
    if (!val) return;
    setSubmitting(true);
    router.push(`/factures/${encodeURIComponent(val)}`);
  }

  const numeros = bulkText
    .split(/[\s,;\r\n]+/)
    .map((s) => s.trim())
    .filter(Boolean);

  function openInTabs() {
    if (numeros.length === 0) return;
    // Premier dans la fenêtre actuelle, les autres dans des onglets
    numeros.slice(1).forEach((n) => {
      window.open(`/factures/${encodeURIComponent(n)}`, "_blank");
    });
    router.push(`/factures/${encodeURIComponent(numeros[0])}`);
  }

  return (
    <div className="space-y-2">
      <form onSubmit={onSubmit} className="flex gap-2 max-w-xl">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            value={numero}
            onChange={(e) => setNumero(e.target.value)}
            placeholder="Numéro de facture SAP (VBELN)..."
            className="pl-9"
          />
        </div>
        <Button type="submit" disabled={!numero.trim() || submitting}>
          {submitting ? <Spinner /> : "Rechercher"}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => setBulkOpen((v) => !v)}
        >
          {bulkOpen ? "Mode simple" : "Multi-numéros"}
        </Button>
      </form>

      {bulkOpen && (
        <div className="rounded-md border border-slate-200 bg-white p-3 max-w-xl space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-700">
              Collez plusieurs numéros (un par ligne, virgule ou point-virgule)
            </span>
            {bulkText && (
              <button
                type="button"
                onClick={() => setBulkText("")}
                className="text-xs text-slate-500 hover:text-slate-700 inline-flex items-center gap-1"
              >
                <X className="h-3 w-3" /> Effacer
              </button>
            )}
          </div>
          <textarea
            value={bulkText}
            onChange={(e) => setBulkText(e.target.value)}
            rows={4}
            className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder={"00082668\n00082669\n00082670"}
          />
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-500">
              {numeros.length} numéro(s) détecté(s)
            </span>
            <Button
              type="button"
              size="sm"
              onClick={openInTabs}
              disabled={numeros.length === 0}
            >
              Ouvrir tout
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
