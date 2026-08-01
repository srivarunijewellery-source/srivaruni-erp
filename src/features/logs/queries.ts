import { createClient } from "@/lib/supabase/server";

export interface AuditEntry {
  id: number;
  tableName: string;
  rowId: string | null;
  action: "INSERT" | "UPDATE" | "DELETE";
  changedAt: string;
  changedByName: string | null;
  changedByRole: string | null;
  /** Field-level diff for updates. Null for inserts and deletes. */
  changes: Record<string, { from: unknown; to: unknown }> | null;
}

/** Tables carrying the trigger, for the filter dropdown. */
export const AUDITED_TABLES = [
  "inwards",
  "inward_lines",
  "inward_additional_costs",
  "items",
  "vendors",
  "transfers",
  "transfer_lines",
  "stock_adjustments",
  "customers",
  "coupons",
  "coupon_batches",
  "label_settings",
] as const;

export async function listAuditEntries(opts: {
  table?: string;
  action?: string;
  limit?: number;
} = {}): Promise<AuditEntry[]> {
  const supabase = await createClient();

  let q = supabase
    .from("audit_log_readable")
    .select("id, table_name, row_id, action, changed_at, changed_by_name, changed_by_role, changes")
    .order("changed_at", { ascending: false })
    .limit(opts.limit ?? 100);

  if (opts.table) q = q.eq("table_name", opts.table);
  if (opts.action) q = q.eq("action", opts.action);

  // Inherits audit_log's RLS, which is owner-only: a non-owner gets an
  // empty list rather than an error, so the page must say so itself.
  const { data, error } = await q;
  if (error) throw error;

  return (data ?? []).map((r) => ({
    id: Number(r.id),
    tableName: r.table_name,
    rowId: r.row_id,
    action: r.action,
    changedAt: r.changed_at,
    changedByName: r.changed_by_name,
    changedByRole: r.changed_by_role,
    changes: r.changes,
  }));
}
