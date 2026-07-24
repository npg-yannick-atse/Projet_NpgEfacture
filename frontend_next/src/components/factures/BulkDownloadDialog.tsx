"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Download, XCircle } from "lucide-react";
import { toast } from "sonner";
import { downloadedApi, sapApi, extractError } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { events } from "@/lib/events";
import {
  extractFactureLines,
  getClientName,
  getInvoiceNumber,
  getVbrkHeader,
} from "@/lib/facture-utils";
import type { SapInvoiceListItem } from "@/lib/api/sap";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rows: SapInvoiceListItem[];
}

type LineStatus = "pending" | "running" | "ok" | "duplicate" | "error";

interface LineResult {
  numero: string;
  status: LineStatus;
  message?: string;
}

export function BulkDownloadDialog({ open, onOpenChange, rows }: Props) {
  const { user } = useAuth();
  const [results, setResults] = useState<LineResult[]>([]);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    if (open) {
      setResults(rows.map((r) => ({ numero: r.numero, status: "pending" })));
      setRunning(false);
    }
  }, [open, rows]);

  function update(numero: string, patch: Partial<LineResult>) {
    setResults((prev) =>
      prev.map((r) => (r.numero === numero ? { ...r, ...patch } : r)),
    );
  }

  async function run() {
    if (!user?.username) {
      toast.error("Utilisateur non identifié.");
      return;
    }
    setRunning(true);
    let okCount = 0;
    let dupCount = 0;
    let errCount = 0;

    for (const row of rows) {
      const numero = row.numero;
      update(numero, { status: "running" });

      try {
        // 1. Fetch SAP
        const res = await sapApi.searchInvoice(numero);
        if (!res.success) {
          update(numero, {
            status: "error",
            message: (res as { message?: string }).message ?? "Échec SAP",
          });
          errCount += 1;
          continue;
        }

        const lines = extractFactureLines(res);
        const first = lines[0];
        if (!first) {
          update(numero, { status: "error", message: "Données vides" });
          errCount += 1;
          continue;
        }

        // 2. Save
        const header = getVbrkHeader(first);
        await downloadedApi.saveDownloaded({
          id: `${numero}_${Date.now()}`,
          username: user.username,
          numero: getInvoiceNumber(first) || numero,
          date: header?.FKDAT ?? row.date ?? null,
          client: getClientName(first) || row.nomClient || "Client inconnu",
          data: lines,
        });

        update(numero, { status: "ok" });
        events.emit("invoice:downloaded", { numero });
        okCount += 1;
      } catch (err) {
        const msg = extractError(err);
        if (msg.toLowerCase().includes("déjà été téléchargée")) {
          update(numero, { status: "duplicate", message: "Déjà téléchargée" });
          dupCount += 1;
        } else {
          update(numero, { status: "error", message: msg });
          errCount += 1;
        }
      }
    }

    setRunning(false);
    toast.success(
      `${okCount} téléchargée(s) · ${dupCount} doublon(s) · ${errCount} erreur(s)`,
    );
  }

  return (
    <Dialog open={open} onOpenChange={running ? () => undefined : onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            Télécharger {rows.length} facture(s) depuis SAP
          </DialogTitle>
          <DialogDescription>
            Récupération SAP puis sauvegarde dans l&apos;historique.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-80 overflow-y-auto rounded border border-slate-200 divide-y divide-slate-100">
          {results.map((r) => (
            <div
              key={r.numero}
              className="flex items-center justify-between gap-2 px-3 py-2 text-sm"
            >
              <div className="flex items-center gap-2 min-w-0">
                <StatusIcon status={r.status} />
                <span className="font-mono text-xs">{r.numero}</span>
              </div>
              {r.message && (
                <span className="text-xs text-slate-500 truncate max-w-[280px]">
                  {r.message}
                </span>
              )}
            </div>
          ))}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={running}
          >
            {running ? "En cours…" : "Fermer"}
          </Button>
          <Button onClick={run} disabled={running || rows.length === 0}>
            {running ? <Spinner /> : <Download className="h-4 w-4" />}
            <span>{running ? "Téléchargement…" : "Démarrer"}</span>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function StatusIcon({ status }: { status: LineStatus }) {
  switch (status) {
    case "pending":
      return <span className="h-2 w-2 rounded-full bg-slate-300 inline-block" />;
    case "running":
      return <Spinner className="h-3.5 w-3.5" />;
    case "ok":
      return <CheckCircle2 className="h-4 w-4 text-emerald-600" />;
    case "duplicate":
      return <Badge variant="warning" className="text-[10px]">Doublon</Badge>;
    case "error":
      return <XCircle className="h-4 w-4 text-red-600" />;
  }
}
