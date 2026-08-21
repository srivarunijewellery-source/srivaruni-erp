import { createClient } from "@/lib/supabase/server";

export interface DisplayPiece {
  placementId: string;
  slot: number;
  itemId: string;
  barcode: string;
  name: string;
  photoPath: string | null;
  sellingPricePaise: number | null;
}

export interface DisplayBlock {
  blockId: string;
  code: string;
  kind: "neck" | "mannequin";
  rowNo: number;
  colNo: number;
  capacity: number;
  pieces: DisplayPiece[];
}

export interface DisplaySection {
  sectionId: string;
  code: string;
  name: string;
  blocks: DisplayBlock[];
  filled: number;
  total: number;
}

/**
 * The rack, one store, every section.
 *
 * Read from display_grid, which decides on its own whether a piece is
 * still there: a placement counts only while the item is in stock at
 * that branch, so a sold or transferred piece leaves an empty niche
 * with nothing to run and nothing to clear.
 */
export async function listDisplaySections(
  locationId: string,
): Promise<DisplaySection[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("display_grid")
    .select("*")
    .eq("location_id", locationId)
    .order("sort_order")
    .order("row_no")
    .order("col_no")
    .order("slot");

  if (error || !data) return [];

  const sections = new Map<string, DisplaySection>();
  const blocks = new Map<string, DisplayBlock>();

  for (const r of data as Array<Record<string, unknown>>) {
    const sid = String(r.section_id);
    if (!sections.has(sid)) {
      sections.set(sid, {
        sectionId: sid,
        code: String(r.section_code),
        name: String(r.section_name ?? r.section_code),
        blocks: [],
        filled: 0,
        total: 0,
      });
    }
    const section = sections.get(sid)!;

    const bid = String(r.block_id);
    if (!blocks.has(bid)) {
      const block: DisplayBlock = {
        blockId: bid,
        code: String(r.block_code),
        kind: r.kind as "neck" | "mannequin",
        rowNo: Number(r.row_no),
        colNo: Number(r.col_no),
        capacity: Number(r.capacity),
        pieces: [],
      };
      blocks.set(bid, block);
      section.blocks.push(block);
      section.total += 1;
    }

    if (r.placement_id) {
      blocks.get(bid)!.pieces.push({
        placementId: String(r.placement_id),
        slot: Number(r.slot),
        itemId: String(r.item_id),
        barcode: String(r.barcode),
        name: String(r.item_name),
        photoPath: (r.photo_path as string | null) ?? null,
        sellingPricePaise:
          r.selling_price_paise === null ? null : Number(r.selling_price_paise),
      });
    }
  }

  for (const s of sections.values()) {
    s.filled = s.blocks.filter((b) => b.pieces.length > 0).length;
  }
  return [...sections.values()];
}

/** Where a piece is hanging, for the badge on stock and product lists. */
export async function displayLabelsFor(
  itemIds: string[],
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (itemIds.length === 0) return out;

  const supabase = await createClient();
  // One indexed read for a whole page, rather than every listing screen
  // learning the shape of the rack tables.
  const { data } = await supabase
    .from("item_on_display")
    .select("item_id, label")
    .in("item_id", [...new Set(itemIds)].slice(0, 500));

  for (const r of data ?? []) out.set(r.item_id as string, r.label as string);
  return out;
}

export interface DisplayStint {
  blockCode: string;
  sectionCode: string;
  barcode: string;
  itemName: string;
  placedAt: string;
  removedAt: string | null;
  reason: string | null;
}

/**
 * What has hung where.
 *
 * 'gone' means the piece left stock while on that neck -- as close as
 * this gets to "that position sold it". 'taken' is a rearrangement.
 */
export async function listDisplayHistory(
  locationId: string,
  limit = 200,
): Promise<DisplayStint[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("display_history")
    .select(`placed_at, removed_at, reason,
             items(barcode, name),
             display_blocks(code, display_sections(code, location_id))`)
    .order("placed_at", { ascending: false })
    .limit(limit);

  const one = <T,>(v: T | T[] | null): T | undefined =>
    Array.isArray(v) ? v[0] : (v ?? undefined);

  return ((data ?? []) as Array<Record<string, unknown>>)
    .map((r) => {
      const item = one(r.items as never) as { barcode: string; name: string } | undefined;
      const block = one(r.display_blocks as never) as
        | { code: string; display_sections: { code: string; location_id: string } | Array<{ code: string; location_id: string }> }
        | undefined;
      const sec = one(block?.display_sections as never) as
        | { code: string; location_id: string }
        | undefined;
      return {
        blockCode: block?.code ?? "—",
        sectionCode: sec?.code ?? "—",
        locationId: sec?.location_id ?? "",
        barcode: item?.barcode ?? "",
        itemName: item?.name ?? "",
        placedAt: String(r.placed_at),
        removedAt: (r.removed_at as string | null) ?? null,
        reason: (r.reason as string | null) ?? null,
      };
    })
    .filter((r) => r.locationId === locationId)
    .map(({ locationId: _drop, ...rest }) => rest);
}
