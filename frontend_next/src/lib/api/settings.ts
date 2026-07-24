import { api } from "./client";
import { ENDPOINTS } from "./endpoints";
import type {
  AdminUser,
  ApiListResponse,
  ApiResponse,
  LdapUser,
  Role,
  UserType,
} from "@/types";

export async function getMe() {
  const { data } = await api.get<ApiResponse<{ id_user: number; username: string; user_type: UserType; permissions: string[] }>>(
    ENDPOINTS.SETTINGS.ME,
  );
  return data.data;
}

export async function listRoles(): Promise<Role[]> {
  const { data } = await api.get<ApiListResponse<Role>>(ENDPOINTS.SETTINGS.ROLES);
  return data.data ?? [];
}

export async function listUsers(): Promise<AdminUser[]> {
  const { data } = await api.get<ApiListResponse<AdminUser>>(ENDPOINTS.SETTINGS.USERS);
  return data.data ?? [];
}

export async function listLdapUsers(search?: string): Promise<LdapUser[]> {
  const { data } = await api.get<ApiListResponse<LdapUser>>(
    ENDPOINTS.SETTINGS.LDAP_USERS,
    { params: search ? { search } : undefined },
  );
  return data.data ?? [];
}

export async function addUser(payload: {
  id_user: number;
  username?: string | null;
  user_type?: UserType;
}): Promise<AdminUser> {
  const { data } = await api.post<ApiResponse<AdminUser>>(
    ENDPOINTS.SETTINGS.USERS,
    payload,
  );
  return data.data;
}

export async function updateUserType(
  idUser: number,
  user_type: UserType,
): Promise<AdminUser> {
  const { data } = await api.put<ApiResponse<AdminUser>>(
    ENDPOINTS.SETTINGS.USER_TYPE(idUser),
    { user_type },
  );
  return data.data;
}

export async function setUserRoles(idUser: number, codes: string[]): Promise<AdminUser> {
  const { data } = await api.put<ApiResponse<AdminUser>>(
    ENDPOINTS.SETTINGS.USER_ROLES(idUser),
    { codes },
  );
  return data.data;
}

export async function removeUser(idUser: number): Promise<{ success: boolean }> {
  const { data } = await api.delete<{ success: boolean }>(
    ENDPOINTS.SETTINGS.USER(idUser),
  );
  return data;
}
