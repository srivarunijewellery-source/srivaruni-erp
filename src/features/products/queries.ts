import { createClient } from "@/lib/supabase/server";
import type { ItemStatus, Paise } from "@/types/domain";

export interface ProductRow {
  id: string;
  barcode: string;
  name: string;
  categoryId: string;
  categoryName: string;
  status: ItemStatus;
  photoPath: string | null;
  /** Null for anyone but the owner: RLS returns no cost rows to staff. */
  mrpPaise: Paise | null;
  sellingPricePaise: Paise | null;
  landedCostPaise: Paise | null;
  onHand: number;
  createdAt: string;
  colourId: string | null;
  platingId: string | null;
  stoneId: string | null;
  sizeId: string | null;
}

/**
 * Catalog listing.
 *
 * Cost comes from item_latest_cost, a security_invoker view over the
 * owner-only item_costs table, so a staff session simply gets no rows
 * back and the column renders empty. The number never crosses the wire.
 */
export async function listProducts(query: string): Promise<ProductRow[]> {
  const supabase = await createClient();

  let q = supabase
    .from("items")
    .select(
      `id, barcode, name, status, category_id, created_at,
       mrp_paise, selling_price_paise,
       colour_id, plating_id, stone_id, size_id,
       categories(name),
       item_photos(storage_path, is_primary, sort_order),
       stock_balances(qty)`,
    )
    .order("created_at", { ascending: false })
    .limit(200);

  const term = query.trim();
  if (term) q = q.or(`barcode.ilike.%${term}%,name.ilike.%${term}%`);

  const { data, error } = await q;
  if (error) throw error;

  const ids = (data ?? []).map((r) => r.id);
  const costs = new Map<string, number>();

  if (ids.length > 0) {
    const { data: costRows } = await supabase
      .from("item_latest_cost")
      .select("item_id, landed_cost_paise")
      .in("item_id", ids);
    for (const c of costRows ?? []) costs.set(c.item_id, c.landed_cost_paise);
  }

  return (data ?? []).map((r) => {
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
      status: r.status,
      photoPath: primary?.storage_path ?? null,
      mrpPaise: r.mrp_paise,
      sellingPricePaise: r.selling_price_paise,
      landedCostPaise: costs.get(r.id) ?? null,
      onHand: balances.reduce((s, b) => s + b.qty, 0),
      createdAt: r.created_at,
      colourId: r.colour_id,
      platingId: r.plating_id,
      stoneId: r.stone_id,
      sizeId: r.size_id,
    };
  });
}
