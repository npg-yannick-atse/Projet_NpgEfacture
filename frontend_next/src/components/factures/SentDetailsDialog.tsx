"use client";

import { useState } from "react";
import { CheckCircle2, Copy, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import type { SendInvoiceResult } from "@/types";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  result: SendInvoiceResult | null;
  invoiceNumber: string;
}

export function SentDetailsDialog({ open, onOpenChange, result, invoiceNumber }: Props) {
  const [copied, setCopied] = useState<string | null>(null);

  if (!result) return null;
  const r: NonNullable<SendInvoiceResult["response"]> = result.response ?? {
    success: false,
  };

  function copy(value: string, label: string) {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      void navigator.clipboard.writeText(value);
      setCopied(label);
      toast.success(`${label} copié`);
      setTimeout(() => setCopied(null), 1500);
    }
  }

  // Build a QR-code URL via a free public service. Fallback only — no PII issued
  // beyond the FNE token (which is meant to be public for verification).
  const qrUrl = r.token
    ? `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(r.token)}`
    : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-emerald-600" />
            Facture envoyée
          </DialogTitle>
          <DialogDescription>
            Détails de la certification FNE pour la facture{" "}
            <span className="font-mono">{invoiceNumber}</span>.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <Field
            label="Référence FNE"
            value={r.reference ?? "—"}
            mono
            onCopy={r.reference ? () => copy(r.reference!, "Référence") : undefined}
            copied={copied === "Référence"}
          />
          <Field
            label="NCC"
            value={r.ncc ?? "—"}
            mono
            onCopy={r.ncc ? () => copy(r.ncc!, "NCC") : undefined}
            copied={copied === "NCC"}
          />
          {r.token && (
            <Field
              label="Lien de vérification DGI"
              value={r.token}
              link
              onCopy={() => copy(r.token!, "Lien")}
              copied={copied === "Lien"}
            />
          )}
        </div>

        {qrUrl && (
          <div className="flex flex-col items-center gap-2 pt-2">
            <span className="text-xs text-slate-500 uppercase tracking-wider">
              QR code de vérification
            </span>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={qrUrl}
              alt="QR code FNE"
              width={200}
              height={200}
              className="rounded border border-slate-200 bg-white p-2"
            />
          </div>
        )}

        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>Fermer</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  value,
  mono,
  link,
  onCopy,
  copied,
}: {
  label: string;
  value: string;
  mono?: boolean;
  link?: boolean;
  onCopy?: () => void;
  copied?: boolean;
}) {
  return (
    <div className="rounded-md border border-slate-200 p-3">
      <div className="text-xs text-slate-500 mb-1">{label}</div>
      <div className="flex items-center justify-between gap-2">
        {link ? (
          <a
            href={value}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 hover:underline text-sm break-all"
          >
            {value}
            <ExternalLink className="h-3 w-3 inline ml-1" />
          </a>
        ) : (
          <span className={mono ? "font-mono text-sm" : "text-sm"}>{value}</span>
        )}
        {onCopy && (
          <Button size="sm" variant="ghost" onClick={onCopy}>
            {copied ? (
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
          </Button>
        )}
      </div>
    </div>
  );
}
