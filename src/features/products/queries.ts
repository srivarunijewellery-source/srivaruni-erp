import { createClient } from "@/lib/supabase/server";
import type { ItemStatus, Paise } from "@/types/domain";

export interface ProductRow {
  id: string;
  barcode: string;
  name: string;
  categoryId: string;
  categoryName: string;
  itemTypeName: string | null;
  colourName: string | null;
  platingName: string | null;
  /** Size or colour — what tells two identical-looking pieces apart. */
  variant: string | null;
  hsn: string | null;
  gstRate: number | null;
  status: ItemStatus;
  photoPath: string | null;
  /** Null for anyone but the owner: RLS returns no cost rows to staff. */
  mrpPaise: Paise | null;
  sellingPricePaise: Paise | null;
  landedCostPaise: Paise | null;
  /** The bare vendor rate, before freight and packing were prorated in. */
  purchaseRatePaise: Paise | null;
  onHand: number;
  createdAt: string;
  colourId: string | null;
  platingId: string | null;
  stoneId: string | null;
  sizeId: string | null;
}

export interface ProductFilters {
  categoryId?: string;
  itemTypeId?: string;
  platingId?: string;
  /** Stone is how the old system's "brand" carried over, so it is one of
   *  the more useful cuts in this catalogue. */
  stoneId?: string;
  /** Recovered from the old material inward, so worth filtering on. */
  vendorId?: string;
  /** Selling price bounds, in paise. Either end may stand alone. */
  minPricePaise?: number;
  maxPricePaise?: number;
  status?: string;
  /** Only items with stock at this location. */
  locationId?: string;
  /** "in" for anything on hand, "out" for nothing on hand. */
  stock?: string;
}

/**
 * Catalog listing.
 *
 * Cost comes from item_latest_cost, a security_invoker view over the
 * owner-only item_costs table, so a staff session simply gets no rows
 * back and the column renders empty. The number never crosses the wire.
 *
 * The location filter is an inner join on stock_balances rather than a
 * post-filter: "show me what is in ZHB" has to exclude items held only
 * elsewhere, and filtering after a page has already been taken would
 * silently drop matches that fell below the cut.
 *
 * Paged, and it returns the TOTAL alongside the rows. The list was hard
 * capped at 200 with nothing on screen saying so, which at 6,547 items
 * meant the other 6,347 simply did not appear -- and a filter that
 * matched something on row 400 looked like a filter that matched
 * nothing.
 */
