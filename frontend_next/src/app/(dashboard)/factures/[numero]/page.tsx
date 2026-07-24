import { FactureDetail } from "@/components/factures/FactureDetail";

interface Props {
  params: Promise<{ numero: string }>;
}

export default async function FactureDetailPage({ params }: Props) {
  const { numero } = await params;
  return <FactureDetail numero={decodeURIComponent(numero)} />;
}
