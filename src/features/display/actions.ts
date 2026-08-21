"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { ROUTES } from "@/config/nav";
import { err, ok, toMessage, type Result } from "@/lib/result";

export interface Placed {
  block: string;
  slot: number;
  barcode: string;
  name: string;
  used: number;
  capacity: number;
}

/**
 * Hang a piece on a neck.
 *
 * Every rule lives in the database: in stock at this branch, not already
 * hanging somewhere else, and within the block's capacity. Refusals name
 * the place a piece is already displayed, because "already on display"
 * on its own sends someone hunting the whole wall.
 */
export async function placeOnDisplay(
  blockId: string,
  barcode: string,
): Promise<Result<Placed>> {
  const tag = barcode.trim();
  if (!tag) return err("Scan or pick a piece first.");

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("place_on_display", {
    p_block: blockId,
    p_barcode: tag,
    p_slot: null,
  });
  if (error) return err(toMessage(error));

  revalidatePath(ROUTES.display);
  const r = data as Record<string, unknown>;
  return ok({
    block: String(r.block),
    slot: Number(r.slot),
    barcode: String(r.barcode),
    name: String(r.name),
    used: Number(r.used),
    capacity: Number(r.capacity),
  });
}

/** Take a piece off. Only for a deliberate change -- a sold piece
 *  releases its own niche. */
export async function clearDisplaySlot(placementId: string): Promise<Result<void>> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("clear_display_slot", {
    p_placement: placementId,
  });
  if (error) return err(toMessage(error));
  revalidatePath(ROUTES.display);
  return ok(undefined);
}

export interface PickableItem {
  itemId: string;
  barcode: string;
  name: string;
  categoryName: string;
  variant: string | null;
  photoPath: string | null;
  sellingPricePaise: number | null;
  onHand: number;
}

/**
 * What can go on the rack: in stock at this branch, not already hanging.
 *
 * Same filters as the products page, because that is the vocabulary
 * people already use to find a piece -- category, style, a search box.
 * Reusing the words matters more than reusing the component.
 */
export async function searchForDisplay(
  locationId: string,
  filters: { q?: string; category?: string; style?: string } = {},
): Promise<Result<PickableItem[]>> {
  const supabase = await createClient();

  let q = supabase
    .from("stock_on_hand")
    .select("item_id, barcode, name, category, style, variant, photo_path, selling_price_paise, qty")
    .eq("location_id", locationId)
    .gt("qty", 0)
    .order("barcode", { ascending: false })
    .limit(120);

  if (filters.category) q = q.eq("category", filters.category);
  if (filters.style) q = q.eq("style", filters.style);
  const term = filters.q?.trim();
  if (term) q = q.or(`barcode.ilike.%${term}%,name.ilike.%${term}%`);

  const { data, error } = await q;
  if (error) return err(toMessage(error));

  // Anything already hanging is dropped: a piece is in one place, and
  // offering it again only produces a refusal a moment later.
  const { data: placed } = await supabase
    .from("item_on_display")
    .select("item_id")
    .eq("location_id", locationId);
  const taken = new Set((placed ?? []).map((p) => p.item_id as string));

  return ok(
    (data ?? [])
      .filter((r) => !taken.has(r.item_id as string))
      .map((r) => ({
        itemId: r.item_id as string,
        barcode: r.barcode as string,
        name: r.name as string,
        categoryName: (r.category as string) ?? "—",
        variant: (r.variant as string | null) ?? null,
        photoPath: (r.photo_path as string | null) ?? null,
        sellingPricePaise:
          r.selling_price_paise === null ? null : Number(r.selling_price_paise),
        onHand: Number(r.qty ?? 0),
      })),
  );
}
