import { redirect } from "next/navigation";
import { getServerSession } from "@/lib/auth/session";
import { SettingsTabs } from "@/components/settings/SettingsTabs";

export const metadata = { title: "Paramètres · E_Facture" };

export default async function ParametresPage() {
  const user = await getServerSession();
  if (user?.user_type !== "admin") redirect("/");

  return (
    <div className="space-y-4 max-w-7xl">
      <header>
        <h1 className="text-2xl font-bold text-slate-900">Paramètres</h1>
        <p className="text-slate-500 mt-1 text-sm">
          Gestion des utilisateurs, rôles, types de factures et points de vente.
        </p>
      </header>
      <SettingsTabs />
    </div>
  );
}
