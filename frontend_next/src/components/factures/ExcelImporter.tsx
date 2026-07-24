"use client";

import { useState, type ChangeEvent } from "react";
import * as XLSX from "xlsx";
import { CheckCircle2, FileDown, FileSpreadsheet, Upload, XCircle } from "lucide-react";
import { toast } from "sonner";
import { downloadedApi, extractError } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
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

type ImportView = "SURCCUSALE" | "FACTURE_EXPORT" | "NPG_SALE";

interface ImportRow {
  numero_facture?: string;
  numeroFacture?: string;
  client?: string;
  nomClient?: string;
  date?: string;
  designation?: string;
  reference?: string;
  quantite?: number;
  PU_HT?: number;
  TVA?: number;
  point_of_sale?: string;
  [key: string]: unknown;
}

interface ImportResult {
  numero: string;
  status: "success" | "duplicate" | "error";
  message?: string;
}

const VIEW_OPTIONS: { value: ImportView; label: string }[] = [
  { value: "SURCCUSALE", label: "SURCCUSALE (vue surcharge)" },
  { value: "FACTURE_EXPORT", label: "FACTURE_EXPORT (export)" },
  { value: "NPG_SALE", label: "NPG_SALE (vente NPG)" },
];

export function ExcelImporter() {
  const { user } = useAuth();
  const [view, setView] = useState<ImportView>("SURCCUSALE");
  const [file, setFile] = useState<File | null>(null);
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [grouped, setGrouped] = useState<Record<string, ImportRow[]>>({});
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [results, setResults] = useState<ImportResult[]>([]);
  const [error, setError] = useState("");

  async function onFileChange(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setError("");
    setResults([]);
    setRows([]);
    setGrouped({});
    setParsing(true);

    try {
      const buf = await f.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json<ImportRow>(sheet, { defval: "" });
      setRows(json);

      // Grouper par numéro de facture
      const g: Record<string, ImportRow[]> = {};
      for (const r of json) {
        const num =
          (r.numero_facture as string) ||
          (r.numeroFacture as string) ||
          (r.numero as string) ||
          (r.VBELN as string);
        if (!num) continue;
        const key = String(num).trim();
        if (!g[key]) g[key] = [];
        g[key].push(r);
      }
      setGrouped(g);
    } catch (err) {
      setError(`Lecture Excel impossible : ${extractError(err)}`);
    } finally {
      setParsing(false);
    }
  }

  async function importAll() {
    if (!user?.username) {
      toast.error("Utilisateur non identifié.");
      return;
    }
    const numeros = Object.keys(grouped);
    if (numeros.length === 0) {
      setError("Aucune facture détectée dans le fichier.");
      return;
    }
    setImporting(true);
    setResults([]);
    const out: ImportResult[] = [];

    for (const num of numeros) {
      const lines = grouped[num];
      const first = lines[0] ?? {};
      const client = String(
        first.client ?? first.nomClient ?? "Client inconnu",
      );
      // Tag chaque ligne avec l'import_view + point_of_sale pour le backend
      const data = lines.map((r) => ({
        ...r,
        import_view: view,
        point_of_sale: (r.point_of_sale as string) ?? view,
        source: "template_import",
      }));

      try {
        await downloadedApi.saveDownloaded({
          id: `TMP_${num}_${Date.now()}`,
          username: user.username ?? "import",
          numero: num,
          date: (first.date as string) ?? null,
          client,
          data,
          invoice_type_code:
            view === "NPG_SALE" ? "NPG_SIEGE_FACTURATION" : view,
        });
        out.push({ numero: num, status: "success" });
      } catch (err) {
        const msg = extractError(err);
        const isDup = msg.toLowerCase().includes("déjà été téléchargée");
        out.push({
          numero: num,
          status: isDup ? "duplicate" : "error",
          message: msg,
        });
      }
      setResults([...out]);
    }

    setImporting(false);
    const ok = out.filter((r) => r.status === "success").length;
    const dup = out.filter((r) => r.status === "duplicate").length;
    const ko = out.filter((r) => r.status === "error").length;
    toast.success(`${ok} importée(s) · ${dup} doublon(s) · ${ko} erreur(s)`);
  }

  function downloadBlankTemplate() {
    const headers = [
      "numero_facture",
      "date",
      "client",
      "designation",
      "reference",
      "quantite",
      "PU_HT",
      "TVA",
      "OtherTaxPct",
      "clientNCC",
      "ClientEmail",
      "ClientPhone",
      "Template",
      "PaymentMethod",
      "point_of_sale",
    ];
    const sample = [
      {
        numero_facture: "MAN_2026_001",
        date: new Date().toISOString().slice(0, 10),
        client: "Client exemple",
        designation: "Article exemple",
        reference: "REF-001",
        quantite: 1,
        PU_HT: 10000,
        TVA: 18,
        OtherTaxPct: 0,
        clientNCC: "9904279V",
        ClientEmail: "client@example.com",
        ClientPhone: "+225 00 00 00 00",
        Template: "B2B",
        PaymentMethod: "check",
        point_of_sale: view,
      },
    ];
    const ws = XLSX.utils.json_to_sheet(sample, { header: headers });
    ws["!cols"] = headers.map((h) => ({ wch: Math.max(h.length + 2, 14) }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Modèle");
    XLSX.writeFile(wb, `modele_import_${view}.xlsx`);
    toast.success("Modèle téléchargé");
  }

  function reset() {
    setFile(null);
    setRows([]);
    setGrouped({});
    setResults([]);
    setError("");
  }

  const numeros = Object.keys(grouped);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5" />
              Importer un fichier Excel
            </CardTitle>
            <Button variant="outline" size="sm" onClick={downloadBlankTemplate}>
              <FileDown className="h-4 w-4" />
              <span>Modèle vierge</span>
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="view">Vue d&apos;import</Label>
              <Select value={view} onValueChange={(v) => setView(v as ImportView)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {VIEW_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="file">Fichier Excel (.xlsx, .xls)</Label>
              <Input
                id="file"
                type="file"
                accept=".xlsx,.xls"
                onChange={onFileChange}
                disabled={parsing || importing}
              />
            </div>
          </div>

          {parsing && (
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <Spinner /> Analyse du fichier…
            </div>
          )}

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {file && rows.length > 0 && (
            <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm">
              <div className="flex items-center justify-between mb-2">
                <span className="font-medium text-slate-700">
                  {file.name}
                </span>
                <button
                  type="button"
                  onClick={reset}
                  className="text-xs text-slate-500 hover:text-slate-700"
                >
                  Effacer
                </button>
              </div>
              <div className="flex gap-2 flex-wrap">
                <Badge variant="secondary">{rows.length} ligne(s)</Badge>
                <Badge variant="outline">{numeros.length} facture(s)</Badge>
                <Badge variant="secondary">Vue : {view}</Badge>
              </div>
            </div>
          )}

          {numeros.length > 0 && (
            <div className="flex justify-end">
              <Button onClick={importAll} disabled={importing || parsing}>
                {importing ? <Spinner /> : <Upload className="h-4 w-4" />}
                <span>Importer {numeros.length} facture(s)</span>
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {results.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Résultats d&apos;import ({results.length}/{numeros.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 max-h-80 overflow-y-auto">
            {results.map((r) => (
              <div
                key={r.numero}
                className="flex items-center gap-2 text-sm py-1.5 border-b border-slate-100 last:border-0"
              >
                {r.status === "success" && (
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                )}
                {r.status === "duplicate" && (
                  <Badge variant="warning" className="text-[10px]">Doublon</Badge>
                )}
                {r.status === "error" && (
                  <XCircle className="h-4 w-4 text-red-600" />
                )}
                <span className="font-mono text-xs">{r.numero}</span>
                {r.message && r.status !== "success" && (
                  <span className="text-xs text-slate-500 truncate">
                    {r.message}
                  </span>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
