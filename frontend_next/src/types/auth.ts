export type UserType = "admin" | "utilisateur";

export interface User {
  id_user: number;
  username: string;
  email?: string;
  fullName?: string;
  user_type: UserType;
  permissions: string[];
}

export interface LoginRequest {
  username: string;
  password: string;
}

export interface LoginResponse {
  success: boolean;
  message?: string;
  user: User;
  token?: string;
}
