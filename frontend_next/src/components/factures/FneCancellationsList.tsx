"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ChevronDown, ChevronRight, ShieldX } from "lucide-react";
import { toast } from "sonner";
import { fneApi, extractError } from "@/lib/api";
import { formatDate, formatMontant } from "@/lib/format";
import type { DuplicateCategory, FneDuplicateGroup } from "@/types";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const CATEGORY_LABELS: Record<DuplicateCategory, { label: string; variant: "destructive" | "warning" | "secondary" }> = {
  DIFFERENT_REFERENCE: { label: "Références différentes", variant: "destructive" },
  SAME_REFERENCE: { label: "Référence identique", variant: "warning" },
  MIXED: { label: "Partielles", variant: "warning" },
  NO_REFERENCE: { label: "Sans référence", variant: "secondary" },
};

export function FneCancellationsList() {
  const [groups, setGroups] = useState<FneDuplicateGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [showTreated, setShowTreated] = useState(false);
  const [cancelling, setCancelling] = useState<string | null>(null);

  async function reload() {
    setLoading(true);
    setError("");
    try {
      const list = await fneApi.listDuplicates();
      setGroups(list);
    } catch (err) {
      setError(extractError(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void reload();
  }, []);

  const visible = useMemo(
    () => (showTreated ? groups : groups.filter((g) => !g.treated)),
    [groups, showTreated],
  );

  function toggle(num: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(num)) next.delete(num);
      else next.add(num);
      return next;
    });
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-10">
        <Spinner className="h-5 w-5" />
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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-sm text-slate-600">
          {groups.length === 0 ? (
            "Aucun doublon FNE détecté."
          ) : (
            <>
              <span className="font-semibold text-slate-900">{visible.length}</span> doublon(s) {showTreated ? "" : "non traité(s)"}
              {!showTreated && groups.length !== visible.length && (
                <> · {groups.length - visible.length} déjà traité(s)</>
              )}
            </>
          )}
        </p>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={showTreated}
            onChange={(e) => setShowTreated(e.target.checked)}
            className="h-4 w-4 rounded border-slate-300"
          />
          Afficher les groupes déjà traités
        </label>
      </div>

      {visible.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-slate-500">
            Aucun doublon à afficher.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {visible.map((g) => {
            const isExpanded = expanded.has(g.numero_facture);
            const cat = CATEGORY_LABELS[g.category];
            return (
              <Card key={g.numero_facture} className="overflow-hidden">
                <button
                  type="button"
                  onClick={() => toggle(g.numero_facture)}
                  className="w-full flex items-center justify-between p-4 hover:bg-slate-50 text-left"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    {isExpanded ? (
                      <ChevronDown className="h-4 w-4 shrink-0" />
                    ) : (
                      <ChevronRight className="h-4 w-4 shrink-0" />
                    )}
                    <span className="font-mono text-sm font-medium">{g.numero_facture}</span>
                    <Badge variant={cat.variant}>{cat.label}</Badge>
                    <Badge variant="outline">{g.nb_entries} signatures</Badge>
                    {g.treated && <Badge variant="success">Traité</Badge>}
                    {!g.treated && g.category === "DIFFERENT_REFERENCE" && (
                      <span className="inline-flex items-center text-amber-600 text-xs gap-1">
                        <AlertTriangle className="h-3.5 w-3.5" />
                        Critique
                      </span>
                    )}
                  </div>
                </button>

                {isExpanded && (
                  <div className="border-t border-slate-200 bg-slate-50/50 p-4 space-y-2">
                    {g.entries.map((e, i) => (
                      <div
                        key={e.fne_invoice_id}
                        className="flex items-center justify-between gap-3 bg-white border border-slate-200 rounded-md p-3"
                      >
                        <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-mono text-slate-500">
                              #{i + 1}
                            </span>
                            {i === 0 ? (
                              <Badge variant="outline">Originale</Badge>
                            ) : (
                              <Badge variant="warning">Doublon</Badge>
                            )}
                            {e.cancelled && <Badge variant="success">Annulée</Badge>}
                            <span className="font-mono text-xs">
                              {e.fne_reference ?? "(pas de référence)"}
                            </span>
                          </div>
                          <div className="flex gap-3 text-xs text-slate-500">
                            <span>{formatDate(e.created_at)}</span>
                            {e.amount != null && (
                              <span className="tabular-nums">
                                {formatMontant(e.amount)} XOF
                              </span>
                            )}
                            {e.fne_ncc && (
                              <span className="font-mono">NCC : {e.fne_ncc}</span>
                            )}
                          </div>
                          {e.cancelled && (
                            <div className="text-xs text-emerald-700 mt-1">
                              Annulée par {e.cancelled_by ?? "?"} le{" "}
                              {formatDate(e.cancelled_at)}
                              {e.cancellation_reference && (
                                <> · réf. {e.cancellation_reference}</>
                              )}
                              {e.cancellation_reason && <> · raison : {e.cancellation_reason}</>}
                            </div>
                          )}
                        </div>

                        {!e.cancelled && i > 0 && (
                          <CancelDuplicateButton
                            fneInvoiceId={e.fne_invoice_id}
                            cancelling={cancelling === e.fne_invoice_id}
                            onCancel={async (reason) => {
                              setCancelling(e.fne_invoice_id);
                              try {
                                await fneApi.cancelDuplicate({
                                  fne_invoice_id: e.fne_invoice_id,
                                  reason,
                                });
                                toast.success("Doublon annulé");
                                void reload();
                              } catch (err) {
                                toast.error(extractError(err));
                              } finally {
                                setCancelling(null);
                              }
                            }}
                          />
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function CancelDuplicateButton({
  fneInvoiceId,
  cancelling,
  onCancel,
}: {
  fneInvoiceId: string;
  cancelling: boolean;
  onCancel: (reason: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");

  return (
    <>
      <Button
        size="sm"
        variant="destructive"
        onClick={() => setOpen(true)}
        disabled={cancelling}
      >
        {cancelling ? <Spinner /> : <ShieldX className="h-4 w-4" />}
        <span>Annuler ce doublon</span>
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Annuler ce doublon FNE</DialogTitle>
            <DialogDescription>
              Cette action est irréversible. La signature FNE concernée sera annulée
              auprès de la DGI.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-1.5">
            <Label htmlFor="reason">Raison (optionnelle)</Label>
            <Input
              id="reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Ex : doublon involontaire suite à un timeout..."
            />
            <p className="text-xs text-slate-500 font-mono">FNE id : {fneInvoiceId}</p>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={cancelling}>
              Fermer
            </Button>
            <Button
              variant="destructive"
              disabled={cancelling}
              onClick={async () => {
                await onCancel(reason);
                setOpen(false);
              }}
            >
              {cancelling ? <Spinner /> : <ShieldX className="h-4 w-4" />}
              <span>Confirmer l&apos;annulation</span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
