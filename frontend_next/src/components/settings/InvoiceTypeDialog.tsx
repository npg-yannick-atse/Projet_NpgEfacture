"use client";

import { useEffect, useState } from "react";
import { Save } from "lucide-react";
import { toast } from "sonner";
import { invoiceTypesApi, extractError } from "@/lib/api";
import type { InvoiceTypeFull } from "@/types";
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
  existing?: InvoiceTypeFull;
  onSaved: () => void;
}

export function InvoiceTypeDialog({ open, onOpenChange, existing, onSaved }: Props) {
  const isEdit = !!existing;
  const [code, setCode] = useState("");
  const [label, setLabel] = useState("");
  const [iconName, setIconName] = useState("");
  const [colorHex, setColorHex] = useState("#1976d2");
  const [displayOrder, setDisplayOrder] = useState<number>(100);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setCode(existing?.code ?? "");
      setLabel(existing?.label ?? "");
      setIconName(existing?.icon_name ?? "");
      setColorHex(existing?.color_hex ?? "#1976d2");
      setDisplayOrder(existing?.display_order ?? 100);
      setError("");
    }
  }, [open, existing]);

  async function save() {
    if (!code.trim() || !label.trim()) {
      setError("Code et libellé requis.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      if (isEdit) {
        await invoiceTypesApi.updateInvoiceType(existing.id, {
          label,
          icon_name: iconName || null,
          color_hex: colorHex,
          display_order: displayOrder,
        });
        toast.success(`${code} mis à jour`);
      } else {
        await invoiceTypesApi.createInvoiceType({
          code,
          label,
          icon_name: iconName || null,
          color_hex: colorHex,
          display_order: displayOrder,
          active: true,
        });
        toast.success(`${code} créé`);
      }
      onSaved();
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
          <DialogTitle>
            {isEdit ? `Modifier ${existing.code}` : "Nouveau type de facture"}
          </DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Modifiez le libellé, l'icône, la couleur et l'ordre d'affichage."
              : "Le code est immutable. Choisissez-le avec soin."}
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="code">Code</Label>
            <Input
              id="code"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase().replace(/\s/g, "_"))}
              disabled={isEdit}
              placeholder="NPG_SIEGE_FACTURATION"
              className="font-mono"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="label">Libellé</Label>
            <Input
              id="label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Siège facturation"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="icon_name">Icône (lucide)</Label>
            <Input
              id="icon_name"
              value={iconName}
              onChange={(e) => setIconName(e.target.value)}
              placeholder="Receipt"
              className="font-mono"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="color_hex">Couleur</Label>
            <div className="flex gap-2">
              <Input
                id="color_hex"
                type="color"
                value={colorHex}
                onChange={(e) => setColorHex(e.target.value)}
                className="w-14 p-1 h-10"
              />
              <Input
                value={colorHex}
                onChange={(e) => setColorHex(e.target.value)}
                className="font-mono"
              />
            </div>
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="display_order">Ordre d&apos;affichage</Label>
            <Input
              id="display_order"
              type="number"
              value={displayOrder}
              onChange={(e) => setDisplayOrder(Number(e.target.value))}
              className="w-32"
            />
          </div>
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Annuler
          </Button>
          <Button onClick={save} disabled={submitting}>
            {submitting ? <Spinner /> : <Save className="h-4 w-4" />}
            <span>Enregistrer</span>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
