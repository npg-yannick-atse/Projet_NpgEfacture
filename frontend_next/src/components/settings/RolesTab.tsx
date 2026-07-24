"use client";

import { useEffect, useMemo, useState } from "react";
import { settingsApi, extractError } from "@/lib/api";
import type { Role } from "@/types";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";

export function RolesTab() {
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let mounted = true;
    settingsApi
      .listRoles()
      .then((r) => mounted && setRoles(r))
      .catch((err) => mounted && setError(extractError(err)))
      .finally(() => mounted && setLoading(false));
    return () => {
      mounted = false;
    };
  }, []);

  const grouped = useMemo(() => {
    const map = new Map<string, Role[]>();
    for (const r of roles) {
      const cat = r.category ?? "Autres";
      const arr = map.get(cat) ?? [];
      arr.push(r);
      map.set(cat, arr);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [roles]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-10">
        <Spinner className="h-5 w-5" />
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {grouped.map(([cat, rolesInCat]) => (
        <Card key={cat}>
          <CardHeader>
            <CardTitle className="text-base">{cat}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {rolesInCat.map((r) => (
              <div
                key={r.id}
                className="flex items-start gap-3 py-2 border-b border-slate-100 last:border-0"
              >
                <Badge variant="outline" className="font-mono text-[10px] mt-0.5">
                  {r.code}
                </Badge>
                <div className="min-w-0">
                  <div className="text-sm font-medium">{r.label ?? r.code}</div>
                  {r.description && (
                    <p className="text-xs text-slate-500 mt-0.5">{r.description}</p>
                  )}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
