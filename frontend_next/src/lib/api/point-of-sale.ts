import { api } from "./client";
import { ENDPOINTS } from "./endpoints";
import type { PointOfSale } from "@/types";

export async function listPointsOfSale(): Promise<PointOfSale[]> {
  const { data } = await api.get<PointOfSale[]>(ENDPOINTS.POINT_OF_SALE.BASE);
  return Array.isArray(data) ? data : [];
}

export async function updatePointOfSaleStatus(
  id: number,
  active: boolean,
): Promise<PointOfSale> {
  const { data } = await api.put<{ success: boolean; data: PointOfSale }>(
    `${ENDPOINTS.POINT_OF_SALE.BASE}/${id}`,
    { active },
  );
  return data.data;
}

export async function bulkUpdatePointsOfSale(
  selections: Record<string | number, boolean>,
): Promise<{ success: boolean }> {
  const { data } = await api.post<{ success: boolean }>(
    ENDPOINTS.POINT_OF_SALE.BULK_UPDATE,
    { selections },
  );
  return data;
}
