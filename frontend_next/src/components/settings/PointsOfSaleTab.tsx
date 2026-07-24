"use client";

import { useEffect, useMemo, useState } from "react";
import { Save } from "lucide-react";
import { toast } from "sonner";
import { posApi, extractError } from "@/lib/api";
import type { PointOfSale } from "@/types";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export function PointsOfSaleTab() {
  const [items, setItems] = useState<PointOfSale[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [pendingSelections, setPendingSelections] = useState<Record<number, boolean>>({});
  const [saving, setSaving] = useState(false);

  async function reload() {
    setLoading(true);
    setError("");
    try {
      setItems(await posApi.listPointsOfSale());
      setPendingSelections({});
    } catch (err) {
      setError(extractError(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void reload();
  }, []);

  const filtered = useMemo(() => {
    if (!search.trim()) return items;
    const q = search.toLowerCase();
    return items.filter(
      (p) =>
        p.libelle.toLowerCase().includes(q) ||
        (p.description ?? "").toLowerCase().includes(q),
    );
  }, [items, search]);

  function toggle(id: number, currentActive: boolean) {
    setPendingSelections((prev) => {
      const next = { ...prev };
      const desired = next[id] !== undefined ? !next[id] : !currentActive;
      if (desired === currentActive) {
        delete next[id];
      } else {
        next[id] = desired;
      }
      return next;
    });
  }

  function getEffective(p: PointOfSale): boolean {
    return pendingSelections[p.id] !== undefined ? pendingSelections[p.id] : p.active;
  }

  const dirtyCount = Object.keys(pendingSelections).length;

  async function saveAll() {
    setSaving(true);
    try {
      await posApi.bulkUpdatePointsOfSale(pendingSelections);
      toast.success(`${dirtyCount} point(s) de vente mis à jour`);
      void reload();
    } catch (err) {
      toast.error(extractError(err));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-10">
        <Spinner className="h-5 w-5" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex-1 min-w-[240px] max-w-md">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher un point de vente..."
          />
        </div>
        <div className="flex items-center gap-2">
          {dirtyCount > 0 && (
            <Badge variant="warning">{dirtyCount} modification(s)</Badge>
          )}
          <Button onClick={saveAll} disabled={dirtyCount === 0 || saving}>
            {saving ? <Spinner /> : <Save className="h-4 w-4" />}
            <span>Enregistrer</span>
          </Button>
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="rounded-md border border-slate-200 bg-white overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">Actif</TableHead>
              <TableHead>Libellé</TableHead>
              <TableHead>Description</TableHead>
              <TableHead className="text-right">Statut</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-slate-500 py-8">
                  Aucun point de vente.
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((p) => {
                const effective = getEffective(p);
                const dirty = pendingSelections[p.id] !== undefined;
                return (
                  <TableRow key={p.id} className={dirty ? "bg-amber-50/50" : ""}>
                    <TableCell>
                      <input
                        type="checkbox"
                        checked={effective}
                        onChange={() => toggle(p.id, p.active)}
                        className="h-4 w-4 rounded border-slate-300"
                      />
                    </TableCell>
                    <TableCell className="font-medium">{p.libelle}</TableCell>
                    <TableCell className="text-slate-600">
                      {p.description ?? <span className="text-slate-300">—</span>}
                    </TableCell>
                    <TableCell className="text-right">
                      {effective ? (
                        <Badge variant="success">Actif</Badge>
                      ) : (
                        <Badge variant="secondary">Inactif</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
