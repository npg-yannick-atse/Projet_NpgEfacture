"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Pencil } from "lucide-react";
import { sapApi, extractError } from "@/lib/api";
import { formatMontant } from "@/lib/format";
import type { AvoirResolution } from "@/lib/api/sap";
import { RefundEditorDialog } from "./RefundEditorDialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";

interface Props {
  numeroAvoir: string;
  clientName: string;
}

export function AvoirPanel({ numeroAvoir, clientName }: Props) {
  const [resolution, setResolution] = useState<AvoirResolution | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [sentRef, setSentRef] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    sapApi
      .resolveAvoir(numeroAvoir)
      .then((res) => mounted && setResolution(res))
      .catch((err) => mounted && setError(extractError(err)))
      .finally(() => mounted && setLoading(false));
    return () => {
      mounted = false;
    };
  }, [numeroAvoir]);

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center gap-2 py-6 text-sm text-slate-500">
          <Spinner /> Résolution de l&apos;avoir en cours…
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Alert variant="warning">
        <AlertDescription>
          Impossible de résoudre l&apos;avoir : {error}
        </AlertDescription>
      </Alert>
    );
  }

  if (!resolution) return null;

  if (!resolution.success) {
    return (
      <Alert variant="warning">
        <AlertDescription>
          {resolution.message ?? "Résolution partielle de l'avoir."}
          {resolution.totalAvoirItemsCount !== undefined && (
            <span className="block text-xs text-slate-500 mt-1">
              {resolution.matchedItemsCount ?? 0} / {resolution.totalAvoirItemsCount} ligne(s) appariée(s).
            </span>
          )}
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <span>Avoir</span>
          <ArrowRight className="h-4 w-4 text-slate-400" />
          <span>Facture initiale</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
          <div className="p-3 rounded-md border border-amber-200 bg-amber-50">
            <div className="text-xs text-amber-700 font-semibold uppercase tracking-wider mb-1">
              Avoir
            </div>
            <div className="font-mono text-sm">{resolution.avoir?.numero ?? numeroAvoir}</div>
            {resolution.avoir?.montant != null && (
              <div className="text-xs text-slate-600 mt-0.5 tabular-nums">
                {formatMontant(resolution.avoir.montant)} {resolution.avoir.devise ?? "XOF"}
              </div>
            )}
          </div>
          <div className="p-3 rounded-md border border-slate-200">
            <div className="text-xs text-slate-500 font-semibold uppercase tracking-wider mb-1">
              Facture initiale
            </div>
            {resolution.factureInitiale?.numero ? (
              <Link
                href={`/factures/${encodeURIComponent(resolution.factureInitiale.numero)}`}
                className="font-mono text-sm text-blue-600 hover:underline"
              >
                {resolution.factureInitiale.numero}
              </Link>
            ) : (
              <span className="text-slate-400">—</span>
            )}
            {resolution.factureInitiale?.reference && (
              <div className="text-xs text-slate-500 mt-0.5">
                Réf. FNE : {resolution.factureInitiale.reference}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between pt-2 border-t border-slate-100">
          <div className="text-xs text-slate-500">
            {resolution.refundPayload?.items?.length ?? 0} ligne(s) prêtes pour le refund FNE.
          </div>
          {sentRef ? (
            <Badge variant="success">Avoir envoyé : {sentRef}</Badge>
          ) : (
            <Button
              onClick={() => setEditorOpen(true)}
              disabled={!resolution.refundPayload}
            >
              <Pencil className="h-4 w-4" />
              <span>Éditer & envoyer l&apos;avoir</span>
            </Button>
          )}
        </div>
      </CardContent>

      {resolution.refundPayload && (
        <RefundEditorDialog
          open={editorOpen}
          onOpenChange={setEditorOpen}
          resolution={resolution}
          numeroAvoir={numeroAvoir}
          clientName={clientName}
          onSent={(ref) => setSentRef(ref ?? "envoyé")}
        />
      )}
    </Card>
  );
}
