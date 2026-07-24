"use client";

import { useEffect, useState } from "react";
import { Save } from "lucide-react";
import { toast } from "sonner";
import { inlineFieldsApi, extractError } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import type { InlineFieldName } from "@/lib/api/inline-fields";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Props {
  invoiceNumber: string;
  initialValues?: Partial<Record<InlineFieldName, string>>;
  onChange?: (values: Partial<Record<InlineFieldName, string>>) => void;
  /** If provided, allows scoping a save to a single line. */
  lineNumber?: number | null;
}

const TEMPLATE_OPTIONS = ["B2B", "B2C", "B2F", "B2G"];
const PAYMENT_OPTIONS = ["cash", "check", "transfer", "credit-card", "mobile-money"];

export function InlineFieldsPanel({ invoiceNumber, initialValues, onChange, lineNumber }: Props) {
  const { user } = useAuth();
  const [values, setValues] = useState<Partial<Record<InlineFieldName, string>>>({});
  const [originals, setOriginals] = useState<Partial<Record<InlineFieldName, string>>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<InlineFieldName | null>(null);
  const [error, setError] = useState("");
  const [applyToAll, setApplyToAll] = useState<boolean>(true);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    inlineFieldsApi
      .getModifications(invoiceNumber)
      .then((mods) => {
        if (!mounted) return;
        const latest = inlineFieldsApi.pickLatest(mods);
        const merged = { ...(initialValues ?? {}), ...latest };
        setValues(merged);
        setOriginals(merged);
        onChange?.(merged);
      })
      .catch((err) => mounted && setError(extractError(err)))
      .finally(() => mounted && setLoading(false));
    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoiceNumber]);

  function setField(field: InlineFieldName, value: string) {
    setValues((prev) => ({ ...prev, [field]: value }));
  }

  async function persist(field: InlineFieldName) {
    if (!user?.id_user) {
      toast.error("Utilisateur non identifié.");
      return;
    }
    const newValue = values[field] ?? "";
    const oldValue = originals[field] ?? null;
    if (newValue === oldValue) return;
    setSaving(field);
    try {
      await inlineFieldsApi.updateField({
        invoiceNumber,
        fieldName: field,
        newValue,
        oldValue,
        userId: user.id_user,
        userName: user.username ?? undefined,
        applyToAll,
        lineNumber: applyToAll ? null : lineNumber ?? null,
      });
      const next = { ...originals, [field]: newValue };
      setOriginals(next);
      onChange?.(next);
      toast.success(`${field} mis à jour`);
    } catch (err) {
      toast.error(extractError(err));
    } finally {
      setSaving(null);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <Spinner /> Chargement des champs modifiables…
      </div>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">Champs modifiables</CardTitle>
        {lineNumber != null && (
          <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer">
            <input
              type="checkbox"
              checked={applyToAll}
              onChange={(e) => setApplyToAll(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300"
            />
            Appliquer à toutes les lignes
          </label>
        )}
      </CardHeader>
      <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {error && (
          <Alert variant="destructive" className="sm:col-span-2">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <EditableInput
          label="Email client"
          field="ClientEmail"
          value={values.ClientEmail ?? ""}
          original={originals.ClientEmail ?? ""}
          saving={saving === "ClientEmail"}
          onChange={(v) => setField("ClientEmail", v)}
          onSave={() => persist("ClientEmail")}
          type="email"
        />

        <EditableInput
          label="Téléphone client"
          field="ClientPhone"
          value={values.ClientPhone ?? ""}
          original={originals.ClientPhone ?? ""}
          saving={saving === "ClientPhone"}
          onChange={(v) => setField("ClientPhone", v)}
          onSave={() => persist("ClientPhone")}
        />

        <EditableSelect
          label="Modèle (Template)"
          field="Template"
          value={values.Template ?? "B2B"}
          original={originals.Template ?? "B2B"}
          options={TEMPLATE_OPTIONS}
          saving={saving === "Template"}
          onChange={(v) => setField("Template", v)}
          onSave={() => persist("Template")}
        />

        <EditableSelect
          label="Mode de paiement"
          field="PaymentMethod"
          value={values.PaymentMethod ?? "check"}
          original={originals.PaymentMethod ?? "check"}
          options={PAYMENT_OPTIONS}
          saving={saving === "PaymentMethod"}
          onChange={(v) => setField("PaymentMethod", v)}
          onSave={() => persist("PaymentMethod")}
        />

        <EditableInput
          label="Point de vente"
          field="PointOfSale"
          value={values.PointOfSale ?? ""}
          original={originals.PointOfSale ?? ""}
          saving={saving === "PointOfSale"}
          onChange={(v) => setField("PointOfSale", v)}
          onSave={() => persist("PointOfSale")}
          className="sm:col-span-2"
        />
      </CardContent>
    </Card>
  );
}

function EditableInput({
  label,
  field,
  value,
  original,
  saving,
  onChange,
  onSave,
  type,
  className,
}: {
  label: string;
  field: string;
  value: string;
  original: string;
  saving: boolean;
  onChange: (v: string) => void;
  onSave: () => void;
  type?: string;
  className?: string;
}) {
  const dirty = value !== original;
  return (
    <div className={["space-y-1.5", className].filter(Boolean).join(" ")}>
      <Label htmlFor={field}>{label}</Label>
      <div className="flex gap-2">
        <Input
          id={field}
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={dirty ? "border-amber-400 bg-amber-50/30" : ""}
        />
        <Button
          size="sm"
          variant={dirty ? "default" : "ghost"}
          disabled={!dirty || saving}
          onClick={onSave}
        >
          {saving ? <Spinner /> : <Save className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  );
}

function EditableSelect({
  label,
  field,
  value,
  original,
  options,
  saving,
  onChange,
  onSave,
}: {
  label: string;
  field: string;
  value: string;
  original: string;
  options: string[];
  saving: boolean;
  onChange: (v: string) => void;
  onSave: () => void;
}) {
  const dirty = value !== original;
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <div className="flex gap-2">
        <Select value={value} onValueChange={onChange}>
          <SelectTrigger className={dirty ? "border-amber-400 bg-amber-50/30" : ""}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {options.map((o) => (
              <SelectItem key={o} value={o}>
                {o}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          size="sm"
          variant={dirty ? "default" : "ghost"}
          disabled={!dirty || saving}
          onClick={onSave}
        >
          {saving ? <Spinner /> : <Save className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  );
}
