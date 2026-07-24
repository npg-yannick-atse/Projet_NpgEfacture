import { Suspense } from "react";
import { DownloadedList } from "@/components/factures/DownloadedList";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata = { title: "Factures Téléchargées · E_Facture" };

export default function TelechargeesPage() {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <DownloadedList />
    </Suspense>
  );
}
