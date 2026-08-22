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

/**
 * Move a piece from one niche to another.
 *
 * Onto a neck with room, it joins as the second piece -- that is how a
 * long and a short come to share a neck. Onto a full one, the two trade
 * places, because dragging one piece onto another is how somebody says
 * "these should swap" and a refusal there would mean emptying a niche
 * first every single time.
 */
export async function moveDisplayPiece(
  placementId: string,
  toBlockId: string,
): Promise<Result<{ from: string; to: string; swapped: boolean }>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("move_display_piece", {
    p_placement: placementId,
    p_to_block: toBlockId,
  });
  if (error) return err(toMessage(error));
  const r = (data ?? {}) as Record<string, unknown>;
  revalidatePath(ROUTES.display);
  return ok({
    from: String(r.from ?? ""),
    to: String(r.to ?? ""),
    swapped: Boolean(r.swapped),
  });
}

/**
 * Hang a whole armful at once, one per neck, in reading order.
 *
 * Choosing thirty pieces and then choosing thirty positions is two
 * jobs. This does the boring one and leaves the arranging to a drag.
 */
export async function placeManyOnDisplay(
  sectionId: string,
  itemIds: string[],
): Promise<Result<{ placed: number; skipped: number }>> {
  if (itemIds.length === 0) return err("Pick some pieces first.");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("place_many_on_display", {
    p_section: sectionId,
    p_items: itemIds,
  });
  if (error) return err(toMessage(error));
  const r = (data ?? {}) as Record<string, unknown>;
  revalidatePath(ROUTES.display);
  return ok({ placed: Number(r.placed ?? 0), skipped: Number(r.skipped ?? 0) });
}

export interface LayoutSlot {
  block_id: string;
  item_id: string;
  slot: number;
}

/**
 * Write a whole section's arrangement at once.
 *
 * Every drag used to be its own save plus a page refresh, and a refresh
 * landing mid-gesture overwrote what the person was still doing -- moves
 * arriving late, and once a piece disappearing entirely. Rearranging a
 * wall is ONE decision made over a couple of minutes, so the screen
 * keeps a working copy and this writes the result.
 *
 * Only what changed is touched, so a piece that has not moved keeps its
 * history stint.
 */
export async function applyDisplayLayout(
  sectionId: string,
  layout: LayoutSlot[],
): Promise<Result<{ removed: number; added: number }>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("apply_display_layout", {
    p_section: sectionId,
    p_layout: layout,
  });
  if (error) return err(toMessage(error));
  const r = (data ?? {}) as Record<string, unknown>;
  revalidatePath(ROUTES.display);
  return ok({ removed: Number(r.removed ?? 0), added: Number(r.added ?? 0) });
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

/** Rename a run of rack. Owner only, enforced in the database. */
export async function renameDisplaySection(
  sectionId: string,
  name: string,
): Promise<Result<void>> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("rename_display_section", {
    p_section: sectionId,
    p_name: name,
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
  filters: {
    q?: string;
    category?: string;
    style?: string;
    plating?: string;
    vendor?: string;
    minPaise?: number;
    maxPaise?: number;
  } = {},
): Promise<Result<PickableItem[]>> {
  const supabase = await createClient();

  // One round trip, and the exclusion happens in the database.
  //
  // This used to read stock_on_hand and then drop already-placed pieces
  // in JS. Two problems: that view joins categories, three attribute
  // tables and vendors and runs a photo lookup per row -- ~150ms to fill
  // a picker showing six fields -- and filtering AFTER the limit meant a
  // page of already-hanging pieces came back empty instead of showing
  // the next hundred.
  const { data, error } = await supabase.rpc("display_pick_candidates", {
    p_location: locationId,
    p_query: filters.q?.trim() || null,
    p_category: filters.category || null,
    p_style: filters.style || null,
    p_plating: filters.plating || null,
    p_vendor: filters.vendor || null,
    p_min_paise: filters.minPaise ?? null,
    p_max_paise: filters.maxPaise ?? null,
    p_limit: 120,
  });
  if (error) return err(toMessage(error));

  return ok(
    ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
      itemId: String(r.item_id),
      barcode: String(r.barcode),
      name: String(r.name),
      categoryName: String(r.category ?? "—"),
      variant: (r.variant as string | null) ?? null,
      photoPath: (r.photo_path as string | null) ?? null,
      sellingPricePaise:
        r.selling_price_paise === null ? null : Number(r.selling_price_paise),
      onHand: Number(r.qty_here ?? 0),
    })),
  );
}
