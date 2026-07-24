import { redirect } from "next/navigation";
import { getServerSession } from "@/lib/auth/session";
import { FneCancellationsList } from "@/components/factures/FneCancellationsList";

const ALLOWED = new Set(["audit.view", "fne.cancel_duplicate"]);

export const metadata = { title: "Annulations FNE · E_Facture" };

export default async function FneAnnulationsPage() {
  const user = await getServerSession();
  const allowed =
    user?.user_type === "admin" ||
    (user?.permissions ?? []).some((p) => ALLOWED.has(p));
  if (!allowed) redirect("/");

  return (
    <div className="space-y-4 max-w-6xl">
      <header>
        <h1 className="text-2xl font-bold text-slate-900">Annulations FNE</h1>
        <p className="text-slate-500 text-sm mt-1">
          Détection et annulation des doublons FNE pour audit.
        </p>
      </header>
      <FneCancellationsList />
    </div>
  );
}