export async function listProducts(
  query: string,
  filters: ProductFilters = {},
  limit = 60,
  offset = 0,
): Promise<{
  rows: ProductRow[];
  total: number;
  /** Dearest priced item in the catalogue, for sizing a price slider.
   *  Unaffected by the current filters, so the track cannot shrink as
   *  someone drags it. */
  maxSellingPricePaise: number | null;
}> {
  const supabase = await createClient();

  // Two select shapes rather than one built by concatenation: joining
  // strings with + collapses the row type to an error type at compile
  // time, so each variant has to be its own literal.
  //
  // Size and colour are NOT embedded here, and must not be. Their
  // foreign keys are composite -- (size_key, size_id) references
  // attribute_options(attr_key, id) -- and PostgREST cannot resolve a
  // composite relationship from a single column hint. `size:size_id(value)`
  // threw PGRST200 "Could not find a relationship between 'items' and
  // 'size_id'" on every render, which is what took the whole page down
  // rather than just blanking a column. They are resolved below in one
  // extra indexed read, the same way the detail page has always done it.
  const WITH_LOCATION = `id, barcode, name, status, category_id, created_at,
       mrp_paise, selling_price_paise, hsn, gst_rate,
       colour_id, plating_id, stone_id, size_id,
       categories(name), item_types(name),
       item_photos(storage_path, is_primary, sort_order),
       stock_balances!inner(qty, location_id)` as const;

  const PLAIN = `id, barcode, name, status, category_id, created_at,
       mrp_paise, selling_price_paise, hsn, gst_rate,
       colour_id, plating_id, stone_id, size_id,
       categories(name), item_types(name),
       item_photos(storage_path, is_primary, sort_order),
       stock_balances(qty, location_id)` as const;

  // "In stock" becomes an inner join rather than a filter applied after
  // the page is fetched. Post-filtering a page is wrong the moment there
  // is more than one page: ask for in-stock items and you would get
  // however many of the first sixty happened to qualify.
  const needsStockJoin = Boolean(filters.locationId) || filters.stock === "in";

  let q = needsStockJoin
    ? supabase
        .from("items")
        .select(WITH_LOCATION, { count: "exact" })
        .gt("stock_balances.qty", 0)
        // Barcode descending: newest tag first. Codes run in sequence,
        // so this is creation order without trusting created_at, which
        // the migration set to the import date for thousands of pieces.
        // Unique, so it is also the stable paging key -- no row on two
        // pages, none lost between them.
        //
        // is_test leads only to sink the five UAT pieces: TEST- sorts
        // above SV in plain text order, so without it every screen
        // opens on rehearsal stock.
        .order("is_test")
        .order("barcode", { ascending: false })
        .range(offset, offset + limit - 1)
    : supabase
        .from("items")
        // count: exact gives the size of the whole match set, not the
        // page, which is what lets the UI say "of 6,547".
        .select(PLAIN, { count: "exact" })
        // Barcode descending: newest tag first. Codes run in sequence,
        // so this is creation order without trusting created_at, which
        // the migration set to the import date for thousands of pieces.
        // Unique, so it is also the stable paging key -- no row on two
        // pages, none lost between them.
        //
        // is_test leads only to sink the five UAT pieces: TEST- sorts
        // above SV in plain text order, so without it every screen
        // opens on rehearsal stock.
        .order("is_test")
        .order("barcode", { ascending: false })
        .range(offset, offset + limit - 1);

  if (needsStockJoin && filters.locationId) {
    q = q.eq("stock_balances.location_id", filters.locationId);
  }

  // Comma-separated ids from the URL: one uses eq, several use in. Kept
  // as a string so a multi-filtered view is still a shareable link.
  const many = (v?: string) => (v ?? "").split(",").filter(Boolean);
  const each: Array<[string, string | undefined]> = [
    ["category_id", filters.categoryId],
    ["item_type_id", filters.itemTypeId],
    ["plating_id", filters.platingId],
    ["stone_id", filters.stoneId],
    ["vendor_id", filters.vendorId],
  ];
  for (const [col, raw] of each) {
    const list = many(raw);
    if (list.length === 1) q = q.eq(col, list[0]);
    else if (list.length > 1) q = q.in(col, list);
  }
  if (filters.status) q = q.eq("status", filters.status);

  // Price bounds ignore unpriced items entirely rather than treating a
  // null as zero — an item awaiting pricing is not a cheap item, and
  // sweeping them into the bottom of every range would bury the answer.
  if (filters.minPricePaise !== undefined) {
    q = q.gte("selling_price_paise", filters.minPricePaise);
  }
  if (filters.maxPricePaise !== undefined) {
    q = q.lte("selling_price_paise", filters.maxPricePaise);
  }

  const term = query.trim();
  if (term) q = q.or(`barcode.ilike.%${term}%,name.ilike.%${term}%`);

  const { data, error, count } = await q;
  if (error) throw error;

  const ids = (data ?? []).map((r) => r.id);
  const costs = new Map<string, number>();
  const rates = new Map<string, number | null>();

  if (ids.length > 0) {
    const { data: costRows } = await supabase
      .from("item_latest_cost")
      .select("item_id, purchase_rate_paise, landed_cost_paise")
      .in("item_id", ids);
    for (const c of costRows ?? []) {
      costs.set(c.item_id, c.landed_cost_paise);
      rates.set(c.item_id, c.purchase_rate_paise);
    }
  }

  // Size and colour names, in one read rather than an embed.
  //
  // Two attribute ids per row at most and a page is sixty rows, so this
  // is a single indexed lookup on at most 120 ids -- cheaper than the
  // embed it replaces, which PostgREST could not resolve at all.
  const attrNames = new Map<string, string>();
  const attrIds = [
    ...new Set(
      (data ?? [])
        .flatMap((r) => [r.size_id, r.colour_id])
        .filter(Boolean) as string[],
    ),
  ];
  if (attrIds.length > 0) {
    const { data: attrs } = await supabase
      .from("attribute_options")
      .select("id, value")
      .in("id", attrIds);
    for (const a of attrs ?? []) attrNames.set(a.id, a.value);
  }

  const mapped = (data ?? []).map((r) => {
    const category = Array.isArray(r.categories) ? r.categories[0] : r.categories;
    const photos = (r.item_photos ?? []) as Array<{
      storage_path: string; is_primary: boolean; sort_order: number;
    }>;
    const primary =
      photos.find((p) => p.is_primary) ??
      [...photos].sort((a, b) => a.sort_order - b.sort_order)[0];
    const balances = (r.stock_balances ?? []) as Array<{ qty: number }>;

    return {
      id: r.id,
      barcode: r.barcode,
      name: r.name,
      categoryId: r.category_id,
      categoryName: category?.name ?? "—",
      itemTypeName: (Array.isArray(r.item_types) ? r.item_types[0] : r.item_types)?.name ?? null,
      colourName: null,
      platingName: null,
      // Size or colour: what tells two identical-looking pieces apart.
      // Size wins where a piece has both, because two bangles of one
      // design differ by size far more often than by colour.
      variant:
        (r.size_id ? attrNames.get(r.size_id) : null) ??
        (r.colour_id ? attrNames.get(r.colour_id) : null) ??
        null,
      hsn: r.hsn,
      gstRate: r.gst_rate === null ? null : Number(r.gst_rate),
      status: r.status,
      photoPath: primary?.storage_path ?? null,
      mrpPaise: r.mrp_paise,
      sellingPricePaise: r.selling_price_paise,
      landedCostPaise: costs.get(r.id) ?? null,
      purchaseRatePaise: rates.get(r.id) ?? null,
      onHand: balances.reduce((s, b) => s + b.qty, 0),
      createdAt: r.created_at,
      colourId: r.colour_id,
      platingId: r.plating_id,
      stoneId: r.stone_id,
      sizeId: r.size_id,
    };
  });

  // On hand is a sum across locations, so it cannot be a database
  // filter without a second round trip.
  // "In stock" was handled by the join above, so it is already exact.
  //
  // "Out of stock" is the awkward one: it means items with NO balance
  // row at all as well as rows at zero, which is a NOT EXISTS the query
  // builder cannot express. It is filtered here, on the page, and the
  // count is corrected to match so the pager never promises rows it
  // cannot deliver.
  // The dearest piece in the catalogue, so a price slider can size its
  // track to reality. Deliberately NOT affected by the current filters:
  // the track must not shrink as someone drags it.
  const { data: ceiling } = await supabase
    .from("items")
    .select("selling_price_paise")
    .not("selling_price_paise", "is", null)
    .order("selling_price_paise", { ascending: false })
    .limit(1)
    .maybeSingle();
  const maxSellingPricePaise = ceiling?.selling_price_paise ?? null;

  if (filters.stock === "out") {
    const outOnly = mapped.filter((r) => r.onHand <= 0);
    return { rows: outOnly, total: outOnly.length, maxSellingPricePaise };
  }

  return { rows: mapped, total: count ?? mapped.length, maxSellingPricePaise };
}

