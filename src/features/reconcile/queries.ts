import type { ReconRow, ReconIssue, LedgerEntry } from "./types";
import { createClient } from "@/lib/supabase/server";

// Re-exported so server callers have one import site.
export type { ReconRow, ReconIssue, LedgerEntry } from "./types";
export { ISSUE_LABEL } from "./types";

/**
 * What needs a person to look at it.
 *
 * Four distinct faults, each with its own cause and its own correct
 * answer — a piece that never arrived is not the same problem as one
 * sold twice. They are kept apart rather than summed into a single
 * "variance", which is how discrepancies survive for months.
 */
export async function listReconciliation(locationId?: string): Promise<ReconRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("stock_reconciliation", {
    p_location: locationId ?? null,
  });
  if (error) return [];

  return ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
    issue: r.issue as ReconIssue,
    itemId: String(r.item_id),
    barcode: String(r.barcode),
    itemName: String(r.item_name),
    locationCode: (r.location_code as string | null) ?? null,
    onHand: Number(r.on_hand ?? 0),
    committed: Number(r.committed ?? 0),
    delta: Number(r.delta ?? 0),
    detail: String(r.detail ?? ""),
    lastMoved: (r.last_moved as string | null) ?? null,
  }));
}

/**
 * The item's own ledger, which is where the root cause actually lives.
 *
 * A running balance is computed as we go: the fault is almost always
 * visible as the moment the total first goes wrong, and reading raw
 * deltas means doing that arithmetic in your head down forty rows.
 */
export async function getItemLedger(
  itemId: string,
  locationCode?: string | null,
): Promise<LedgerEntry[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("stock_ledger")
    .select("created_at, qty_delta, reason, ref_type, ref_id, locations(code)")
    .eq("item_id", itemId)
    .order("created_at", { ascending: true })
    .limit(80);

  if (error || !data) return [];

  let running = 0;
  return data
    .filter((r) => {
      if (!locationCode) return true;
      const l = (Array.isArray(r.locations) ? r.locations[0] : r.locations) as
        | { code: string }
        | undefined;
      return l?.code === locationCode;
    })
    .map((r) => {
      running += Number(r.qty_delta ?? 0);
      return {
        at: String(r.created_at),
        qtyDelta: Number(r.qty_delta ?? 0),
        reason: String(r.reason ?? ""),
        refType: (r.ref_type as string | null) ?? null,
        docNo: null,
        runningQty: running,
      };
    });
}
