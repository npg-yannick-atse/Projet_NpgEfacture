"use server";

import { redirect } from "next/navigation";
import { authApi } from "@/lib/api";
import { extractError } from "@/lib/api/client";
import { clearServerSession, setServerSession } from "./session";
import type { User } from "@/types";

export interface LoginActionState {
  ok?: boolean;
  error?: string;
  user?: User;
}

export async function loginAction(
  _prev: LoginActionState | undefined,
  formData: FormData,
): Promise<LoginActionState> {
  const username = String(formData.get("username") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!username || !password) {
    return { error: "Nom d'utilisateur et mot de passe requis." };
  }

  try {
    const res = await authApi.login({ username, password });
    if (!res.success || !res.user) {
      return { error: res.message ?? "Identifiants invalides." };
    }
    await setServerSession(res.user);
    return { ok: true, user: res.user };
  } catch (err) {
    return { error: extractError(err) };
  }
}

export async function logoutAction(): Promise<void> {
  await clearServerSession();
  redirect("/login");
}