export interface ProductDetail extends ProductRow {
  description: string | null;
  itemTypeId: string | null;
  itemTypeName: string | null;
  colourName: string | null;
  platingName: string | null;
  stoneName: string | null;
  sizeName: string | null;
  hsn: string | null;
  gstRate: number | null;
  photos: Array<{ id: string; path: string; isPrimary: boolean }>;
  byLocation: Array<{ code: string; qty: number }>;
}

export async function getProduct(id: string): Promise<ProductDetail | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("items")
    .select(
      `id, barcode, name, description, status, category_id, item_type_id, created_at,
       mrp_paise, selling_price_paise, hsn, gst_rate,
       colour_id, plating_id, stone_id, size_id,
       categories(name), item_types(name),
       item_photos(id, storage_path, is_primary, sort_order),
       stock_balances(qty, locations(code))`,
    )
    .eq("id", id)
    .maybeSingle();

  if (error || !data) return null;

  const one = <T,>(v: T | T[] | null): T | undefined =>
    Array.isArray(v) ? v[0] : (v ?? undefined);

  const attrIds = [data.colour_id, data.plating_id, data.stone_id, data.size_id]
    .filter(Boolean) as string[];
  const attrNames = new Map<string, string>();
  if (attrIds.length > 0) {
    const { data: attrs } = await supabase
      .from("attribute_options")
      .select("id, value")
      .in("id", attrIds);
    for (const a of attrs ?? []) attrNames.set(a.id, a.value);
  }

  const { data: cost } = await supabase
    .from("item_latest_cost")
    .select("purchase_rate_paise, landed_cost_paise")
    .eq("item_id", id)
    .maybeSingle();

  const photos = (data.item_photos ?? []) as Array<{
    id: string; storage_path: string; is_primary: boolean; sort_order: number;
  }>;
  const balances = (data.stock_balances ?? []) as Array<{
    qty: number; locations: { code: string } | { code: string }[] | null;
  }>;

  return {
    id: data.id,
    barcode: data.barcode,
    name: data.name,
    description: data.description,
    categoryId: data.category_id,
    categoryName: one(data.categories)?.name ?? "—",
    itemTypeId: data.item_type_id,
    itemTypeName: one(data.item_types)?.name ?? null,
    status: data.status,
    photoPath: photos.find((p) => p.is_primary)?.storage_path ?? photos[0]?.storage_path ?? null,
    mrpPaise: data.mrp_paise,
    sellingPricePaise: data.selling_price_paise,
    landedCostPaise: cost?.landed_cost_paise ?? null,
    purchaseRatePaise: cost?.purchase_rate_paise ?? null,
    onHand: balances.reduce((s, b) => s + b.qty, 0),
    createdAt: data.created_at,
    colourId: data.colour_id,
    platingId: data.plating_id,
    stoneId: data.stone_id,
    sizeId: data.size_id,
    // The name behind size_id or colour_id, already resolved above.
    variant:
      (data.size_id ? attrNames.get(data.size_id) : null) ??
      (data.colour_id ? attrNames.get(data.colour_id) : null) ??
      null,
    colourName: data.colour_id ? attrNames.get(data.colour_id) ?? null : null,
    platingName: data.plating_id ? attrNames.get(data.plating_id) ?? null : null,
    stoneName: data.stone_id ? attrNames.get(data.stone_id) ?? null : null,
    sizeName: data.size_id ? attrNames.get(data.size_id) ?? null : null,
    hsn: data.hsn,
    gstRate: data.gst_rate === null ? null : Number(data.gst_rate),
    photos: photos
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((p) => ({ id: p.id, path: p.storage_path, isPrimary: p.is_primary })),
    byLocation: balances
      .filter((b) => b.qty !== 0)
      .map((b) => ({ code: one(b.locations)?.code ?? "—", qty: b.qty })),
  };
}

