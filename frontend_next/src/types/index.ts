export * from "./auth";
export * from "./facture";
export * from "./fne";
export * from "./fne-duplicates";
export * from "./fne-payload";
export * from "./lists";
export * from "./settings";

export interface ApiResponse<T = unknown> {
  success: boolean;
  message?: string;
  data: T;
}

export interface ApiListResponse<T = unknown> {
  success: boolean;
  message?: string;
  data: T[];
  total?: number;
  page?: number;
  pageSize?: number;
}
