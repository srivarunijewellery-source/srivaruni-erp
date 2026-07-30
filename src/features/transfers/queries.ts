import { createClient } from "@/lib/supabase/server";
import type {
  PickableItem,
  TransferDetail,
  TransferLine,
  TransferSummary,
  TransitBox,
  TransitRow,
} from "@/types/domain";

type Supabase = Awaited<ReturnType<typeof createClient>>;

/**
 * Photos are always fetched separately, never joined.
 *
 * item_photos is one-to-many, so embedding it in a query that also carries
 * a quantity multiplies the rows and silently doubles the counts. That bit
 * us once on stock_on_hand; the rule now is that anything with a qty gets
 * its photos in a second read.
 */
async function photoMap(supabase: Supabase, itemIds: string[]): Promise<Map<string, string>> {
  const photos = new Map<string, string>();
  if (itemIds.length === 0) return photos;

  const { data } = await supabase
    .from("item_photos")
    .select("item_id, storage_path, is_primary, sort_order")
    .in("item_id", itemIds)
    .order("is_primary", { ascending: false })
    .order("sort_order");

  for (const p of data ?? []) {
    if (!photos.has(p.item_id)) photos.set(p.item_id, p.storage_path);
  }
  return photos;
}

/** PostgREST returns a to-one embed as an object, but types allow an array. */
function one<T>(v: T | T[] | null | undefined): T | null {
  if (!v) return null;
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

export async function listTransfers(): Promise<TransferSummary[]> {
  const supabase = await createClient();

  // transfer_pipeline is a security_invoker view, so RLS still applies.
  const { data, error } = await supabase
    .from("transfer_pipeline")
    .select("*")
    .order("requested_at", { ascending: false, nullsFirst: false })
    .limit(100);

  if (error) throw error;

  return (data ?? []).map((t) => ({
    id: t.id,
    docNo: t.doc_no,
    status: t.status,
    fromCode: t.from_code,
    toCode: t.to_code,
    reason: t.reason,
    lines: Number(t.lines ?? 0),
    qtySent: Number(t.qty_sent ?? 0),
    qtyReceived: Number(t.qty_received ?? 0),
    requestedAt: t.requested_at,
    receivedAt: t.received_at,
  }));
}

/**
 * One transfer with everything the pick, dispatch and receive screens need.
 *
 * Deliberately several small reads rather than one deep embed: transfers
 * has two foreign keys into locations, so a nested select would have to be
 * disambiguated by constraint name, which breaks silently if a constraint
 * is ever renamed. A few cheap indexed reads are easier to keep correct.
 */
export async function getTransfer(id: string): Promise<TransferDetail | null> {
  const supabase = await createClient();

  const { data: t, error } = await supabase
    .from("transfers")
    // One string literal, never concatenation: PostgREST parses the select
    // at the type level, and a built-up string collapses the row type to an
    // error type that only surfaces as noise at every field access.
    .select(
      `id, doc_no, status, from_location_id, to_location_id, reason, note,
       pick_note, rejected_reason, courier, docket_no, requested_at,
       picked_at, approved_at, dispatched_at, received_at`,
    )
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;
  if (!t) return null;

  const [{ data: locs }, { data: lineRows }] = await Promise.all([
    supabase
      .from("locations")
      .select("id, code, name")
      .in("id", [t.from_location_id, t.to_location_id]),
    supabase
      .from("transfer_lines")
      .select(
        `id, item_id, qty_requested, qty_picked, qty_sent, qty_received,
         items(barcode, name, selling_price_paise, categories(name))`,
      )
      .eq("transfer_id", id),
  ]);

  const from = (locs ?? []).find((l) => l.id === t.from_location_id);
  const to = (locs ?? []).find((l) => l.id === t.to_location_id);

  const itemIds = (lineRows ?? []).map((l) => l.item_id as string);

  // What the sending store actually holds right now, so the picker sees a
  // request that already exceeds the shelf before scanning a single tag.
  const [photos, balanceResult] = await Promise.all([
    photoMap(supabase, itemIds),
    itemIds.length
      ? supabase
          .from("stock_balances")
          .select("item_id, qty")
          .eq("location_id", t.from_location_id)
          .in("item_id", itemIds)
      : Promise.resolve({ data: [] }),
  ]);

  const available = new Map(
    ((balanceResult.data ?? []) as { item_id: string; qty: number }[]).map((b) => [
      b.item_id,
      b.qty,
    ]),
  );

  const lines: TransferLine[] = (lineRows ?? [])
    .map((l): TransferLine => {
      const item = one(l.items as never) as
        | {
            barcode: string;
            name: string;
            selling_price_paise: number | null;
            categories: { name: string } | { name: string }[] | null;
          }
        | null;
      const cat = one(item?.categories);

      return {
        id: l.id,
        itemId: l.item_id,
        barcode: item?.barcode ?? "",
        name: item?.name ?? "Unknown item",
        category: cat?.name ?? "—",
        photoPath: photos.get(l.item_id) ?? null,
        sellingPricePaise: item?.selling_price_paise ?? null,
        qtyRequested: Number(l.qty_requested ?? 0),
        qtyPicked: Number(l.qty_picked ?? 0),
        qtySent: Number(l.qty_sent ?? 0),
        qtyReceived: l.qty_received === null ? null : Number(l.qty_received),
        qtyAvailable: Number(available.get(l.item_id) ?? 0),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  return {
    id: t.id,
    docNo: t.doc_no,
    status: t.status,
    fromLocationId: t.from_location_id,
    fromCode: from?.code ?? "—",
    fromName: from?.name ?? "—",
    toLocationId: t.to_location_id,
    toCode: to?.code ?? "—",
    toName: to?.name ?? "—",
    reason: t.reason,
    note: t.note,
    pickNote: t.pick_note,
    rejectedReason: t.rejected_reason,
    courier: t.courier,
    docketNo: t.docket_no,
    requestedAt: t.requested_at,
    pickedAt: t.picked_at,
    approvedAt: t.approved_at,
    dispatchedAt: t.dispatched_at,
    receivedAt: t.received_at,
    lines,
  };
}

/**
 * Everything currently between two stores.
 *
 * These units belong to no location: they have left the source ledger and
 * have not landed at the destination. The transient state is the point.
 */
export async function listTransitStock(): Promise<TransitRow[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("stock_in_transit")
    .select("*")
    .order("dispatched_at", { ascending: true });

  if (error) throw error;

  const photos = await photoMap(
    supabase,
    (data ?? []).map((r) => r.item_id as string),
  );

  return (data ?? []).map((r) => ({
    transferId: r.transfer_id,
    docNo: r.doc_no,
    itemId: r.item_id,
    barcode: r.barcode,
    itemName: r.item_name,
    category: r.category,
    photoPath: photos.get(r.item_id) ?? null,
    qty: Number(r.qty ?? 0),
    sellingPricePaise: r.selling_price_paise,
    fromCode: r.from_code,
    toCode: r.to_code,
    courier: r.courier,
    docketNo: r.docket_no,
    dispatchedAt: r.dispatched_at,
    daysInTransit: Number(r.days_in_transit ?? 0),
  }));
}

export async function listTransitBoxes(): Promise<TransitBox[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("transit_summary")
    .select("*")
    .order("dispatched_at", { ascending: true });

  if (error) throw error;

  return (data ?? []).map((b) => ({
    transferId: b.transfer_id,
    docNo: b.doc_no,
    fromCode: b.from_code,
    toCode: b.to_code,
    lines: Number(b.lines ?? 0),
    qtyInTransit: Number(b.qty_in_transit ?? 0),
    valuePaise: Number(b.value_paise ?? 0),
    courier: b.courier,
    docketNo: b.docket_no,
    dispatchedAt: b.dispatched_at,
    daysInTransit: Number(b.days_in_transit ?? 0),
    overdue: Boolean(b.overdue),
  }));
}

/**
 * Candidates for the request screen's tile grid: what the sending store
 * actually has on the shelf, filtered the way a person would think about
 * it — by category, or by typing part of a name or barcode.
 */
export async function listPickableStock(
  fromLocationCode: string,
  opts: { query?: string; category?: string; limit?: number } = {},
): Promise<PickableItem[]> {
  const supabase = await createClient();

  let q = supabase
    .from("stock_on_hand")
    .select("item_id, barcode, name, category, qty, selling_price_paise")
    .eq("location_code", fromLocationCode)
    .gt("qty", 0)
    .order("name")
    .limit(opts.limit ?? 120);

  const term = opts.query?.trim();
  if (term) q = q.or(`barcode.ilike.%${term}%,name.ilike.%${term}%`);
  if (opts.category) q = q.eq("category", opts.category);

  const { data, error } = await q;
  if (error) throw error;

  const photos = await photoMap(
    supabase,
    (data ?? []).map((r) => r.item_id as string),
  );

  return (data ?? []).map((r) => ({
    itemId: r.item_id,
    barcode: r.barcode,
    name: r.name,
    category: r.category,
    photoPath: photos.get(r.item_id) ?? null,
    qtyAvailable: Number(r.qty ?? 0),
    sellingPricePaise: r.selling_price_paise,
  }));
}

/** Distinct categories held at a store, for the request screen's filter. */
export async function listStockCategories(fromLocationCode: string): Promise<string[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("stock_on_hand")
    .select("category")
    .eq("location_code", fromLocationCode)
    .gt("qty", 0);

  if (error) throw error;

  return [...new Set((data ?? []).map((r) => r.category as string))].sort();
}