export interface ProductMovement {
  id: number;
  qtyDelta: number;
  reason: string;
  note: string | null;
  locationCode: string;
  createdAt: string;
  by: string | null;
  /** Sale figures, present only on 'sale' rows AND only for the owner.
   *  Null everywhere else -- a movement that is not a sale has no price,
   *  and a non-owner must not learn cost from a stock history page. */
  billNo: string | null;
  billId: string | null;
  customerId: string | null;
  customerName: string | null;
  soldPaise: number | null;
  costPaise: number | null;
  marginPaise: number | null;
}

export interface ProductSource {
  vendorId: string | null;
  vendorName: string | null;
  inwardId: string | null;
  docNo: string | null;
  receivedAt: string | null;
  /** Set when the piece was made in-house rather than bought in. */
  assemblyId: string | null;
}

/**
 * Every movement of one item, newest first, with what each sale made.
 *
 * The quantity alone answers "did it move". The owner's question is
 * "was it worth moving", which needs the price it actually went out at
 * — after whatever discount was given on that particular bill, which is
 * why this reads bill_lines rather than the item's selling price.
 *
 * Chronological, not by barcode: this is one item's history, so there
 * is only ever one barcode on the page and time is the only ordering
 * that means anything.
 *
 * `forOwner` is passed in rather than looked up here so the caller's
 * single role check governs the whole page. When false the money fields
 * are never fetched at all, so there is nothing to leak by accident.
 */
