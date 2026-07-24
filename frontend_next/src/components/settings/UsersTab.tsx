"use client";

import { useEffect, useState } from "react";
import { Plus, Trash2, UserCog } from "lucide-react";
import { toast } from "sonner";
import { settingsApi, extractError } from "@/lib/api";
import type { AdminUser, Role } from "@/types";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { DataTable, type DataTableColumn } from "@/components/common/DataTable";
import { AddUserDialog } from "./AddUserDialog";
import { UserRolesDialog } from "./UserRolesDialog";

export function UsersTab() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [addOpen, setAddOpen] = useState(false);
  const [rolesUser, setRolesUser] = useState<AdminUser | null>(null);

  async function reload() {
    setLoading(true);
    setError("");
    try {
      const [u, r] = await Promise.all([
        settingsApi.listUsers(),
        settingsApi.listRoles(),
      ]);
      setUsers(u);
      setRoles(r);
    } catch (err) {
      setError(extractError(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void reload();
  }, []);

  async function changeType(user: AdminUser, type: "admin" | "utilisateur") {
    try {
      await settingsApi.updateUserType(user.id_user, type);
      setUsers((prev) =>
        prev.map((u) => (u.id_user === user.id_user ? { ...u, user_type: type } : u)),
      );
      toast.success(`${user.username} → ${type}`);
    } catch (err) {
      toast.error(extractError(err));
    }
  }

  async function remove(user: AdminUser) {
    if (!window.confirm(`Retirer ${user.username} ?`)) return;
    try {
      await settingsApi.removeUser(user.id_user);
      setUsers((prev) => prev.filter((u) => u.id_user !== user.id_user));
      toast.success(`${user.username} retiré`);
    } catch (err) {
      toast.error(extractError(err));
    }
  }

  const columns: DataTableColumn<AdminUser>[] = [
    {
      key: "username",
      header: "Utilisateur",
      sortable: true,
      accessor: (u) => u.username ?? "",
      render: (u) => (
        <div className="flex flex-col">
          <span className="font-medium">{u.username ?? "—"}</span>
          <span className="text-xs text-slate-500 font-mono">id : {u.id_user}</span>
        </div>
      ),
    },
    {
      key: "user_type",
      header: "Type",
      sortable: true,
      accessor: (u) => u.user_type,
      render: (u) => (
        <Select
          value={u.user_type}
          onValueChange={(v) => changeType(u, v as "admin" | "utilisateur")}
        >
          <SelectTrigger className="h-8 w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="admin">Admin</SelectItem>
            <SelectItem value="utilisateur">Utilisateur</SelectItem>
          </SelectContent>
        </Select>
      ),
    },
    {
      key: "permissions",
      header: "Permissions",
      render: (u) => (
        <div className="flex flex-wrap gap-1 max-w-md">
          {u.permissions.length === 0 ? (
            <span className="text-slate-300">—</span>
          ) : (
            u.permissions.map((p) => (
              <Badge key={p} variant="secondary" className="font-mono text-[10px]">
                {p}
              </Badge>
            ))
          )}
        </div>
      ),
    },
    {
      key: "actions",
      header: "",
      width: "120px",
      align: "right",
      render: (u) => (
        <div className="flex justify-end gap-1">
          <Button size="sm" variant="ghost" onClick={() => setRolesUser(u)}>
            <UserCog className="h-4 w-4" />
          </Button>
          <Button size="sm" variant="ghost" onClick={() => remove(u)}>
            <Trash2 className="h-4 w-4 text-red-600" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-700">
          {loading ? "Chargement…" : `${users.length} utilisateur(s) autorisé(s)`}
        </h2>
        <Button onClick={() => setAddOpen(true)}>
          <Plus className="h-4 w-4" />
          <span>Ajouter un utilisateur</span>
        </Button>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-10">
          <Spinner className="h-5 w-5" />
        </div>
      ) : (
        <DataTable
          data={users}
          columns={columns}
          rowKey={(u) => u.id_user}
          empty="Aucun utilisateur autorisé."
        />
      )}

      <AddUserDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        onAdded={() => {
          setAddOpen(false);
          void reload();
        }}
      />

      {rolesUser && (
        <UserRolesDialog
          user={rolesUser}
          roles={roles}
          open={!!rolesUser}
          onOpenChange={(o) => !o && setRolesUser(null)}
          onSaved={(updated) => {
            setUsers((prev) =>
              prev.map((u) => (u.id_user === updated.id_user ? updated : u)),
            );
            setRolesUser(null);
          }}
        />
      )}
    </div>
  );
}
