"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Download, RefreshCw } from "lucide-react";
import { sentApi, extractError } from "@/lib/api";
import { useListFilters } from "@/hooks/useListFilters";
import { setFactureNavigation } from "@/hooks/useFactureNavigation";
import { events } from "@/lib/events";
import { formatDate, formatMontant } from "@/lib/format";
import { exportToExcel } from "@/lib/export/excel";
import type { SentInvoiceRow } from "@/types";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable, type DataTableColumn } from "@/components/common/DataTable";
import { FilterBar } from "@/components/common/FilterBar";

function StatusBadge({ row }: { row: SentInvoiceRow }) {
  if (row.status === "failed")
    return <Badge variant="destructive">Échec</Badge>;
  if (row.invoice_type === "refund" || row.is_cancellation)
    return <Badge variant="warning">Avoir</Badge>;
  if (row.is_orphan) return <Badge variant="warning">Orpheline</Badge>;
  if (row.is_manual) return <Badge variant="secondary">Manuelle</Badge>;
  return <Badge variant="success">Envoyée</Badge>;
}

export function SentList() {
  const router = useRouter();
  const { search, setSearch, startDate, setStartDate, endDate, setEndDate, filters, reset } =
    useListFilters();

  const [rows, setRows] = useState<SentInvoiceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setError("");
    (async () => {
      try {
        const res = await sentApi.listSent(filters);
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
  }, [filters, reloadToken]);

  useEffect(() => {
    const off = events.on("invoice:sent", () => setReloadToken((t) => t + 1));
    const off2 = events.on("invoice:refunded", () => setReloadToken((t) => t + 1));
    return () => {
      off();
      off2();
    };
  }, []);

  const columns: DataTableColumn<SentInvoiceRow>[] = [
    {
      key: "numero_facture",
      header: "Numéro",
      sortable: true,
      accessor: (r) => r.numero_facture,
      render: (r) => <span className="font-mono text-xs font-medium">{r.numero_facture}</span>,
    },
    {
      key: "reference",
      header: "Référence FNE",
      sortable: true,
      accessor: (r) => r.reference ?? "",
      render: (r) =>
        r.reference ? (
          <span className="font-mono text-xs">{r.reference}</span>
        ) : (
          <span className="text-slate-300">—</span>
        ),
    },
    {
      key: "client_name",
      header: "Client",
      sortable: true,
      accessor: (r) => r.client_name,
      render: (r) => <span className="line-clamp-2 max-w-[240px]">{r.client_name}</span>,
    },
    {
      key: "send_date",
      header: "Date d'envoi",
      sortable: true,
      accessor: (r) => r.send_date,
      render: (r) => formatDate(r.send_date),
    },
    {
      key: "sent_by",
      header: "Envoyée par",
      sortable: true,
      accessor: (r) => r.sent_by,
      render: (r) => <span className="text-slate-700">{r.sent_by}</span>,
    },
    {
      key: "total_ttc",
      header: "Total TTC",
      align: "right",
      sortable: true,
      accessor: (r) => r.total_ttc ?? 0,
      render: (r) => (
        <span className="tabular-nums font-medium">{formatMontant(r.total_ttc ?? 0)}</span>
      ),
    },
    {
      key: "point_of_sale",
      header: "PDV",
      sortable: true,
      accessor: (r) => r.point_of_sale ?? "",
      render: (r) => (
        <Badge variant="secondary" className="font-mono text-[10px]">
          {r.point_of_sale ?? "—"}
        </Badge>
      ),
    },
    {
      key: "status",
      header: "Statut",
      align: "center",
      sortable: true,
      accessor: (r) => r.status,
      render: (r) => <StatusBadge row={r} />,
    },
  ];

  return (
    <div className="space-y-4">
      <header className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Factures Envoyées</h1>
          <p className="text-slate-500 text-sm mt-1">
            Historique des factures transmises à la DGI via FNE.
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
                { key: "numero_facture", header: "Numéro", accessor: (r) => r.numero_facture },
                { key: "reference", header: "Référence FNE", accessor: (r) => r.reference ?? "" },
                { key: "client_name", header: "Client", accessor: (r) => r.client_name },
                { key: "send_date", header: "Date d'envoi", accessor: (r) => formatDate(r.send_date) },
                { key: "sent_by", header: "Envoyée par", accessor: (r) => r.sent_by },
                { key: "total_ttc", header: "Total TTC", accessor: (r) => r.total_ttc ?? 0 },
                { key: "point_of_sale", header: "PDV", accessor: (r) => r.point_of_sale ?? "" },
                { key: "status", header: "Statut", accessor: (r) => r.status },
                { key: "invoice_type", header: "Type", accessor: (r) => r.invoice_type },
              ],
              `factures_envoyees_${new Date().toISOString().slice(0, 10)}`,
            )
          }
          disabled={rows.length === 0}
        >
          <Download className="h-4 w-4" />
          <span>Excel</span>
        </Button>
        </div>
      </header>

      <FilterBar
        search={search}
        onSearchChange={setSearch}
        startDate={startDate}
        onStartDateChange={setStartDate}
        endDate={endDate}
        onEndDateChange={setEndDate}
        onReset={reset}
        searchPlaceholder="Numéro, référence FNE, client..."
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
        onRowClick={(r) => {
          setFactureNavigation({
            numeros: rows.map((row) => row.numero_facture),
            source: "envoyees",
          });
          router.push(`/factures/${encodeURIComponent(r.numero_facture)}`);
        }}
        empty="Aucune facture envoyée pour ces critères."
      />
    </div>
  );
}
