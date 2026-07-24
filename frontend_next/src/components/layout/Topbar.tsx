"use client";

import { LogOut } from "lucide-react";
import { logoutAction } from "@/lib/auth/actions";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";

export function Topbar() {
  const { user, isAdmin } = useAuth();

  return (
    <header className="h-16 border-b border-slate-200 bg-white flex items-center justify-between px-6 no-print">
      <div className="flex flex-col">
        <span className="text-sm font-semibold text-slate-800">
          {user?.fullName ?? user?.username ?? "Utilisateur"}
        </span>
        <span className="text-xs text-slate-500">
          {isAdmin ? "Administrateur" : "Utilisateur"}
        </span>
      </div>

      <form action={logoutAction}>
        <Button type="submit" variant="ghost" size="sm" className="text-slate-600">
          <LogOut className="h-4 w-4" />
          <span>Déconnexion</span>
        </Button>
      </form>
    </header>
  );
}
