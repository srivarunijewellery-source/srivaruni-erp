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
}

/** What the stock filter bar can offer, built from what is actually held. */
export interface StockFacets {
  categories: string[];
  itemTypes: string[];
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
    .select("category, item_type, location_id, location_code, location_name")
    .limit(5000);

  if (error) return { categories: [], itemTypes: [], locations: [] };

  const categories = new Set<string>();
  const itemTypes = new Set<string>();
  const locations = new Map<string, { id: string; code: string; name: string }>();

  for (const r of data ?? []) {
    if (r.category) categories.add(r.category);
    if (r.item_type) itemTypes.add(r.item_type);
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
    locations: [...locations.values()].sort((a, b) => a.code.localeCompare(b.code)),
  };
}

export async function searchStock(
  query: string,
  filters: StockFilters = {},
): Promise<StockRow[]> {
  const supabase = await createClient();

  let q = supabase
    .from("stock_on_hand")
    .select(
      "item_id, barcode, name, category, item_type, location_id, location_code, qty, selling_price_paise",
    )
    .order("name")
    .limit(200);

  if (filters.location) q = q.eq("location_id", filters.location);
  if (filters.category) q = q.eq("category", filters.category);
  if (filters.itemType) q = q.eq("item_type", filters.itemType);

  const term = query.trim();
  if (term) {
    // Barcode match first, then a trigram-backed name search.
    q = q.or(`barcode.ilike.%${term}%,name.ilike.%${term}%`);
  }

  const { data, error } = await q;
  if (error) throw error;

  // Photos come from a second read rather than a join: stock_on_hand is a
  // view and item_photos is one-to-many, so joining would multiply the
  // stock rows and quietly double the on-hand figures.
  const ids = (data ?? []).map((r) => r.item_id);
  const photos = new Map<string, string>();

  if (ids.length > 0) {
    const { data: photoRows } = await supabase
      .from("item_photos")
      .select("item_id, storage_path, is_primary, sort_order")
      .in("item_id", ids)
      .order("is_primary", { ascending: false })
      .order("sort_order");

    for (const p of photoRows ?? []) {
      if (!photos.has(p.item_id)) photos.set(p.item_id, p.storage_path);
    }
  }

  return (data ?? []).map((r) => ({
    itemId: r.item_id,
    photoPath: photos.get(r.item_id) ?? null,
    barcode: r.barcode,
    name: r.name,
    category: r.category,
    locationCode: r.location_code,
    qty: r.qty,
    sellingPricePaise: r.selling_price_paise,
  }));
}