export async function getProductMovements(
  itemId: string,
  forOwner = false,
): Promise<ProductMovement[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("stock_ledger")
    .select(
      "id, qty_delta, reason, note, created_at, ref_type, ref_id, locations(code), staff:created_by(name)",
    )
    .eq("item_id", itemId)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) return [];
  const one = <T,>(v: T | T[] | null): T | undefined =>
    Array.isArray(v) ? v[0] : (v ?? undefined);

  const rows = data ?? [];

  // One extra query for all the sale rows, not one per row.
  const billIds = forOwner
    ? [...new Set(rows.filter((m) => m.ref_type === "bill" && m.ref_id).map((m) => m.ref_id as string))]
    : [];

  // Bill AND customer, because "it sold" is never the end of the
  // question — who bought it, and on which invoice, is what someone
  // actually wants next. Both were on screen as plain text with no way
  // through.
  const sale = new Map<
    string,
    {
      billNo: string;
      billId: string;
      customerId: string | null;
      customerName: string | null;
      sold: number;
      cost: number;
    }
  >();
  if (billIds.length > 0) {
    const [{ data: lines }, { data: cost }] = await Promise.all([
      supabase
        .from("bill_lines")
        .select(
          "bill_id, qty, line_total_paise, bills(bill_no, customer_id, customers(name))",
        )
        .eq("item_id", itemId)
        .in("bill_id", billIds),
      supabase
        .from("item_latest_cost")
        .select("landed_cost_paise")
        .eq("item_id", itemId)
        .maybeSingle(),
    ]);
    const unitCost = Number(cost?.landed_cost_paise ?? 0);
    for (const l of lines ?? []) {
      const b = one(l.bills as never) as
        | {
            bill_no: string;
            customer_id: string | null;
            customers?: { name: string } | Array<{ name: string }> | null;
          }
        | undefined;
      const cust = b?.customers ? one(b.customers as never) : null;
      sale.set(l.bill_id as string, {
        billNo: b?.bill_no ?? "—",
        billId: l.bill_id as string,
        customerId: b?.customer_id ?? null,
        customerName: (cust as { name: string } | null)?.name ?? null,
        sold: Number(l.line_total_paise ?? 0),
        cost: unitCost * Number(l.qty ?? 0),
      });
    }
  }

  return rows.map((m) => {
    const s = m.ref_type === "bill" && m.ref_id ? sale.get(m.ref_id as string) : undefined;
    return {
      id: m.id,
      qtyDelta: m.qty_delta,
      reason: m.reason,
      note: m.note,
      locationCode: one(m.locations)?.code ?? "—",
      createdAt: m.created_at,
      by: one(m.staff)?.name ?? null,
      billNo: s?.billNo ?? null,
      billId: s?.billId ?? null,
      customerId: s?.customerId ?? null,
      // Null customer means a walk-in, which is a fact worth showing
      // rather than an empty cell.
      customerName: s?.customerName ?? null,
      soldPaise: s?.sold ?? null,
      costPaise: s?.cost ?? null,
      marginPaise: s ? s.sold - s.cost : null,
    };
  });
}

