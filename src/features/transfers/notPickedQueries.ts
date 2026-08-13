import { createClient } from "@/lib/supabase/server";
import type { NotPickedRow } from "./notPickedTypes";

export type { NotPickedRow } from "./notPickedTypes";

/**
 * Asked for on a transfer, never found, still on the shelf.
 *
 * The recoverable misses: the request said send it, the picker did not
 * find it, and it is at the origin store right now. Nothing here is a
 * loss yet — but left alone the receiving store is simply short and
 * nobody looks again.
 *
 * Anything sold since drops out on its own, because the query requires
 * the stock to still be there.
 */
export async function listNotPicked(
  locationId?: string,
): Promise<NotPickedRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("transfer_not_picked", {
    p_location: locationId ?? null,
    p_category: null,
    p_style: null,
  });
  if (error || !data) return [];

  return (data as Array<Record<string, unknown>>).map((r) => ({
    itemId: String(r.item_id),
    barcode: String(r.barcode),
    name: String(r.name),
    category: String(r.category),
    style: String(r.style),
    photoPath: (r.photo_path as string | null) ?? null,
    sellingPricePaise: Number(r.selling_price_paise ?? 0),
    missed: Number(r.missed ?? 0),
    onShelf: Number(r.on_shelf ?? 0),
    valuePaise: Number(r.value_paise ?? 0),
    docNo: String(r.doc_no),
    reason: String(r.reason ?? ""),
    fromCode: String(r.from_code),
    toCode: String(r.to_code),
    pickedAt: (r.picked_at as string | null) ?? null,
  }));
}
