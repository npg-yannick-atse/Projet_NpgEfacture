"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Send, ShieldAlert, XCircle } from "lucide-react";
import { toast } from "sonner";
import { sapApi, extractError } from "@/lib/api";
import { buildFnePayload, validateFnePayload } from "@/lib/fne/build-payload";
import { events } from "@/lib/events";
import {
  extractFactureLines,
  getInvoiceNumber,
} from "@/lib/facture-utils";
import type { DownloadedInvoiceRow, FactureData, SapInvoiceResponse } from "@/types";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
  rows: DownloadedInvoiceRow[];
}

type LineStatus = "pending" | "running" | "ok" | "skipped" | "error";

interface LineResult {
  numero: string;
  status: LineStatus;
  message?: string;
  reference?: string;
}

const MAX_BULK = 15;

export function BulkSendDialog({ open, onOpenChange, rows }: Props) {
  const [results, setResults] = useState<LineResult[]>([]);
  const [running, setRunning] = useState(false);

  const eligible = rows.slice(0, MAX_BULK);

  useEffect(() => {
    if (open) {
      setResults(
        eligible.map((r) => ({ numero: r.numero, status: "pending" })),
      );
      setRunning(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, rows]);

  function update(numero: string, patch: Partial<LineResult>) {
    setResults((prev) =>
      prev.map((r) => (r.numero === numero ? { ...r, ...patch } : r)),
    );
  }

  async function run() {
    setRunning(true);
    let okCount = 0;
    let errCount = 0;
    let skipCount = 0;

    for (const row of eligible) {
      const numero = row.numero;
      update(numero, { status: "running" });

      // 1. Anti-doublon
      try {
        const check = await sapApi.checkAlreadySent(numero);
        if (check.alreadySent) {
          update(numero, {
            status: "skipped",
            message: `Déjà envoyée le ${check.sentOn ? new Date(check.sentOn).toLocaleString("fr-FR") : "?"}`,
          });
          skipCount += 1;
          continue;
        }
      } catch {
        // ignore : check is best-effort
      }

      // 2. Charger payload depuis le cache (row.data)
      let lines: FactureData[];
      try {
        const synthetic: SapInvoiceResponse = {
          success: true,
          data: row.data as SapInvoiceResponse["data"],
        };
        lines = extractFactureLines(synthetic);
      } catch (err) {
        update(numero, { status: "error", message: extractError(err) });
        errCount += 1;
        continue;
      }

      const first = lines[0];
      if (!first) {
        update(numero, { status: "error", message: "Données vides" });
        errCount += 1;
        continue;
      }

      const payload = buildFnePayload(first);
      const validation = validateFnePayload(payload);
      if (!validation.ok) {
        update(numero, {
          status: "error",
          message: `Champs manquants : ${validation.missing.join(", ")}`,
        });
        errCount += 1;
        continue;
      }

      // 3. Envoi
      try {
        const result = await sapApi.sendInvoiceByNumber(
          getInvoiceNumber(first) || numero,
          payload,
        );
        if (result.success) {
          update(numero, {
            status: "ok",
            reference: result.response?.reference,
          });
          events.emit("invoice:sent", {
            numero,
            reference: result.response?.reference,
          });
          // Fire-and-forget notification
          void sapApi.triggerNotification({
            invoiceNumber: numero,
            event: "invoice_sent",
            data: { reference: result.response?.reference ?? null },
          });
          okCount += 1;
        } else {
          update(numero, {
            status: "error",
            message: result.message ?? result.error ?? "Échec",
          });
          errCount += 1;
        }
      } catch (err) {
        update(numero, { status: "error", message: extractError(err) });
        errCount += 1;
      }
    }

    setRunning(false);
    toast.success(
      `Envoi terminé : ${okCount} ok · ${skipCount} ignoré(s) · ${errCount} erreur(s)`,
    );
  }

  return (
    <Dialog open={open} onOpenChange={running ? () => undefined : onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Envoyer {eligible.length} facture(s) à FNE</DialogTitle>
          <DialogDescription>
            Envoi séquentiel avec vérification anti-doublon et validation des champs.
          </DialogDescription>
        </DialogHeader>

        {rows.length > MAX_BULK && (
          <Alert variant="warning">
            <ShieldAlert className="h-4 w-4" />
            <AlertDescription>
              Sélection limitée à {MAX_BULK} factures par lot ({rows.length} sélectionnée(s)).
              Les autres seront à envoyer dans un autre lot.
            </AlertDescription>
          </Alert>
        )}

        <div className="max-h-80 overflow-y-auto rounded border border-slate-200 divide-y divide-slate-100">
          {results.map((r) => (
            <div
              key={r.numero}
              className="flex items-center justify-between gap-2 px-3 py-2 text-sm"
            >
              <div className="flex items-center gap-2 min-w-0">
                <StatusIcon status={r.status} />
                <span className="font-mono text-xs">{r.numero}</span>
                {r.reference && (
                  <Badge variant="success" className="font-mono text-[10px]">
                    {r.reference}
                  </Badge>
                )}
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
          <Button onClick={run} disabled={running || results.length === 0}>
            {running ? <Spinner /> : <Send className="h-4 w-4" />}
            <span>{running ? "Envoi…" : "Démarrer l'envoi"}</span>
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
    case "skipped":
      return <Badge variant="warning" className="text-[10px]">Ignorée</Badge>;
    case "error":
      return <XCircle className="h-4 w-4 text-red-600" />;
  }
}
