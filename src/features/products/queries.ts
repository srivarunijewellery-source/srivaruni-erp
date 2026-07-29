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
  hsn: string | null;
  gstRate: number | null;
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
       mrp_paise, selling_price_paise, hsn, gst_rate,
       colour_id, plating_id, stone_id, size_id,
       categories(name), item_types(name),
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
      itemTypeName: (Array.isArray(r.item_types) ? r.item_types[0] : r.item_types)?.name ?? null,
      colourName: null,
      platingName: null,
      hsn: r.hsn,
      gstRate: r.gst_rate === null ? null : Number(r.gst_rate),
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

export interface ProductDetail extends ProductRow {
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
      `id, barcode, name, status, category_id, item_type_id, created_at,
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
    .select("landed_cost_paise")
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
    categoryId: data.category_id,
    categoryName: one(data.categories)?.name ?? "—",
    itemTypeId: data.item_type_id,
    itemTypeName: one(data.item_types)?.name ?? null,
    status: data.status,
    photoPath: photos.find((p) => p.is_primary)?.storage_path ?? photos[0]?.storage_path ?? null,
    mrpPaise: data.mrp_paise,
    sellingPricePaise: data.selling_price_paise,
    landedCostPaise: cost?.landed_cost_paise ?? null,
    onHand: balances.reduce((s, b) => s + b.qty, 0),
    createdAt: data.created_at,
    colourId: data.colour_id,
    platingId: data.plating_id,
    stoneId: data.stone_id,
    sizeId: data.size_id,
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
