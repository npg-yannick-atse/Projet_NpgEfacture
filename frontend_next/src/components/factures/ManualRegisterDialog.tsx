"use client";

import { useEffect, useState } from "react";
import { Save } from "lucide-react";
import { toast } from "sonner";
import { api, ENDPOINTS, extractError } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { events } from "@/lib/events";
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
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoiceNumber: string;
  onSaved?: (reference: string) => void;
}

export function ManualRegisterDialog({
  open,
  onOpenChange,
  invoiceNumber,
  onSaved,
}: Props) {
  const { user } = useAuth();
  const [reference, setReference] = useState("");
  const [fneId, setFneId] = useState("");
  const [ncc, setNcc] = useState("");
  const [token, setToken] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (open) {
      setReference("");
      setFneId("");
      setNcc("");
      setToken("");
      setReason("");
      setError("");
    }
  }, [open]);

  async function handleSubmit() {
    if (!reference.trim() || !fneId.trim()) {
      setError("Référence FNE et identifiant FNE requis.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const { data } = await api.post(ENDPOINTS.FNE_INVOICES.MANUAL_REGISTER, {
        numero_facture: invoiceNumber,
        fne_reference: reference.trim(),
        fne_invoice_id: fneId.trim(),
        fne_ncc: ncc.trim() || null,
        token: token.trim() || null,
        reason: reason.trim() || null,
        username: user?.username,
      });
      if (data?.success) {
        toast.success(`Facture ${invoiceNumber} enregistrée manuellement`);
        events.emit("invoice:sent", { numero: invoiceNumber, reference });
        onSaved?.(reference);
        onOpenChange(false);
      } else {
        setError(data?.message ?? data?.error ?? "Échec de l'enregistrement");
      }
    } catch (err) {
      setError(extractError(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={submitting ? () => undefined : onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Saisie manuelle FNE</DialogTitle>
          <DialogDescription>
            Rattraper un envoi loupé : saisissez la référence FNE déjà obtenue côté
            DGI pour la facture <span className="font-mono">{invoiceNumber}</span>.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5 sm:col-span-1">
            <Label htmlFor="ref">Référence FNE *</Label>
            <Input
              id="ref"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="9904279V25000000075"
              className="font-mono"
              autoFocus
            />
          </div>
          <div className="space-y-1.5 sm:col-span-1">
            <Label htmlFor="fneId">Identifiant FNE *</Label>
            <Input
              id="fneId"
              value={fneId}
              onChange={(e) => setFneId(e.target.value)}
              placeholder="FNE-2026-..."
              className="font-mono"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ncc">NCC client</Label>
            <Input
              id="ncc"
              value={ncc}
              onChange={(e) => setNcc(e.target.value)}
              placeholder="9904279V"
              className="font-mono"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="token">Token / URL DGI</Label>
            <Input
              id="token"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="https://...verification/..."
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="reason">Raison (audit)</Label>
            <Input
              id="reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Ex : envoi initial perdu suite à coupure réseau..."
            />
          </div>
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
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? <Spinner /> : <Save className="h-4 w-4" />}
            <span>Enregistrer</span>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
