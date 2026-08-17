import { createClient } from "@/lib/supabase/server";
import type {
  PickableItem,
  StockFilterOptions,
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

  // Deduplicated and chunked, because `.in()` becomes a query STRING.
  //
  // PostgREST puts the whole list in the URL, and a UUID is 36
  // characters: the transit page passes 783 item ids, which is a ~28KB
  // URL. The server rejects it, `data` comes back null, and every
  // photo silently disappears — no error anywhere, just grey squares.
  //
  // 200 ids is roughly 7KB, comfortably inside every proxy's limit.
  const unique = [...new Set(itemIds)];
  const CHUNK = 200;

  for (let i = 0; i < unique.length; i += CHUNK) {
    const { data } = await supabase
      .from("item_photos")
      .select("item_id, storage_path, is_primary, sort_order")
      .in("item_id", unique.slice(i, i + CHUNK))
      .order("is_primary", { ascending: false })
      .order("sort_order");

    for (const p of data ?? []) {
      if (!photos.has(p.item_id)) photos.set(p.item_id, p.storage_path);
    }
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
 * Candidates for the request tile grid.
 *
 * This is an RPC, not a select(), because the filters need a lateral join
 * against stock_ledger to compute "days since this item last arrived at
 * this store" per row -- not expressible through the query builder, and
 * a client-side join would mean pulling every ledger row for every item.
 * The function runs security invoker, so RLS applies exactly as it would
 * to a hand-written query; nothing is bypassed by moving it into SQL.
 */
export async function listPickableStock(
  locationId: string,
  opts: {
    query?: string;
    category?: string;
    itemType?: string;
    plating?: string;
    inStockOnly?: boolean;
    minAgeDays?: number;
    limit?: number;
    stone?: string;
    /** Exactly this many on the shelf. "Show me the threes" is a real
     *  question when deciding what to move: a three splits, a one does not. */
    qty?: number;
    excludeCategories?: string[];
    excludeStones?: string[];
    excludePlatings?: string[];
    offset?: number;
    /** Only pieces with nothing committed to another open transfer. */
    freeOnly?: boolean;
  } = {},
): Promise<{ items: PickableItem[]; total: number }> {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("list_pickable_stock", {
    p_location: locationId,
    p_query: opts.query?.trim() || null,
    p_category: opts.category || null,
    p_item_type: opts.itemType || null,
    p_plating: opts.plating || null,
    p_in_stock_only: opts.inStockOnly ?? true,
    p_min_age_days: opts.minAgeDays ?? null,
    p_limit: opts.limit ?? 60,
    p_stone: opts.stone || null,
    p_qty: opts.qty ?? null,
    // Empty arrays would exclude nothing but still cost a comparison per
    // row, so they go over as null.
    p_exclude_categories: opts.excludeCategories?.length ? opts.excludeCategories : null,
    p_exclude_stones: opts.excludeStones?.length ? opts.excludeStones : null,
    p_exclude_platings: opts.excludePlatings?.length ? opts.excludePlatings : null,
    p_offset: opts.offset ?? 0,
    p_free_only: opts.freeOnly ?? false,
  });

  if (error) throw error;

  // list_pickable_stock is not in the generated Database types (the last
  // db:types run predates it), so the client falls back to `unknown` here.
  // Annotated by hand rather than regenerating types for one query.
  type Row = {
    item_id: string;
    barcode: string;
    name: string;
    category: string;
    item_type: string | null;
    plating: string | null;
    stone: string | null;
    photo_path: string | null;
    selling_price_paise: number | null;
    qty_available: number;
    age_days: number | null;
    total_count: number;
    committed: number;
    vendor: string | null;
    mrp_paise: number | null;
    landed_cost_paise: number | null;
  };

  const rows = (data ?? []) as Row[];

  return {
    // The window function repeats the total on every row, so any row
    // carries it. Zero rows means zero matches.
    total: Number(rows[0]?.total_count ?? 0),
    items: rows.map((r) => ({
    itemId: r.item_id,
    barcode: r.barcode,
    name: r.name,
    category: r.category,
    itemType: r.item_type,
    plating: r.plating,
    photoPath: r.photo_path,
    qtyAvailable: Number(r.qty_available ?? 0),
      ageDays: r.age_days === null ? null : Number(r.age_days),
      sellingPricePaise: r.selling_price_paise,
      stone: r.stone,
      vendor: r.vendor,
      committed: Number(r.committed ?? 0),
      mrpPaise: r.mrp_paise,
      landedCostPaise: r.landed_cost_paise,
    })),
  };
}

/**
 * Filter choices scoped to what a store actually holds, so the dropdowns
 * never offer a category or plating that returns an empty grid.
 */
export async function listStockFilterOptions(locationId: string): Promise<StockFilterOptions> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .rpc("list_stock_filter_options", { p_location: locationId })
    .single();

  if (error) throw error;

  const row = data as {
    categories: string[]; item_types: string[]; platings: string[]; stones: string[];
  } | null;

  return {
    categories: row?.categories ?? [],
    itemTypes: row?.item_types ?? [],
    platings: row?.platings ?? [],
    stones: row?.stones ?? [],
  };
}

export interface TransferHistoryRow {
  stage: string;
  happenedAt: string;
  actor: string;
  actorRole: string;
}

/**
 * Who did what to this transfer, and when.
 *
 * Every stage was already stamped in the document — requested_by,
 * picked_by, approved_by and the rest — but none of it was shown, so
 * "who approved this" meant asking someone about a record that had held
 * the answer all along.
 */
export async function getTransferHistory(
  transferId: string,
): Promise<TransferHistoryRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("transfer_history", {
    p_transfer: transferId,
  });
  if (error || !data) return [];

  return (data as Array<Record<string, unknown>>).map((r) => ({
    stage: String(r.stage),
    happenedAt: String(r.happened_at),
    actor: String(r.actor ?? "—"),
    actorRole: String(r.actor_role ?? ""),
  }));
}
