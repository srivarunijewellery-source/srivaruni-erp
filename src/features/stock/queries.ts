import { createClient } from "@/lib/supabase/server";
import type { StockRow } from "@/types/domain";

/**
 * stock_on_hand shows saleable stock only: real stores, active items.
 * Transit and damaged buckets are excluded at the view, so the counter
 * is never offered something it cannot sell.
 */
export async function searchStock(query: string): Promise<StockRow[]> {
  const supabase = await createClient();

  let q = supabase
    .from("stock_on_hand")
    .select("item_id, barcode, name, category, location_code, qty, selling_price_paise")
    .order("name")
    .limit(100);

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
