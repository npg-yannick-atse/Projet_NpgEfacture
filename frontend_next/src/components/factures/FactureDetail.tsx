"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import axios from "axios";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Download,
  FileDown,
  FileEdit,
  Printer,
  Send,
} from "lucide-react";
import { toast } from "sonner";
import { sapApi, downloadedApi, extractError } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { useFactureNavigation } from "@/hooks/useFactureNavigation";
import { events } from "@/lib/events";
import { exportFactureToPdf } from "@/lib/export/pdf";
import {
  extractFactureLines,
  getClientName,
  getInvoiceNumber,
  getKomvConditions,
  getPartners,
  getVbrkHeader,
  getVbrpItems,
  isAvoirFkart,
} from "@/lib/facture-utils";
import { formatDate, formatMontantSap } from "@/lib/format";
import type { FactureData, SapInvoiceResponse, SendInvoiceResult } from "@/types";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AvoirPanel } from "./AvoirPanel";
import { InlineFieldsPanel } from "./InlineFieldsPanel";
import { ManualRegisterDialog } from "./ManualRegisterDialog";
import { SendFneDialog } from "./SendFneDialog";
import { SentDetailsDialog } from "./SentDetailsDialog";

interface Props {
  numero: string;
}

/**
 * Try the live SAP fetch first. If the backend rejects with 409 (the legacy
 * "already downloaded" guard), fall back to the locally stored payload from
 * /api/downloaded-invoices so we can still display the invoice.
 */
async function loadFactureSource(numero: string): Promise<{
  lines: FactureData[];
  fromCache: boolean;
}> {
  try {
    const res = await sapApi.searchInvoice(numero);
    if (res.success) {
      return { lines: extractFactureLines(res), fromCache: false };
    }
    // Backend explicitly says "already downloaded" → load from cache.
    if ((res as { message?: string }).message?.toLowerCase().includes("déjà été téléchargée")) {
      return { lines: await loadFromCache(numero), fromCache: true };
    }
    throw new Error((res as { message?: string }).message ?? "Facture introuvable.");
  } catch (err) {
    if (axios.isAxiosError(err) && err.response?.status === 409) {
      return { lines: await loadFromCache(numero), fromCache: true };
    }
    throw err;
  }
}

async function loadFromCache(numero: string): Promise<FactureData[]> {
  const row = await downloadedApi.getDownloadedByNumero(numero);
  if (!row) {
    throw new Error(
      `La facture ${numero} est marquée comme téléchargée mais introuvable dans l'historique.`,
    );
  }
  // The stored `data` field is the raw SAP payload (could be array or object).
  const synthetic: SapInvoiceResponse = {
    success: true,
    data: row.data as SapInvoiceResponse["data"],
  };
  return extractFactureLines(synthetic);
}

