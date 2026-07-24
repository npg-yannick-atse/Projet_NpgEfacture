"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Eye, EyeOff, Lock, LogIn, User as UserIcon } from "lucide-react";
import { loginAction, type LoginActionState } from "@/lib/auth/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";

const initialState: LoginActionState = {};

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [state, formAction, pending] = useActionState(loginAction, initialState);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    if (state?.ok) {
      const target = searchParams.get("from") || "/";
      router.replace(target);
      router.refresh();
    }
  }, [state, router, searchParams]);

  return (
    <div className="relative z-10 w-full max-w-md">
      <div className="rounded-2xl bg-white/90 backdrop-blur-xl shadow-2xl border border-white/30 p-8 sm:p-10">
        <div className="flex flex-col items-center mb-6">
          <div className="h-14 w-14 rounded-full bg-blue-600 flex items-center justify-center shadow-lg mb-3">
            <LogIn className="h-6 w-6 text-white" />
          </div>
          <h1 className="text-3xl font-extrabold text-blue-900 tracking-tight">
            E_Facture
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Gestion intelligente des factures SAP
          </p>
        </div>

        {state?.error ? (
          <div className="mb-4 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">
            {state.error}
          </div>
        ) : null}

        <form action={formAction} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="username">Nom d&apos;utilisateur</Label>
            <div className="relative">
              <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                id="username"
                name="username"
                autoComplete="username"
                required
                autoFocus
                className="pl-9"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="password">Mot de passe</Label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                id="password"
                name="password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                required
                className="pl-9 pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-500 hover:text-slate-700"
                tabIndex={-1}
                aria-label={showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <Button
            type="submit"
            disabled={pending}
            size="lg"
            className="w-full mt-2 shadow-lg shadow-blue-600/30"
          >
            {pending ? <Spinner className="h-5 w-5" /> : "Se connecter au portail"}
          </Button>
        </form>

        <p className="mt-6 text-center text-xs text-slate-500">
          © {new Date().getFullYear()} Gandour — Version 2.0
        </p>
      </div>
    </div>
  );
}
