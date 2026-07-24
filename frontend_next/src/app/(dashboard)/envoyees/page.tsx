import { Suspense } from "react";
import { SentList } from "@/components/factures/SentList";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata = { title: "Factures Envoyées · E_Facture" };

export default function EnvoyeesPage() {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <SentList />
    </Suspense>
  );
}
