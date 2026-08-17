import { createClient } from "@/lib/supabase/server";
import type { StockRow } from "@/types/domain";

/**
 * stock_on_hand shows saleable stock only: real stores, active items.
 * Transit and damaged buckets are excluded at the view, so the counter
 * is never offered something it cannot sell.
 */
export interface StockFilters {
  q?: string;
  /** Location id, not code: codes are display text and can be edited. */
  location?: string;
  category?: string;
  itemType?: string;
  /** Comma-separated, like the others. */
  style?: string;
  plating?: string;
  vendor?: string;
  /**
   * Categories to leave OUT, comma-separated.
   *
   * The opposite question from the include filter, and the more common
   * one on a shelf this size: "everything except raw material" is a
   * sentence someone says, and ticking sixty-three categories to express
   * it is not a filter anyone uses twice.
   */
  exCategory?: string;
}

/** What the stock filter bar can offer, built from what is actually held. */
export interface StockFacets {
  categories: string[];
  itemTypes: string[];
  styles: string[];
  platings: string[];
  vendors: string[];
  locations: Array<{ id: string; code: string; name: string }>;
}

/**
 * The distinct values present in saleable stock right now.
 *
 * Read from the stock view rather than from the master tables so the
 * dropdowns never offer a category nothing is held in -- picking one and
 * getting an empty table teaches people the filters are broken.
 */
/**
 * The values worth offering in the filters.
 *
 * Aggregated in the database, not scraped from a page of rows. It used
 * to read stock_on_hand with .limit(5000) and build the dropdowns from
 * whatever came back — but PostgREST caps a response at 1000, so it saw
 * a thousand Zaheerabad rows and offered ZHB as the only store.
 * Categories and styles were truncated the same way, which nobody
 * noticed because a shorter list still looks like a list.
 */
export async function getStockFacets(): Promise<StockFacets> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("stock_facets");
  if (error || !data) {
    return { categories: [], itemTypes: [], styles: [], platings: [], vendors: [], locations: [] };
  }

  const d = data as {
    categories?: string[];
    itemTypes?: string[];
    styles?: string[];
    platings?: string[];
    vendors?: string[];
    locations?: Array<{ id: string; code: string; name: string }>;
  };

  return {
    categories: d.categories ?? [],
    itemTypes: d.itemTypes ?? [],
    styles: d.styles ?? [],
    platings: d.platings ?? [],
    vendors: d.vendors ?? [],
    locations: d.locations ?? [],
  };
}

export interface CategoryTotal {
  category: string;
  designs: number;
  pieces: number;
  retailPaise: number;
  costPaise: number;
}

/**
 * What the filtered stock is worth, by category.
 *
 * Answers two different questions from one call — where the money sits,
 * and where the bulk sits. They rarely have the same answer, and
 * computing them separately is how two screens end up disagreeing.
 */
export async function getStockByCategory(
  filters: StockFilters = {},
  query = "",
  limit = 15,
): Promise<CategoryTotal[]> {
  const supabase = await createClient();
  const many = (v?: string) => {
    const list = (v ?? "").split(",").filter(Boolean);
    return list.length ? list : null;
  };

  const { data, error } = await supabase.rpc("stock_by_category", {
    p_location: filters.location || null,
    p_categories: many(filters.category),
    p_styles: many(filters.style),
    p_ex_categories: many(filters.exCategory),
    // Vendor and plating were missing here, so picking a vendor narrowed
    // the cards while the category panels above them carried on
    // describing the whole shelf.
    p_platings: many(filters.plating),
    p_vendors: many(filters.vendor),
    p_query: query.trim() || null,
    p_limit: limit,
  });
  if (error || !data) return [];

  return (data as Array<Record<string, unknown>>).map((r) => ({
    category: String(r.category),
    designs: Number(r.designs ?? 0),
    pieces: Number(r.pieces ?? 0),
    retailPaise: Number(r.retail_paise ?? 0),
    costPaise: Number(r.cost_paise ?? 0),
  }));
}

export async function searchStock(
  query: string,
  filters: StockFilters = {},
  limit = 60,
  offset = 0,
): Promise<{ rows: StockRow[]; total: number }> {
  const supabase = await createClient();

  let q = supabase
    .from("stock_on_hand")
    .select(
      "item_id, barcode, name, category, item_type, style, variant, photo_path, location_id, location_code, qty, selling_price_paise",
      { count: "exact" },
    )
    // Barcode descending -- newest tag first, and unique, so it is the
    // stable paging key as well: a row cannot appear on two pages or on
    // none. Name was neither, and two pieces sharing a name put the
    // pager quietly out of step with itself.
    //
    // location_code second so an item held at both stores keeps its two
    // rows together instead of interleaving with its neighbours.
    //
    // No is_test guard needed here: stock_on_hand already excludes test
    // pieces at the view.
    .order("barcode", { ascending: false })
    .order("location_code")
    .range(offset, offset + limit - 1);

  if (filters.location) q = q.eq("location_id", filters.location);
  // Comma-separated from the URL: one value uses eq, several use in.
  // Kept as one string rather than an array so a filtered view stays a
  // link someone can paste to a colleague.
  const many = (v?: string) => (v ?? "").split(",").filter(Boolean);
  const cats = many(filters.category);
  const types = many(filters.itemType);
  if (cats.length === 1) q = q.eq("category", cats[0]);
  else if (cats.length > 1) q = q.in("category", cats);
  if (types.length === 1) q = q.eq("item_type", types[0]);
  else if (types.length > 1) q = q.in("item_type", types);
  const exCats = many(filters.exCategory);
  if (exCats.length > 0) {
    // PostgREST spells NOT IN as a negated in-filter.
    q = q.not("category", "in", `(${exCats.map((c) => `"${c}"`).join(",")})`);
  }

  for (const [col, raw] of [
    ["style", filters.style],
    ["plating", filters.plating],
    ["vendor", filters.vendor],
  ] as Array<[string, string | undefined]>) {
    const list = many(raw);
    if (list.length === 1) q = q.eq(col, list[0]);
    else if (list.length > 1) q = q.in(col, list);
  }

  const term = query.trim();
  if (term) {
    // Barcode match first, then a trigram-backed name search.
    q = q.or(`barcode.ilike.%${term}%,name.ilike.%${term}%`);
  }

  const { data, error, count } = await q;
  if (error) throw error;

  // The view carries the primary photo now, so the separate lookup that
  // used to sit here is gone — it was a second round trip that also
  // risked the oversized `.in()` problem once a store holds more than a
  // few hundred lines.
  const rows = (data ?? []).map((r) => ({
    itemId: r.item_id,
    photoPath: r.photo_path ?? null,
    style: r.style ?? null,
    variant: r.variant ?? null,
    barcode: r.barcode,
    name: r.name,
    category: r.category,
    locationCode: r.location_code,
    qty: r.qty,
    sellingPricePaise: r.selling_price_paise,
  }));

  return { rows, total: count ?? rows.length };
}
