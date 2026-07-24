export type DuplicateCategory =
  | "SAME_REFERENCE"
  | "DIFFERENT_REFERENCE"
  | "MIXED"
  | "NO_REFERENCE";

export interface FneDuplicateEntry {
  fne_invoice_id: string;
  fne_reference: string | null;
  fne_ncc: string | null;
  amount: number | null;
  created_at: string;
  cancelled: boolean;
  cancellation_reference: string | null;
  cancelled_at: string | null;
  cancelled_by: string | null;
  cancellation_reason: string | null;
}

export interface FneDuplicateGroup {
  numero_facture: string;
  nb_entries: number;
  category: DuplicateCategory;
  entries: FneDuplicateEntry[];
  treated: boolean;
  has_any_cancelled: boolean;
  all_cancelled: boolean;
}