export function FactureDetail({ numero }: Props) {
  const router = useRouter();
  const { user } = useAuth();
  const nav = useFactureNavigation(numero);
  const [lines, setLines] = useState<FactureData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [fromCache, setFromCache] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [sentDetailsOpen, setSentDetailsOpen] = useState(false);
  const [lastSendResult, setLastSendResult] = useState<SendInvoiceResult | null>(null);
  const [sentRef, setSentRef] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setError("");
    (async () => {
      try {
        const result = await loadFactureSource(numero);
        if (!mounted) return;
        setLines(result.lines);
        setFromCache(result.fromCache);
      } catch (err) {
        if (mounted) setError(extractError(err));
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [numero]);

  if (loading) return <DetailSkeleton />;

  if (error) {
    return (
      <div className="space-y-4">
        <BackButton />
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      </div>
    );
  }

  const first = lines[0];
  if (!first) {
    return (
      <div className="space-y-4">
        <BackButton />
        <Alert variant="warning">
          <AlertDescription>Aucune donnée pour la facture {numero}.</AlertDescription>
        </Alert>
      </div>
    );
  }

  const header = getVbrkHeader(first);
  const items = getVbrpItems(first);
  const partners = getPartners(first);
  const conditions = getKomvConditions(first);
  const invoiceNumber = getInvoiceNumber(first) || numero;
  const clientName = getClientName(first);
  const fkart = (first as { fkart?: string }).fkart ?? header?.FKART;
  const isAvoir = isAvoirFkart(fkart);
  const ag = partners.find((p) => p.PARVW === "AG");

  async function handleDownload() {
    if (!user?.username) {
      toast.error("Utilisateur non identifié.");
      return;
    }
    setDownloading(true);
    try {
      await downloadedApi.saveDownloaded({
        id: `${invoiceNumber}_${Date.now()}`,
        username: user.username,
        numero: invoiceNumber,
        date: header?.FKDAT ?? null,
        client: clientName || "Client inconnu",
        data: lines,
      });
      toast.success(`Facture ${invoiceNumber} téléchargée`);
      events.emit("invoice:downloaded", { numero: invoiceNumber });
      setFromCache(true);
    } catch (err) {
      toast.error(extractError(err));
    } finally {
      setDownloading(false);
    }
  }

  function handlePrint() {
    if (typeof window !== "undefined") {
      void sapApi.logPrintAction(invoiceNumber);
      window.print();
    }
  }

  function handlePdf() {
    void sapApi.logDownloadAction(invoiceNumber);
    exportFactureToPdf(first);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <BackButton />
          {nav.position && (
            <div className="flex items-center gap-1 text-xs text-slate-500">
              <Button
                size="sm"
                variant="ghost"
                disabled={!nav.prev}
                onClick={() =>
                  nav.prev &&
                  router.push(`/factures/${encodeURIComponent(nav.prev)}`)
                }
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="tabular-nums">
                {nav.position.current} / {nav.position.total}
              </span>
              <Button
                size="sm"
                variant="ghost"
                disabled={!nav.next}
                onClick={() =>
                  nav.next &&
                  router.push(`/factures/${encodeURIComponent(nav.next)}`)
                }
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          {isAvoir && <Badge variant="warning">Avoir</Badge>}
          <Badge variant="outline">{fkart ?? "—"}</Badge>
          {fromCache && (
            <Badge variant="secondary" title="Données issues de l'historique des factures téléchargées">
              Cache
            </Badge>
          )}
          {sentRef && <Badge variant="success">FNE : {sentRef}</Badge>}
          {!fromCache && !isAvoir && (
            <Button variant="outline" onClick={handleDownload} disabled={downloading}>
              <Download className="h-4 w-4" />
              <span>{downloading ? "Téléchargement…" : "Télécharger"}</span>
            </Button>
          )}
          <Button variant="outline" onClick={handlePdf}>
            <FileDown className="h-4 w-4" />
            <span>PDF</span>
          </Button>
          <Button variant="outline" onClick={handlePrint}>
            <Printer className="h-4 w-4" />
            <span>Imprimer</span>
          </Button>
          {!isAvoir && (
            <>
              <Button variant="outline" onClick={() => setManualOpen(true)} title="Saisie manuelle d'une référence FNE déjà obtenue">
                <FileEdit className="h-4 w-4" />
                <span>Manuelle</span>
              </Button>
              <Button onClick={() => setSendOpen(true)}>
                <Send className="h-4 w-4" />
                <span>Envoyer à FNE</span>
              </Button>
            </>
          )}
        </div>
      </div>

      <ManualRegisterDialog
        open={manualOpen}
        onOpenChange={setManualOpen}
        invoiceNumber={invoiceNumber}
        onSaved={(ref) => setSentRef(ref)}
      />

      {isAvoir && (
        <AvoirPanel numeroAvoir={invoiceNumber} clientName={clientName} />
      )}

      <SendFneDialog
        open={sendOpen}
        onOpenChange={setSendOpen}
        invoiceNumber={invoiceNumber}
        facture={first}
        onSuccess={(res) => {
          setSentRef(res.response?.reference ?? "envoyée");
          setLastSendResult(res);
          setSentDetailsOpen(true);
        }}
      />

      <SentDetailsDialog
        open={sentDetailsOpen}
        onOpenChange={setSentDetailsOpen}
        result={lastSendResult}
        invoiceNumber={invoiceNumber}
      />

      <header>
        <h1 className="text-2xl font-bold text-slate-900">
          Facture {invoiceNumber}
        </h1>
        <p className="text-slate-500">{clientName || "—"}</p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>En-tête (VBRK)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row label="Numéro" value={invoiceNumber} mono />
            <Row label="Type" value={fkart ?? "—"} />
            <Row label="Date facture" value={formatDate(header?.FKDAT)} />
            <Row label="Client" value={ag?.KUNNR ?? header?.KUNNR ?? "—"} mono />
            <Row label="Devise" value={header?.WAERK ?? "—"} />
            <Row
              label="Montant net"
              value={`${formatMontantSap(header?.NETWR)} ${header?.WAERK ?? ""}`}
              strong
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Partenaires</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {partners.length === 0 ? (
              <p className="text-slate-500">Aucun partenaire.</p>
            ) : (
              partners.map((p, i) => (
                <Row
                  key={`${p.PARVW}-${i}`}
                  label={p.PARVW}
                  value={`${p.KUNNR}${p.NAME1 ? ` — ${p.NAME1}` : ""}`}
                />
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Lignes (VBRP) — {items.length}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {items.length === 0 ? (
            <p className="text-sm text-slate-500 px-6 pb-6">Aucune ligne.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16">Pos.</TableHead>
                  <TableHead>Article</TableHead>
                  <TableHead>Désignation</TableHead>
                  <TableHead className="text-right">Qté</TableHead>
                  <TableHead>UV</TableHead>
                  <TableHead className="text-right">Montant</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((it, i) => (
                  <TableRow key={`${it.POSNR}-${i}`}>
                    <TableCell className="font-mono text-xs">{it.POSNR}</TableCell>
                    <TableCell className="font-mono text-xs">{it.MATNR}</TableCell>
                    <TableCell>{it.ARKTX}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {it.FKIMG}
                    </TableCell>
                    <TableCell>{it.VRKME}</TableCell>
                    <TableCell className="text-right tabular-nums font-medium">
                      {formatMontantSap(it.NETWR)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {conditions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Conditions de prix (KOMV) — {conditions.length}</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Code</TableHead>
                  <TableHead className="text-right">Taux</TableHead>
                  <TableHead className="text-right">Montant</TableHead>
                  <TableHead>Devise</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {conditions.map((c, i) => (
                  <TableRow key={`${c.KSCHL}-${i}`}>
                    <TableCell className="font-mono text-xs">{c.KSCHL}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatMontantSap(c.KBETR)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums font-medium">
                      {formatMontantSap(c.KWERT)}
                    </TableCell>
                    <TableCell>{c.WAERS ?? "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {!isAvoir && (
        <InlineFieldsPanel invoiceNumber={invoiceNumber} />
      )}
    </div>
  );
}

function BackButton() {
  return (
    <Button variant="ghost" size="sm" asChild>
      <Link href="/">
        <ArrowLeft className="h-4 w-4" />
        <span>Retour</span>
      </Link>
    </Button>
  );
}

function Row({
  label,
  value,
  mono,
  strong,
}: {
  label: string;
  value: string;
  mono?: boolean;
  strong?: boolean;
}) {
  return (
    <div className="flex justify-between gap-4 py-1 border-b border-slate-100 last:border-0">
      <span className="text-slate-500">{label}</span>
      <span
        className={[
          "text-right",
          mono ? "font-mono text-xs" : "",
          strong ? "font-semibold text-slate-900" : "text-slate-800",
        ].join(" ")}
      >
        {value}
      </span>
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-9 w-24" />
      <div>
        <Skeleton className="h-8 w-64 mb-2" />
        <Skeleton className="h-4 w-48" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Skeleton className="h-64" />
        <Skeleton className="h-64" />
      </div>
      <Skeleton className="h-80" />
    </div>
  );
}
