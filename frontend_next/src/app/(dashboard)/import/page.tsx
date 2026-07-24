import { ExcelImporter } from "@/components/factures/ExcelImporter";

export const metadata = { title: "Import Excel · E_Facture" };

export default function ImportPage() {
  return (
    <div className="space-y-4 max-w-4xl">
      <header>
        <h1 className="text-2xl font-bold text-slate-900">Import Excel</h1>
        <p className="text-slate-500 text-sm mt-1">
          Importez un fichier de factures (vues SURCCUSALE, FACTURE_EXPORT ou NPG_SALE).
          Chaque facture est sauvegardée dans l&apos;historique des téléchargées.
        </p>
      </header>
      <ExcelImporter />
    </div>
  );
}
