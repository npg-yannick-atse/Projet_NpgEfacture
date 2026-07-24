"use client";

import { useEffect, useState } from "react";
import { Send } from "lucide-react";
import { toast } from "sonner";
import { fneApi, extractError } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { events } from "@/lib/events";
import { formatMontant } from "@/lib/format";
import type { AvoirResolution, RefundItem } from "@/lib/api/sap";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  resolution: AvoirResolution;
  numeroAvoir: string;
  clientName: string;
  onSent?: (reference: string | null) => void;
}

export function RefundEditorDialog({
  open,
  onOpenChange,
  resolution,
  numeroAvoir,
  clientName,
  onSent,
}: Props) {
  const { user } = useAuth();
  const [items, setItems] = useState<RefundItem[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (open && resolution.refundPayload?.items) {
      setItems(resolution.refundPayload.items.map((it) => ({ ...it })));
      setError("");
    }
  }, [open, resolution]);

  function setQty(idx: number, qty: number) {
    setItems((prev) =>
      prev.map((it, i) => {
        if (i !== idx) return it;
        const max = Number(it.maxQuantity ?? it.quantity ?? Infinity);
        const next = Math.max(0, Math.min(qty, max));
        return { ...it, quantity: next };
      }),
    );
  }

  const totalEstime = items.reduce(
    (sum, it) => sum + Number(it.amount ?? 0) * Number(it.quantity ?? 0),
    0,
  );

  async function handleSend() {
    if (!resolution.refundPayload?.invoiceId) return;
    const filtered = items.filter((it) => Number(it.quantity ?? 0) > 0);
    if (filtered.length === 0) {
      setError("Au moins une ligne doit avoir une quantité > 0.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const res = await fneApi.refundFne({
        invoiceId: resolution.refundPayload.invoiceId,
        items: filtered,
        username: user?.username ?? undefined,
        numeroAvoir,
        clientName,
        montantAvoir: resolution.avoir?.montant ?? 0,
        devise: resolution.avoir?.devise ?? "XOF",
      });
      if (res?.success) {
        toast.success("Avoir transmis à FNE");
        events.emit("invoice:refunded", { numero: numeroAvoir });
        const ref = (res?.data as { reference?: string })?.reference ?? null;
        onSent?.(ref);
        onOpenChange(false);
      } else {
        setError(res?.error ?? "Échec de l'envoi");
      }
    } catch (err) {
      setError(extractError(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={submitting ? () => undefined : onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Édition des quantités à rembourser</DialogTitle>
          <DialogDescription>
            Avoir <span className="font-mono">{numeroAvoir}</span> · Réf. facture initiale{" "}
            <span className="font-mono">{resolution.factureInitiale?.reference ?? "—"}</span>
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-md border border-slate-200 overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Article</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="text-right">PU</TableHead>
                <TableHead className="text-right w-32">Quantité</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((it, i) => {
                const qty = Number(it.quantity ?? 0);
                const max = Number(it.maxQuantity ?? it.quantity ?? 0);
                const total = Number(it.amount ?? 0) * qty;
                return (
                  <TableRow key={`${it.id ?? it.reference ?? i}`}>
                    <TableCell className="font-mono text-xs">
                      {it.reference ?? "—"}
                    </TableCell>
                    <TableCell className="max-w-[280px]">
                      <span className="line-clamp-2">{it.description ?? "—"}</span>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatMontant(it.amount ?? 0)}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-2">
                        <Input
                          type="number"
                          min={0}
                          max={max || undefined}
                          step="any"
                          value={qty}
                          onChange={(e) => setQty(i, Number(e.target.value))}
                          className="h-8 w-20 text-right tabular-nums"
                        />
                        {max > 0 && (
                          <span className="text-xs text-slate-500 min-w-[2.5rem]">
                            / {max}
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums font-medium">
                      {formatMontant(total)}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>

        <div className="flex justify-end text-sm">
          <span className="text-slate-600">Total estimé :&nbsp;</span>
          <span className="font-bold tabular-nums text-slate-900">
            {formatMontant(totalEstime)} {resolution.avoir?.devise ?? "XOF"}
          </span>
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Annuler
          </Button>
          <Button onClick={handleSend} disabled={submitting}>
            {submitting ? <Spinner /> : <Send className="h-4 w-4" />}
            <span>Envoyer l&apos;avoir à FNE</span>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
