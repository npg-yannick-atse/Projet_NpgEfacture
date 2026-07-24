import { Construction } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

export function PagePlaceholder({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  return (
    <div className="space-y-4 max-w-3xl">
      <header>
        <h1 className="text-2xl font-bold text-slate-900">{title}</h1>
        {description && <p className="text-slate-500 mt-1">{description}</p>}
      </header>
      <Card>
        <CardContent className="py-10 flex flex-col items-center text-slate-500">
          <Construction className="h-10 w-10 mb-3 text-slate-400" />
          <p className="text-sm">Cette page sera implémentée prochainement.</p>
        </CardContent>
      </Card>
    </div>
  );
}
