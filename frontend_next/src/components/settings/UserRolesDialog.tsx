"use client";

import { useMemo, useState } from "react";
import { Save } from "lucide-react";
import { toast } from "sonner";
import { settingsApi, extractError } from "@/lib/api";
import type { AdminUser, Role } from "@/types";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";

interface Props {
  user: AdminUser;
  roles: Role[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: (user: AdminUser) => void;
}

export function UserRolesDialog({ user, roles, open, onOpenChange, onSaved }: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set(user.permissions));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

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

  function toggle(code: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  }

  async function save() {
    setSaving(true);
    setError("");
    try {
      const updated = await settingsApi.setUserRoles(user.id_user, Array.from(selected));
      toast.success("Permissions mises à jour");
      onSaved(updated);
    } catch (err) {
      setError(extractError(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Permissions de {user.username}</DialogTitle>
          <DialogDescription>
            Sélectionnez les rôles à attribuer à cet utilisateur.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[60vh] overflow-y-auto space-y-4 pr-2">
          {grouped.map(([cat, rolesInCat]) => (
            <div key={cat} className="space-y-1">
              <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">
                {cat}
              </div>
              {rolesInCat.map((r) => (
                <label
                  key={r.id}
                  className="flex items-start gap-3 p-2 rounded hover:bg-slate-50 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={selected.has(r.code)}
                    onChange={() => toggle(r.code)}
                    className="mt-1 h-4 w-4 rounded border-slate-300"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="font-mono text-[10px]">
                        {r.code}
                      </Badge>
                      <span className="text-sm font-medium">{r.label ?? r.code}</span>
                    </div>
                    {r.description && (
                      <p className="text-xs text-slate-500 mt-0.5">{r.description}</p>
                    )}
                  </div>
                </label>
              ))}
            </div>
          ))}
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Annuler
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving ? <Spinner /> : <Save className="h-4 w-4" />}
            <span>Enregistrer</span>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
