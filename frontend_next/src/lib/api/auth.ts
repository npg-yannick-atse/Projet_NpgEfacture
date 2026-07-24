import { api } from "./client";
import { ENDPOINTS } from "./endpoints";
import type { LoginRequest, LoginResponse } from "@/types";

export async function login(payload: LoginRequest): Promise<LoginResponse> {
  const { data } = await api.post<LoginResponse>(ENDPOINTS.AUTH.LOGIN, payload);
  return data;
}
