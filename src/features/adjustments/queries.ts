import { createClient } from "@/lib/supabase/server";

export interface AdjustmentRow {
  id: string;
  docNo: string;
  kind: string;
  status: string;
  locationCode: string;
  reason: string | null;
  createdAt: string;
  approvedAt: string | null;
  createdBy: string | null;
  lines: Array<{
    itemId: string;
    barcode: string;
    name: string;
    qtyDelta: number;
    note: string | null;
  }>;
}

/**
 * Every stock correction, wherever it came from.
 *
 * Covers documents raised on the shop floor and quantity edits typed on
 * the Products page, because the latter raises a real adjustment rather
 * than writing a balance. One list, one audit trail.
 */
export async function listAdjustments(): Promise<AdjustmentRow[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("stock_adjustments")
    .select(
      `id, doc_no, kind, status, reason_note, created_at, approved_at,
       locations(code), staff:created_by(name),
       stock_adjustment_lines(item_id, qty_delta, note,
                              items(barcode, name))`,
    )
    .order("created_at", { ascending: false })
    .limit(150);

  if (error) return [];

  const one = <T,>(v: T | T[] | null): T | undefined =>
    Array.isArray(v) ? v[0] : (v ?? undefined);

  return (data ?? []).map((a) => ({
    id: a.id,
    docNo: a.doc_no,
    kind: a.kind,
    status: a.status,
    locationCode: one(a.locations)?.code ?? "—",
    reason: a.reason_note,
    createdAt: a.created_at,
    approvedAt: a.approved_at,
    createdBy: one(a.staff)?.name ?? null,
    lines: ((a.stock_adjustment_lines ?? []) as Array<{
      item_id: string;
      qty_delta: number;
      note: string | null;
      items: { barcode: string; name: string } | { barcode: string; name: string }[] | null;
    }>).map((l) => {
      const item = one(l.items);
      return {
        itemId: l.item_id,
        barcode: item?.barcode ?? "—",
        name: item?.name ?? "Unknown item",
        qtyDelta: l.qty_delta,
        note: l.note,
      };
    }),
  }));
}

export interface LedgerMovement {
  id: number;
  itemId: string;
  barcode: string;
  name: string;
  locationCode: string;
  qtyDelta: number;
  reason: string;
  note: string | null;
  createdAt: string;
  by: string | null;
}

/** Raw ledger, filtered to corrections and losses. The document list
 *  above is the summary; this is what actually moved. */
export async function listCorrectionMovements(): Promise<LedgerMovement[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("stock_ledger")
    .select(
      `id, item_id, qty_delta, reason, note, created_at,
       items(barcode, name), locations(code), staff:created_by(name)`,
    )
    .in("reason", ["adjustment", "damage", "count_variance"])
    .order("created_at", { ascending: false })
    .limit(150);

  if (error) return [];

  const one = <T,>(v: T | T[] | null): T | undefined =>
    Array.isArray(v) ? v[0] : (v ?? undefined);

  return (data ?? []).map((r) => ({
    id: r.id,
    itemId: r.item_id,
    barcode: one(r.items)?.barcode ?? "—",
    name: one(r.items)?.name ?? "Unknown item",
    locationCode: one(r.locations)?.code ?? "—",
    qtyDelta: r.qty_delta,
    reason: r.reason,
    note: r.note,
    createdAt: r.created_at,
    by: one(r.staff)?.name ?? null,
  }));
}
