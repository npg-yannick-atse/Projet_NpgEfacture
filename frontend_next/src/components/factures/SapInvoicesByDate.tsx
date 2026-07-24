"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarRange, Download, Search } from "lucide-react";
import { sapApi, extractError } from "@/lib/api";
import { setFactureNavigation } from "@/hooks/useFactureNavigation";
import { BulkDownloadDialog } from "./BulkDownloadDialog";
import { formatDate, formatMontant } from "@/lib/format";
import type { SapInvoiceListItem } from "@/lib/api/sap";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { DataTable, type DataTableColumn } from "@/components/common/DataTable";

function defaultRange(): { start: string; end: string } {
  const now = new Date();
  const start = new Date(now);
  start.setDate(start.getDate() - 7);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return { start: fmt(start), end: fmt(now) };
}

export function SapInvoicesByDate() {
  const router = useRouter();
  const initial = defaultRange();
  const [startDate, setStartDate] = useState(initial.start);
  const [endDate, setEndDate] = useState(initial.end);
  const [rows, setRows] = useState<SapInvoiceListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [searched, setSearched] = useState(false);
  const [selected, setSelected] = useState<Array<string | number>>([]);
  const [bulkOpen, setBulkOpen] = useState(false);

  async function search() {
    if (!startDate || !endDate) {
      setError("Veuillez choisir une période.");
      return;
    }
    setLoading(true);
    setError("");
    setSearched(true);
    try {
      const res = await sapApi.getInvoicesByDate({ startDate, endDate });
      if (!res.success) {
        setError("Aucun résultat ou erreur SAP.");
        setRows([]);
      } else {
        setRows(res.data ?? []);
      }
    } catch (err) {
      setError(extractError(err));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  const columns: DataTableColumn<SapInvoiceListItem>[] = [
    {
      key: "numero",
      header: "Numéro",
      sortable: true,
      accessor: (r) => r.numero,
      render: (r) => <span className="font-mono text-xs font-medium">{r.numero}</span>,
    },
    {
      key: "date",
      header: "Date",
      sortable: true,
      accessor: (r) => r.date,
      render: (r) => formatDate(r.date),
    },
    {
      key: "type",
      header: "Type",
      sortable: true,
      accessor: (r) => r.type,
      render: (r) => (
        <Badge variant="outline" className="font-mono text-[10px]">
          {r.type || "—"}
        </Badge>
      ),
    },
    {
      key: "client",
      header: "Client",
      sortable: true,
      accessor: (r) => r.nomClient ?? r.client,
      render: (r) => (
        <span className="line-clamp-2 max-w-[280px]">
          {r.nomClient || r.client || "—"}
        </span>
      ),
    },
    {
      key: "montant",
      header: "Montant",
      align: "right",
      sortable: true,
      accessor: (r) => Number(r.montant) || 0,
      render: (r) => (
        <span className="tabular-nums font-medium">
          {formatMontant(Number(r.montant) || 0)} {r.devise}
        </span>
      ),
    },
  ];

  return (
    <section className="space-y-3">
      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
          <CalendarRange className="h-4 w-4" />
          Recherche par période (SAP)
        </h2>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <Label htmlFor="start-date" className="text-xs">Du</Label>
            <Input
              id="start-date"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-[160px]"
            />
          </div>
          <div>
            <Label htmlFor="end-date" className="text-xs">Au</Label>
            <Input
              id="end-date"
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-[160px]"
            />
          </div>
          <Button onClick={search} disabled={loading || !startDate || !endDate}>
            {loading ? <Spinner /> : <Search className="h-4 w-4" />}
            <span>Rechercher</span>
          </Button>
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {searched && !loading && !error && (
        <>
          {selected.length > 0 && (
            <div className="flex items-center justify-between rounded-md border border-blue-200 bg-blue-50 px-4 py-2">
              <span className="text-sm text-blue-900">
                <strong>{selected.length}</strong> facture(s) sélectionnée(s)
              </span>
              <Button onClick={() => setBulkOpen(true)}>
                <Download className="h-4 w-4" />
                <span>Télécharger la sélection</span>
              </Button>
            </div>
          )}
          <DataTable
            data={rows}
            columns={columns}
            rowKey={(r) => r.numero}
            selectable
            onSelectionChange={setSelected}
            empty="Aucune facture SAP sur cette période."
            onRowClick={(r) => {
              setFactureNavigation({
                numeros: rows.map((row) => row.numero),
                source: "sap-by-date",
              });
              router.push(`/factures/${encodeURIComponent(r.numero)}`);
            }}
          />
        </>
      )}

      <BulkDownloadDialog
        open={bulkOpen}
        onOpenChange={setBulkOpen}
        rows={rows.filter((r) => selected.includes(r.numero))}
      />
    </section>
  );
}