/** Which vendor supplied this item, via its one inward. */
export async function getProductSource(itemId: string): Promise<ProductSource> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("inward_lines")
    .select("inward_id, inwards(doc_no, approved_at, vendor_id, vendors(name))")
    .eq("item_id", itemId)
    .maybeSingle();

  const one = <T,>(v: T | T[] | null): T | undefined =>
    Array.isArray(v) ? v[0] : (v ?? undefined);

  type RawVendor = { name: string };
  type RawInward = {
    doc_no: string;
    approved_at: string | null;
    vendor_id: string;
    vendors: RawVendor | RawVendor[] | null;
  };

  const inw = one<RawInward>(
    (data?.inwards ?? null) as RawInward | RawInward[] | null,
  );
  const vendor = one<RawVendor>(inw?.vendors ?? null);

  if (data?.inward_id) {
    return {
      vendorId: inw?.vendor_id ?? null,
      vendorName: vendor?.name ?? null,
      inwardId: data.inward_id,
      docNo: inw?.doc_no ?? null,
      receivedAt: inw?.approved_at ?? null,
      assemblyId: null,
    };
  }

  // Not on any inward — but it may have been made here rather than
  // bought. The card was saying "created in the catalog and not yet
  // received", which is true of an assembled piece only in the narrowest
  // sense and useless to anyone reading it.
  const { data: asm } = await supabase
    .from("assembly_items")
    .select("assembly_id, assemblies(doc_no, approved_at)")
    .eq("item_id", itemId)
    .maybeSingle();

  if (asm?.assembly_id) {
    const a = one<{ doc_no: string; approved_at: string | null }>(
      (asm.assemblies ?? null) as never,
    );
    return {
      vendorId: null,
      vendorName: null,
      inwardId: null,
      docNo: a?.doc_no ?? null,
      receivedAt: a?.approved_at ?? null,
      assemblyId: asm.assembly_id,
    };
  }

  return {
    vendorId: null,
    vendorName: null,
    inwardId: null,
    docNo: null,
    receivedAt: null,
    assemblyId: null,
  };
}

export interface CostBreakdown {
  inwardId: string;
  docNo: string;
  vendorName: string;
  qty: number;
  /** Vendor's gross rate per unit, before anything is applied. */
  ratePaise: number;
  /** This line's share of the bill-level discount, for the whole line. */
  discountPaise: number;
  taxablePaise: number;
  taxPaise: number;
  /** True when GST is reclaimable, so it is excluded from landed cost. */
  itcEligible: boolean;
  /** This line's share of freight, packing and the like, for the line. */
  additionalPaise: number;
  landedUnitCostPaise: number;
}

/**
 * Where a product's landed cost actually came from.
 *
 * The product page used to show one net figure, which is impossible to
 * argue with: a cost that looks wrong gives no clue whether the rate,
 * the bill discount or the freight split is responsible. This returns
 * the components so the arithmetic is visible.
 */
export async function getCostBreakdown(itemId: string): Promise<CostBreakdown | null> {
  const supabase = await createClient();

  // item_costs is owner-only at the RLS level, so a staff session gets
  // nothing here and the caller renders no card at all.
  const { data: cost } = await supabase
    .from("item_costs")
    .select("source_inward_id")
    .eq("item_id", itemId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!cost?.source_inward_id) return null;

  const { data: line } = await supabase
    .from("inward_lines")
    .select(
      `qty,
       inwards(id, doc_no, vendors(name)),
       inward_line_costs(rate_paise, discount_paise, taxable_paise,
                         cgst_paise, sgst_paise, igst_paise,
                         allocated_addl_paise, landed_unit_cost_paise)`,
    )
    .eq("item_id", itemId)
    .eq("inward_id", cost.source_inward_id)
    .limit(1)
    .maybeSingle();

  if (!line) return null;

  const inward = Array.isArray(line.inwards) ? line.inwards[0] : line.inwards;
  const vendor = inward && (Array.isArray(inward.vendors) ? inward.vendors[0] : inward.vendors);
  const c = Array.isArray(line.inward_line_costs)
    ? line.inward_line_costs[0]
    : line.inward_line_costs;
  if (!c || !inward) return null;

  const { data: header } = await supabase
    .from("inward_header_costs")
    .select("itc_eligible")
    .eq("inward_id", cost.source_inward_id)
    .maybeSingle();

  return {
    inwardId: inward.id,
    docNo: inward.doc_no,
    vendorName: vendor?.name ?? "Unknown vendor",
    qty: Number(line.qty ?? 0),
    ratePaise: Number(c.rate_paise ?? 0),
    discountPaise: Number(c.discount_paise ?? 0),
    taxablePaise: Number(c.taxable_paise ?? 0),
    taxPaise: Number(c.cgst_paise ?? 0) + Number(c.sgst_paise ?? 0) + Number(c.igst_paise ?? 0),
    itcEligible: Boolean(header?.itc_eligible),
    additionalPaise: Number(c.allocated_addl_paise ?? 0),
    landedUnitCostPaise: Number(c.landed_unit_cost_paise ?? 0),
  };
}

