"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Send, ShieldAlert, Triangle } from "lucide-react";
import { toast } from "sonner";
import { sapApi, extractError } from "@/lib/api";
import { buildFnePayload, validateFnePayload } from "@/lib/fne/build-payload";
import { events } from "@/lib/events";
import { formatMontant } from "@/lib/format";
import type {
  FactureData,
  FneInvoicePayload,
  FnePaymentMethod,
  FneTemplate,
  SendInvoiceResult,
} from "@/types";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoiceNumber: string;
  facture: FactureData;
  onSuccess?: (result: SendInvoiceResult) => void;
}

const TEMPLATES: { value: FneTemplate; label: string }[] = [
  { value: "B2B", label: "B2B (entreprise — NCC requis)" },
  { value: "B2C", label: "B2C (particulier)" },
  { value: "B2F", label: "B2F (export/étranger)" },
  { value: "B2G", label: "B2G (administration)" },
];

const PAYMENT_METHODS: { value: FnePaymentMethod; label: string }[] = [
  { value: "cash", label: "Espèces" },
  { value: "check", label: "Chèque" },
  { value: "transfer", label: "Virement" },
  { value: "credit-card", label: "Carte bancaire" },
  { value: "mobile-money", label: "Mobile Money" },
];

export function SendFneDialog({ open, onOpenChange, invoiceNumber, facture, onSuccess }: Props) {
  const initialPayload = useMemo(() => buildFnePayload(facture), [facture]);

  const [payload, setPayload] = useState<FneInvoicePayload>(initialPayload);
  const [submitting, setSubmitting] = useState(false);
  const [checking, setChecking] = useState(false);
  const [alreadySent, setAlreadySent] = useState<{
    sentBy?: string;
    sentOn?: string;
  } | null>(null);
  const [error, setError] = useState("");

  // Reset on (re)open / invoice change
  useEffect(() => {
    if (open) {
      setPayload(initialPayload);
      setError("");
      setAlreadySent(null);
      checkSent();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, invoiceNumber]);

  async function checkSent() {
    setChecking(true);
    try {
      const res = await sapApi.checkAlreadySent(invoiceNumber);
      if (res.alreadySent) {
        setAlreadySent({ sentBy: res.sentBy, sentOn: res.sentOn });
      }
    } catch {
      // Silently ignore — backend may return 404 if never sent
    } finally {
      setChecking(false);
    }
  }

  function update<K extends keyof FneInvoicePayload>(key: K, value: FneInvoicePayload[K]) {
    setPayload((p) => ({ ...p, [key]: value }));
  }

  const validation = useMemo(() => validateFnePayload(payload), [payload]);
  const totalHT = useMemo(
    () => payload.items.reduce((sum, it) => sum + it.amount * it.quantity, 0),
    [payload.items],
  );

  async function handleSubmit() {
    setError("");
    if (!validation.ok) {
      setError(`Champs requis manquants : ${validation.missing.join(", ")}`);
      return;
    }
    setSubmitting(true);
    try {
      const result = await sapApi.sendInvoiceByNumber(invoiceNumber, payload);
      if (result.success) {
        toast.success(`Facture ${invoiceNumber} envoyée avec succès`, {
          description: result.response?.reference
            ? `Réf. FNE : ${result.response.reference}`
            : undefined,
        });
        events.emit("invoice:sent", {
          numero: invoiceNumber,
          reference: result.response?.reference,
        });
        // Fire-and-forget — non-critical
        void sapApi.triggerNotification({
          invoiceNumber,
          event: "invoice_sent",
          data: { reference: result.response?.reference ?? null },
        });
        onSuccess?.(result);
        onOpenChange(false);
      } else {
        setError(result.message ?? result.error ?? "Échec de l'envoi.");
      }
    } catch (err) {
      setError(extractError(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Envoyer la facture à FNE</DialogTitle>
          <DialogDescription>
            Vérifiez les informations puis confirmez. La facture sera transmise à la DGI.
          </DialogDescription>
        </DialogHeader>

        {checking && (
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <Spinner /> Vérification anti-doublon...
          </div>
        )}

        {alreadySent && (
          <Alert variant="warning">
            <ShieldAlert className="h-4 w-4" />
            <AlertDescription>
              Cette facture a déjà été envoyée
              {alreadySent.sentOn && ` le ${new Date(alreadySent.sentOn).toLocaleString("fr-FR")}`}
              {alreadySent.sentBy && ` par ${alreadySent.sentBy}`}.
            </AlertDescription>
          </Alert>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Facture">
            <Input
              value={invoiceNumber}
              readOnly
              className="font-mono text-xs bg-slate-50"
            />
          </Field>

          <Field label="Établissement">
            <Input
              value={payload.establishment}
              readOnly
              className="bg-slate-50"
            />
          </Field>

          <Field label="Modèle de facture">
            <Select value={payload.template} onValueChange={(v) => update("template", v as FneTemplate)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TEMPLATES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field label="Mode de paiement">
            <Select
              value={payload.paymentMethod}
              onValueChange={(v) => update("paymentMethod", v as FnePaymentMethod)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAYMENT_METHODS.map((p) => (
                  <SelectItem key={p.value} value={p.value}>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field label="Nom client">
            <Input
              value={payload.clientCompanyName}
              onChange={(e) => update("clientCompanyName", e.target.value)}
            />
          </Field>

          <Field
            label="NCC client"
            hint={payload.template === "B2B" ? "Obligatoire pour B2B" : undefined}
          >
            <Input
              value={payload.clientNcc}
              onChange={(e) => update("clientNcc", e.target.value)}
              placeholder="9904279V"
            />
          </Field>

          <Field label="Email client">
            <Input
              type="email"
              value={payload.clientEmail}
              onChange={(e) => update("clientEmail", e.target.value)}
            />
          </Field>

          <Field label="Téléphone client">
            <Input
              value={payload.clientPhone}
              onChange={(e) => update("clientPhone", e.target.value)}
            />
          </Field>

          <Field label="Point de vente">
            <Input
              value={payload.pointOfSale}
              onChange={(e) => update("pointOfSale", e.target.value)}
            />
          </Field>

          <Field label="Vendeur (optionnel)">
            <Input
              value={payload.clientSellerName}
              onChange={(e) => update("clientSellerName", e.target.value)}
            />
          </Field>

          <Field label="Message commercial (optionnel)" className="sm:col-span-2">
            <Input
              value={payload.commercialMessage}
              onChange={(e) => update("commercialMessage", e.target.value)}
              placeholder="Ex : Merci de votre achat"
            />
          </Field>
        </div>

        <div className="flex items-center justify-between text-sm border-t border-slate-200 pt-3">
          <div className="flex items-center gap-3">
            <Badge variant="outline">{payload.items.length} ligne(s)</Badge>
            <span className="text-slate-600">Total HT estimé :</span>
            <span className="font-semibold tabular-nums text-slate-900">
              {formatMontant(totalHT)}
            </span>
          </div>
        </div>

        {!validation.ok && (
          <Alert variant="warning">
            <Triangle className="h-4 w-4" />
            <AlertDescription>
              Champs requis : {validation.missing.join(", ")}
            </AlertDescription>
          </Alert>
        )}

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Annuler
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={submitting || !validation.ok || !!alreadySent}
          >
            {submitting ? (
              <Spinner className="h-4 w-4" />
            ) : alreadySent ? (
              <CheckCircle2 className="h-4 w-4" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            <span>{alreadySent ? "Déjà envoyée" : "Envoyer à FNE"}</span>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  hint,
  children,
  className,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={["space-y-1.5", className].filter(Boolean).join(" ")}>
      <Label>{label}</Label>
      {children}
      {hint && <p className="text-xs text-slate-500">{hint}</p>}
    </div>
  );
}
