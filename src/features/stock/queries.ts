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

  return (data ?? []).map((r) => ({
    itemId: r.item_id,
    barcode: r.barcode,
    name: r.name,
    category: r.category,
    locationCode: r.location_code,
    qty: r.qty,
    sellingPricePaise: r.selling_price_paise,
  }));
}
