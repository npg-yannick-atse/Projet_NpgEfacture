import { cookies } from "next/headers";
import type { User } from "@/types";

const SESSION_COOKIE = "ef_session";
const SESSION_MAX_AGE = 60 * 60 * 8; // 8h

export async function getServerSession(): Promise<User | null> {
  const store = await cookies();
  const raw = store.get(SESSION_COOKIE)?.value;
  if (!raw) return null;
  try {
    return JSON.parse(raw) as User;
  } catch {
    return null;
  }
}

export async function setServerSession(user: User): Promise<void> {
  const store = await cookies();
  store.set({
    name: SESSION_COOKIE,
    value: JSON.stringify(user),
    httpOnly: true,
    sameSite: "lax",
    // Only set secure=true if explicitly enabled — otherwise the cookie is
    // dropped on HTTP localhost / HTTP intranet deploys, which produces the
    // exact "every action redirects me to login" symptom.
    secure: process.env.EF_SECURE_COOKIE === "1",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
}

export async function clearServerSession(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

export const SESSION_COOKIE_NAME = SESSION_COOKIE;
