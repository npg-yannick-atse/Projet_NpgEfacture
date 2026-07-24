import { FactureSearchBar } from "@/components/factures/FactureSearchBar";
import { InvoiceTypesGrid } from "@/components/factures/InvoiceTypesGrid";
import { SapInvoicesByDate } from "@/components/factures/SapInvoicesByDate";

export default function HomePage() {
  return (
    <div className="space-y-8 max-w-6xl mx-auto">
      <header>
        <h1 className="text-3xl font-bold text-slate-900">Bienvenue</h1>
        <p className="text-slate-500 mt-1">
          Recherchez une facture SAP, parcourez par période ou choisissez un type.
        </p>
      </header>

      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-700 mb-3">
          Recherche rapide
        </h2>
        <FactureSearchBar />
      </section>

      <SapInvoicesByDate />

      <section>
        <h2 className="text-sm font-semibold text-slate-700 mb-3">
          Types de facture
        </h2>
        <InvoiceTypesGrid />
      </section>
    </div>
  );
}
