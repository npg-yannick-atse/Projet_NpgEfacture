"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  FileSpreadsheet,
  Home,
  ListChecks,
  SendHorizontal,
  Settings,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  permission?: string | string[];
  adminOnly?: boolean;
}

const PRIMARY: NavItem[] = [
  { href: "/", label: "Accueil", icon: Home },
  { href: "/telechargees", label: "Factures Téléchargées", icon: ListChecks },
  { href: "/envoyees", label: "Factures Envoyées", icon: SendHorizontal },
  { href: "/import", label: "Import Excel", icon: FileSpreadsheet },
];

const ADMIN: NavItem[] = [
  {
    href: "/fne-annulations",
    label: "Annulations FNE",
    icon: Trash2,
    permission: ["audit.view", "fne.cancel_duplicate"],
  },
  { href: "/parametres", label: "Paramètres", icon: Settings, adminOnly: true },
];

export function Sidebar() {
  const pathname = usePathname();
  const { isAdmin, hasAnyPermission } = useAuth();

  const visibleAdmin = ADMIN.filter((it) => {
    if (it.adminOnly) return isAdmin;
    if (it.permission) {
      const codes = Array.isArray(it.permission) ? it.permission : [it.permission];
      return hasAnyPermission(codes);
    }
    return true;
  });

  return (
    <aside className="hidden md:flex w-60 shrink-0 border-r border-slate-200 bg-white flex-col">
      <div className="h-16 flex items-center justify-center border-b border-slate-200">
        <span className="text-lg font-bold text-blue-900 tracking-tight">E_Facture</span>
      </div>
      <nav className="flex-1 p-3 space-y-1">
        {PRIMARY.map((item) => (
          <NavLink key={item.href} item={item} active={pathname === item.href} />
        ))}

        {visibleAdmin.length > 0 && (
          <>
            <div className="px-3 pt-4 pb-1 text-[10px] uppercase tracking-wider text-slate-400 font-semibold">
              Administration
            </div>
            {visibleAdmin.map((item) => (
              <NavLink
                key={item.href}
                item={item}
                active={pathname === item.href || pathname.startsWith(`${item.href}/`)}
              />
            ))}
          </>
        )}
      </nav>
    </aside>
  );
}

function NavLink({ item, active }: { item: NavItem; active: boolean }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      className={cn(
        "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
        active
          ? "bg-blue-50 text-blue-700 font-medium"
          : "text-slate-700 hover:bg-slate-100",
      )}
    >
      <Icon className="h-4 w-4" />
      <span>{item.label}</span>
    </Link>
  );
}
