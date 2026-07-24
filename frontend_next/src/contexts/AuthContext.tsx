"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { setApiIdentity } from "@/lib/api/client";
import type { User } from "@/types";

interface AuthContextValue {
  user: User | null;
  isAdmin: boolean;
  hasPermission: (code: string) => boolean;
  hasAnyPermission: (codes: string[]) => boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({
  initialUser,
  children,
}: {
  initialUser: User | null;
  children: ReactNode;
}) {
  // Synchronously wire the API identity on the first client render so that
  // any child useEffect that fires an API call sees the right headers,
  // even before the parent's own effect has run.
  const synced = useRef(false);
  if (!synced.current && typeof window !== "undefined") {
    setApiIdentity(initialUser);
    synced.current = true;
  }

  const [user, setUser] = useState<User | null>(initialUser);

  useEffect(() => {
    setUser(initialUser);
    setApiIdentity(initialUser);
  }, [initialUser]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isAdmin: user?.user_type === "admin",
      hasPermission: (code: string) =>
        Array.isArray(user?.permissions) && user.permissions.includes(code),
      hasAnyPermission: (codes: string[]) =>
        Array.isArray(user?.permissions) &&
        codes.some((c) => user.permissions.includes(c)),
    }),
    [user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
