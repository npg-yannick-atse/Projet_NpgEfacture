export interface Role {
  id: number;
  code: string;
  label?: string;
  description?: string;
  category?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface AdminUser {
  id_user: number;
  username: string | null;
  user_type: "admin" | "utilisateur";
  permissions: string[];
  createdAt?: string;
}

export interface LdapUser {
  id_user: number;
  username: string | null;
  name: string;
  email: string | null;
  matricule: string | null;
  actif: number;
  already_added?: boolean;
}

export interface PointOfSale {
  id: number;
  libelle: string;
  description?: string | null;
  active: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface InvoiceTypeFull {
  id: number;
  code: string;
  label: string;
  icon_name?: string | null;
  color_hex?: string | null;
  display_order?: number;
  active: boolean;
  createdAt?: string;
  updatedAt?: string;
}