export interface TransferPosition {
  locationCode: string;
  locationName: string;
  onHand: number;
  requested: number;
  picked: number;
  approved: number;
  inTransit: number;
  /** What the store will hold once everything committed has gone. */
  netAfter: number;
}

/**
 * Where this item stands against transfers, per store.
 *
 * On hand alone hides the box by the door. A request does NOT reduce
 * availability — the piece is still on the shelf and still sellable —
 * but everything from picking onward is spoken for, and selling it means
 * the transfer arrives short.
 *
 * Stock physically leaves at dispatch, so "in transit" is already out of
 * the on-hand figure. Requested, picked and approved are not, which is
 * exactly why they need showing.
 */
export async function getTransferPosition(
  itemId: string,
): Promise<TransferPosition[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("item_transfer_state")
    .select("location_id, qty_requested, qty_picked, qty_approved, qty_in_transit")
    .eq("item_id", itemId);

  if (error || !data || data.length === 0) return [];

  const { data: stock } = await supabase
    .from("stock_balances")
    .select("location_id, qty, locations(code, name)")
    .eq("item_id", itemId);

  const held = new Map(
    (stock ?? []).map((s) => {
      const l = (Array.isArray(s.locations) ? s.locations[0] : s.locations) as
        | { code: string; name: string }
        | undefined;
      return [s.location_id as string, { qty: Number(s.qty ?? 0), loc: l }];
    }),
  );

  return data.map((r) => {
    const s = held.get(r.location_id as string);
    const onHand = s?.qty ?? 0;
    const requested = Number(r.qty_requested ?? 0);
    const picked = Number(r.qty_picked ?? 0);
    const approved = Number(r.qty_approved ?? 0);

    return {
      locationCode: s?.loc?.code ?? "—",
      locationName: s?.loc?.name ?? "—",
      onHand,
      requested,
      picked,
      approved,
      inTransit: Number(r.qty_in_transit ?? 0),
      // Requested is excluded on purpose: it has not been committed to
      // anything yet and may never be picked.
      netAfter: onHand - picked - approved,
    };
  });
}

export interface TransferActivity {
  transferId: string;
  docNo: string;
  status: string;
  stage: string;
  happenedAt: string;
  qty: number;
  fromCode: string;
  toCode: string;
  reason: string;
  unavailableReason: string | null;
  actor: string;
}

/**
 * Where this piece has been in the transfer flow.
 *
 * The movement list reads the stock ledger, and a transfer only writes
 * there at dispatch — so a piece requested on Monday and picked on
 * Tuesday showed nothing until it physically left. Anyone asking "why
 * isn't this on the shelf" got no answer from the page built to answer
 * exactly that.
 */
export async function getTransferActivity(
  itemId: string,
): Promise<TransferActivity[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("product_transfer_activity", {
    p_item: itemId,
  });
  if (error || !data) return [];

  return (data as Array<Record<string, unknown>>).map((r) => ({
    transferId: String(r.transfer_id),
    docNo: String(r.doc_no),
    status: String(r.status),
    stage: String(r.stage),
    happenedAt: String(r.happened_at),
    qty: Number(r.qty ?? 0),
    fromCode: String(r.from_code),
    toCode: String(r.to_code),
    reason: String(r.reason ?? ""),
    unavailableReason: (r.unavailable_reason as string | null) ?? null,
    actor: String(r.actor ?? ""),
  }));
}
