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
}

/** What the stock filter bar can offer, built from what is actually held. */
export interface StockFacets {
  categories: string[];
  itemTypes: string[];
  styles: string[];
  locations: Array<{ id: string; code: string; name: string }>;
}

/**
 * The distinct values present in saleable stock right now.
 *
 * Read from the stock view rather than from the master tables so the
 * dropdowns never offer a category nothing is held in -- picking one and
 * getting an empty table teaches people the filters are broken.
 */
export async function getStockFacets(): Promise<StockFacets> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("stock_on_hand")
    .select("category, item_type, style, location_id, location_code, location_name")
    .limit(5000);

  if (error) return { categories: [], itemTypes: [], styles: [], locations: [] };

  const categories = new Set<string>();
  const itemTypes = new Set<string>();
  const styles = new Set<string>();
  const locations = new Map<string, { id: string; code: string; name: string }>();

  for (const r of data ?? []) {
    if (r.category) categories.add(r.category);
    if (r.item_type) itemTypes.add(r.item_type);
    if (r.style) styles.add(r.style);
    if (r.location_id && !locations.has(r.location_id)) {
      locations.set(r.location_id, {
        id: r.location_id,
        code: r.location_code,
        name: r.location_name,
      });
    }
  }

  return {
    categories: [...categories].sort(),
    itemTypes: [...itemTypes].sort(),
    styles: [...styles].sort(),
    locations: [...locations.values()].sort((a, b) => a.code.localeCompare(b.code)),
  };
}

/**
 * A page of stock, and how much there is in total.
 *
 * It used to return a flat 200 rows with a note saying "narrow the
 * filters to see more", which is the system telling the person to work
 * around it. With three and a half thousand lines at Boduppal, "show me
 * every bangle" was simply unanswerable.
 *
 * `count: "exact"` gives the size of the whole match set rather than the
 * page, so the pager knows how many pages exist without a second query.
 */
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
      "item_id, barcode, name, category, item_type, style, photo_path, location_id, location_code, qty, selling_price_paise",
      { count: "exact" },
    )
    // item_id as a tiebreaker: two rows can share a name, and without a
    // stable second key their order is undefined between queries — so a
    // row can appear on two pages or on none.
    .order("name")
    .order("item_id")
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
  const sty = many(filters.style);
  if (sty.length === 1) q = q.eq("style", sty[0]);
  else if (sty.length > 1) q = q.in("style", sty);

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
    barcode: r.barcode,
    name: r.name,
    category: r.category,
    locationCode: r.location_code,
    qty: r.qty,
    sellingPricePaise: r.selling_price_paise,
  }));

  return { rows, total: count ?? rows.length };
}
