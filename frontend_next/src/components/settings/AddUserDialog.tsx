"use client";

import { useEffect, useState } from "react";
import { Search, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { settingsApi, extractError } from "@/lib/api";
import { useDebounce } from "@/hooks/useDebounce";
import type { LdapUser } from "@/types";
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
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdded: () => void;
}

export function AddUserDialog({ open, onOpenChange, onAdded }: Props) {
  const [search, setSearch] = useState("");
  const debounced = useDebounce(search, 300);
  const [users, setUsers] = useState<LdapUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState<number | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    let mounted = true;
    setLoading(true);
    setError("");
    settingsApi
      .listLdapUsers(debounced || undefined)
      .then((res) => mounted && setUsers(res))
      .catch((err) => mounted && setError(extractError(err)))
      .finally(() => mounted && setLoading(false));
    return () => {
      mounted = false;
    };
  }, [debounced, open]);

  async function handleAdd(u: LdapUser) {
    setAdding(u.id_user);
    try {
      await settingsApi.addUser({
        id_user: u.id_user,
        username: u.username,
        user_type: "utilisateur",
      });
      toast.success(`${u.username ?? u.name} ajouté`);
      onAdded();
    } catch (err) {
      toast.error(extractError(err));
    } finally {
      setAdding(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Ajouter un utilisateur</DialogTitle>
          <DialogDescription>
            Recherche dans l&apos;annuaire LDAP. Sélectionnez un utilisateur pour l&apos;autoriser.
          </DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Nom, login ou matricule..."
            className="pl-9"
            autoFocus
          />
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="max-h-80 overflow-y-auto rounded border border-slate-200 divide-y divide-slate-100">
          {loading ? (
            <div className="p-6 text-center text-sm text-slate-500">
              <Spinner className="inline h-4 w-4" /> Chargement…
            </div>
          ) : users.length === 0 ? (
            <div className="p-6 text-center text-sm text-slate-500">
              Aucun résultat.
            </div>
          ) : (
            users.map((u) => (
              <div
                key={u.id_user}
                className="flex items-center justify-between p-3 hover:bg-slate-50"
              >
                <div className="flex flex-col min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium truncate">{u.name || u.username}</span>
                    {u.already_added && <Badge variant="success">Déjà ajouté</Badge>}
                  </div>
                  <div className="flex gap-3 text-xs text-slate-500">
                    {u.username && <span className="font-mono">{u.username}</span>}
                    {u.email && <span>{u.email}</span>}
                    {u.matricule && <span>Mat. {u.matricule}</span>}
                  </div>
                </div>
                <Button
                  size="sm"
                  variant={u.already_added ? "ghost" : "default"}
                  disabled={u.already_added || adding === u.id_user}
                  onClick={() => handleAdd(u)}
                >
                  {adding === u.id_user ? <Spinner /> : <UserPlus className="h-4 w-4" />}
                  <span>{u.already_added ? "Ajouté" : "Ajouter"}</span>
                </Button>
              </div>
            ))
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Fermer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
