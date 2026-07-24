"use client";

import { useEffect, useState } from "react";
import { Pencil, Plus, Power, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { invoiceTypesApi, extractError } from "@/lib/api";
import type { InvoiceTypeFull } from "@/types";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { DataTable, type DataTableColumn } from "@/components/common/DataTable";
import { InvoiceTypeDialog } from "./InvoiceTypeDialog";

export function InvoiceTypesTab() {
  const [types, setTypes] = useState<InvoiceTypeFull[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<InvoiceTypeFull | null>(null);
  const [creating, setCreating] = useState(false);

  async function reload() {
    setLoading(true);
    setError("");
    try {
      const list = await invoiceTypesApi.listInvoiceTypes(true);
      setTypes(list as InvoiceTypeFull[]);
    } catch (err) {
      setError(extractError(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void reload();
  }, []);

  async function toggleActive(t: InvoiceTypeFull) {
    try {
      const updated = await invoiceTypesApi.updateInvoiceType(t.id, { active: !t.active });
      setTypes((prev) => prev.map((x) => (x.id === t.id ? updated : x)));
      toast.success(`${t.code} ${updated.active ? "activé" : "désactivé"}`);
    } catch (err) {
      toast.error(extractError(err));
    }
  }

  async function remove(t: InvoiceTypeFull) {
    if (!window.confirm(`Supprimer le type "${t.code}" ?`)) return;
    try {
      const res = await invoiceTypesApi.deleteInvoiceType(t.id);
      if (res.softDeleted) {
        toast.warning(res.message ?? "Type désactivé (utilisé par des factures)");
        void reload();
      } else {
        setTypes((prev) => prev.filter((x) => x.id !== t.id));
        toast.success("Type supprimé");
      }
    } catch (err) {
      toast.error(extractError(err));
    }
  }

  const columns: DataTableColumn<InvoiceTypeFull>[] = [
    {
      key: "color",
      header: "",
      width: "60px",
      render: (t) => (
        <div
          className="h-8 w-8 rounded-md"
          style={{ backgroundColor: t.color_hex ?? "#1976d2" }}
        />
      ),
    },
    {
      key: "code",
      header: "Code",
      sortable: true,
      accessor: (t) => t.code,
      render: (t) => <span className="font-mono text-xs font-medium">{t.code}</span>,
    },
    {
      key: "label",
      header: "Libellé",
      sortable: true,
      accessor: (t) => t.label,
    },
    {
      key: "icon_name",
      header: "Icône",
      render: (t) =>
        t.icon_name ? (
          <span className="font-mono text-xs text-slate-600">{t.icon_name}</span>
        ) : (
          <span className="text-slate-300">—</span>
        ),
    },
    {
      key: "display_order",
      header: "Ordre",
      align: "right",
      sortable: true,
      accessor: (t) => t.display_order ?? 0,
      render: (t) => <span className="tabular-nums">{t.display_order ?? 0}</span>,
    },
    {
      key: "active",
      header: "Statut",
      align: "center",
      sortable: true,
      accessor: (t) => (t.active ? 1 : 0),
      render: (t) =>
        t.active ? (
          <Badge variant="success">Actif</Badge>
        ) : (
          <Badge variant="secondary">Inactif</Badge>
        ),
    },
    {
      key: "actions",
      header: "",
      width: "160px",
      align: "right",
      render: (t) => (
        <div className="flex justify-end gap-1">
          <Button size="sm" variant="ghost" onClick={() => toggleActive(t)} title="Activer/désactiver">
            <Power className="h-4 w-4" />
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setEditing(t)} title="Modifier">
            <Pencil className="h-4 w-4" />
          </Button>
          <Button size="sm" variant="ghost" onClick={() => remove(t)} title="Supprimer">
            <Trash2 className="h-4 w-4 text-red-600" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-700">
          {loading ? "Chargement…" : `${types.length} type(s)`}
        </h2>
        <Button onClick={() => setCreating(true)}>
          <Plus className="h-4 w-4" />
          <span>Nouveau type</span>
        </Button>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-10">
          <Spinner className="h-5 w-5" />
        </div>
      ) : (
        <DataTable
          data={types}
          columns={columns}
          rowKey={(t) => t.id}
          empty="Aucun type de facture."
        />
      )}

      <InvoiceTypeDialog
        open={creating}
        onOpenChange={setCreating}
        onSaved={() => {
          setCreating(false);
          void reload();
        }}
      />

      {editing && (
        <InvoiceTypeDialog
          open={!!editing}
          onOpenChange={(o) => !o && setEditing(null)}
          existing={editing}
          onSaved={() => {
            setEditing(null);
            void reload();
          }}
        />
      )}
    </div>
  );
}
