import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { formatDate, formatMontantSap } from "@/lib/format";
import {
  getClientName,
  getInvoiceNumber,
  getPartners,
  getVbrkHeader,
  getVbrpItems,
} from "@/lib/facture-utils";
import type { FactureData } from "@/types";

export function exportFactureToPdf(facture: FactureData): void {
  const doc = new jsPDF({ unit: "pt", format: "A4" });
  const header = getVbrkHeader(facture);
  const items = getVbrpItems(facture);
  const partners = getPartners(facture);
  const ag = partners.find((p) => p.PARVW === "AG");
  const invoiceNumber = getInvoiceNumber(facture);
  const clientName = getClientName(facture);

  doc.setFontSize(20);
  doc.setFont("helvetica", "bold");
  doc.text("FACTURE", 40, 50);

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text(`N° ${invoiceNumber}`, 40, 70);
  if (header?.FKDAT) doc.text(`Date : ${formatDate(header.FKDAT)}`, 40, 84);
  if (header?.FKART) doc.text(`Type : ${header.FKART}`, 40, 98);

  // Client block (right side)
  doc.setFont("helvetica", "bold");
  doc.text("Client", 350, 70);
  doc.setFont("helvetica", "normal");
  doc.text(clientName || "—", 350, 84, { maxWidth: 200 });
  if (ag?.KUNNR) doc.text(`KUNNR : ${ag.KUNNR}`, 350, 98);

  // Items table
  autoTable(doc, {
    startY: 130,
    head: [["Pos", "Article", "Désignation", "Qté", "UV", "Montant"]],
    body: items.map((it) => [
      it.POSNR,
      it.MATNR ?? "",
      it.ARKTX ?? "",
      String(it.FKIMG),
      it.VRKME ?? "",
      formatMontantSap(it.NETWR),
    ]),
    headStyles: { fillColor: [30, 64, 175], textColor: 255 },
    styles: { fontSize: 9, cellPadding: 4 },
    columnStyles: {
      0: { cellWidth: 30 },
      1: { cellWidth: 80, font: "courier" },
      2: { cellWidth: "auto" },
      3: { cellWidth: 50, halign: "right" },
      4: { cellWidth: 40 },
      5: { cellWidth: 80, halign: "right" },
    },
  });

  // Total
  const finalY = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 130;
  doc.setFont("helvetica", "bold");
  doc.text(
    `Total net : ${formatMontantSap(header?.NETWR)} ${header?.WAERK ?? ""}`,
    40,
    finalY + 30,
  );

  // Footer
  doc.setFontSize(8);
  doc.setFont("helvetica", "italic");
  doc.setTextColor(120);
  doc.text(
    `Document généré le ${new Date().toLocaleString("fr-FR")} — E_Facture`,
    40,
    doc.internal.pageSize.getHeight() - 20,
  );

  doc.save(`Facture_${invoiceNumber}.pdf`);
}
