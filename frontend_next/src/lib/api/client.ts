import axios, { AxiosInstance, InternalAxiosRequestConfig } from "axios";

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://10.10.32.2:6050";

interface ApiIdentity {
  id_user?: number;
  username?: string | null;
}

let currentIdentity: ApiIdentity | null = null;

/**
 * Set synchronously by AuthProvider during render. This avoids the race where
 * children effects fire API calls before the parent's effect populates
 * localStorage, which caused 401 → redirect-to-login on the first click.
 */
export function setApiIdentity(identity: ApiIdentity | null): void {
  currentIdentity = identity;
  if (typeof window !== "undefined") {
    if (identity) {
      window.localStorage.setItem("user", JSON.stringify(identity));
    } else {
      window.localStorage.removeItem("user");
    }
  }
}

function readClientUser(): ApiIdentity | null {
  if (currentIdentity) return currentIdentity;
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem("user");
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ApiIdentity;
    currentIdentity = parsed;
    return parsed;
  } catch {
    return null;
  }
}

function attachIdentityHeaders(config: InternalAxiosRequestConfig) {
  const user = readClientUser();
  if (!user) return config;
  config.headers = config.headers ?? {};
  if (user.id_user != null) {
    config.headers["id_user"] = String(user.id_user);
    config.headers["id-user"] = String(user.id_user);
  }
  if (user.username) {
    config.headers["username"] = user.username;
  }
  return config;
}

function createApi(): AxiosInstance {
  const instance = axios.create({
    baseURL: API_BASE_URL,
    timeout: 60_000,
  });

  instance.interceptors.request.use(attachIdentityHeaders);

  instance.interceptors.response.use(
    (res) => res,
    (error) => {
      // Only redirect to login on a real authenticated 401 — i.e. when we did
      // send identity headers and the backend still rejected us. Otherwise the
      // first API call after login (before identity is wired) would bounce the
      // user out.
      if (
        typeof window !== "undefined" &&
        error.response?.status === 401 &&
        currentIdentity?.id_user != null &&
        !window.location.pathname.startsWith("/login")
      ) {
        window.location.href = "/login";
      }
      return Promise.reject(error);
    },
  );

  return instance;
}

export const api = createApi();

export function extractError(err: unknown): string {
  if (axios.isAxiosError(err)) {
    return (
      err.response?.data?.message ??
      err.response?.data?.error ??
      err.message ??
      "Erreur inconnue"
    );
  }
  if (err instanceof Error) return err.message;
  return "Erreur inconnue";
}
