"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CheckCircle2, Circle, Download, RefreshCw, Send, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { downloadedApi, extractError } from "@/lib/api";
import { useListFilters } from "@/hooks/useListFilters";
import { setFactureNavigation } from "@/hooks/useFactureNavigation";
import { events } from "@/lib/events";
import { formatDate, formatMontant } from "@/lib/format";
import { exportToExcel } from "@/lib/export/excel";
import type { DownloadedInvoiceRow } from "@/types";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { DataTable, type DataTableColumn } from "@/components/common/DataTable";
import { FilterBar } from "@/components/common/FilterBar";
import { BulkSendDialog } from "./BulkSendDialog";

export function DownloadedList() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const typeFromUrl = searchParams.get("type") ?? "";

  const { search, setSearch, startDate, setStartDate, endDate, setEndDate, filters, reset } =
    useListFilters({ pointOfSale: typeFromUrl });

  const [rows, setRows] = useState<DownloadedInvoiceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<Array<string | number>>([]);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);
  const [bulkSendOpen, setBulkSendOpen] = useState(false);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setError("");
    (async () => {
      try {
        const res = await downloadedApi.listDownloaded({
          ...filters,
          pointOfSale: typeFromUrl || filters.pointOfSale,
        });
        if (!mounted) return;
        setRows(res.data ?? []);
      } catch (err) {
        if (mounted) setError(extractError(err));
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [filters, typeFromUrl, reloadToken]);

  useEffect(() => {
    const off = events.on("invoice:downloaded", () => setReloadToken((t) => t + 1));
    const off2 = events.on("invoice:sent", () => setReloadToken((t) => t + 1));
    return () => {
      off();
      off2();
    };
  }, []);

  async function handleToggleVerified(row: DownloadedInvoiceRow) {
    try {
      const res = await downloadedApi.toggleVerified(row.id);
      setRows((prev) =>
        prev.map((r) => (r.id === row.id ? { ...r, verified: res.verified } : r)),
      );
      toast.success(`${row.numero} ${res.verified ? "marquée vérifiée" : "marquée non vérifiée"}`);
    } catch (err) {
      toast.error(extractError(err));
    }
  }

  async function handleBulkDelete() {
    if (selected.length === 0) return;
    if (!window.confirm(`Supprimer ${selected.length} facture(s) téléchargée(s) ?`)) return;
    setBulkBusy(true);
    try {
      await downloadedApi.bulkDeleteDownloaded(selected);
      setRows((prev) => prev.filter((r) => !selected.includes(r.id)));
      setSelected([]);
    } catch (err) {
      setError(extractError(err));
    } finally {
      setBulkBusy(false);
    }
  }

  const columns: DataTableColumn<DownloadedInvoiceRow>[] = [
    {
      key: "numero",
      header: "Numéro",
      sortable: true,
      accessor: (r) => r.numero,
      render: (r) => <span className="font-mono text-xs font-medium">{r.numero}</span>,
    },
    {
      key: "client",
      header: "Client",
      sortable: true,
      accessor: (r) => r.client,
      render: (r) => (
        <span className="line-clamp-2 max-w-[260px]">
          {r.computedDetails?.nomClient || r.client || "—"}
        </span>
      ),
    },
    {
      key: "date",
      header: "Date facture",
      sortable: true,
      accessor: (r) => r.date,
      render: (r) => formatDate(r.date),
    },
    {
      key: "download_date",
      header: "Téléchargée le",
      sortable: true,
      accessor: (r) => r.download_date,
      render: (r) => formatDate(r.download_date),
    },
    {
      key: "totalTTC",
      header: "Total TTC",
      align: "right",
      sortable: true,
      accessor: (r) => r.computedDetails?.totalTTC ?? 0,
      render: (r) => (
        <span className="tabular-nums font-medium">
          {formatMontant(r.computedDetails?.totalTTC ?? 0)}
        </span>
      ),
    },
    {
      key: "pointOfSale",
      header: "Point de vente",
      sortable: true,
      accessor: (r) => r.computedDetails?.pointOfSale ?? r.invoice_type_code ?? "",
      render: (r) => (
        <Badge variant="secondary" className="font-mono text-[10px]">
          {r.computedDetails?.pointOfSale ?? r.invoice_type_code ?? "—"}
        </Badge>
      ),
    },
    {
      key: "verified",
      header: "Vérifiée",
      align: "center",
      sortable: true,
      accessor: (r) => (r.verified ? 1 : 0),
      render: (r) => (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            void handleToggleVerified(r);
          }}
          title={r.verified ? "Marquer comme non vérifiée" : "Marquer comme vérifiée"}
          className="inline-flex items-center justify-center rounded p-1 hover:bg-slate-100"
        >
          {r.verified ? (
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          ) : (
            <Circle className="h-4 w-4 text-slate-300" />
          )}
        </button>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Factures Téléchargées</h1>
          <p className="text-slate-500 text-sm mt-1">
            {typeFromUrl ? `Filtrées sur le type ` : "Liste des factures téléchargées non encore envoyées."}
            {typeFromUrl && (
              <Badge variant="outline" className="font-mono ml-1">
                {typeFromUrl}
              </Badge>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => setReloadToken((t) => t + 1)}
            title="Rafraîchir"
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            onClick={() =>
              exportToExcel(
                rows,
                [
                  { key: "numero", header: "Numéro", accessor: (r) => r.numero },
                  { key: "client", header: "Client", accessor: (r) => r.computedDetails?.nomClient ?? r.client },
                  { key: "date", header: "Date facture", accessor: (r) => formatDate(r.date) },
                  { key: "download_date", header: "Téléchargée le", accessor: (r) => formatDate(r.download_date) },
                  { key: "totalTTC", header: "Total TTC", accessor: (r) => r.computedDetails?.totalTTC ?? 0 },
                  { key: "pos", header: "Point de vente", accessor: (r) => r.computedDetails?.pointOfSale ?? r.invoice_type_code ?? "" },
                  { key: "verified", header: "Vérifiée", accessor: (r) => (r.verified ? "Oui" : "Non") },
                ],
                `factures_telechargees_${new Date().toISOString().slice(0, 10)}`,
              )
            }
            disabled={rows.length === 0}
          >
            <Download className="h-4 w-4" />
            <span>Excel</span>
          </Button>
          {selected.length > 0 && (
            <>
              <Button onClick={() => setBulkSendOpen(true)}>
                <Send className="h-4 w-4" />
                <span>Envoyer FNE ({selected.length})</span>
              </Button>
              <Button variant="destructive" onClick={handleBulkDelete} disabled={bulkBusy}>
                {bulkBusy ? <Spinner className="h-4 w-4" /> : <Trash2 className="h-4 w-4" />}
                <span>Supprimer ({selected.length})</span>
              </Button>
            </>
          )}
        </div>
      </header>

      <FilterBar
        search={search}
        onSearchChange={setSearch}
        startDate={startDate}
        onStartDateChange={setStartDate}
        endDate={endDate}
        onEndDateChange={setEndDate}
        onReset={() => {
          reset();
          if (typeFromUrl) router.replace("/telechargees");
        }}
      />

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <DataTable
        data={rows}
        columns={columns}
        rowKey={(r) => r.id}
        loading={loading}
        selectable
        onSelectionChange={setSelected}
        onRowClick={(r) => {
          setFactureNavigation({
            numeros: rows.map((row) => row.numero),
            source: "telechargees",
          });
          router.push(`/factures/${encodeURIComponent(r.numero)}`);
        }}
        empty="Aucune facture téléchargée pour ces critères."
      />

      <BulkSendDialog
        open={bulkSendOpen}
        onOpenChange={(o) => {
          setBulkSendOpen(o);
          if (!o) setReloadToken((t) => t + 1);
        }}
        rows={rows.filter((r) => selected.includes(r.id))}
      />
    </div>
  );
}
