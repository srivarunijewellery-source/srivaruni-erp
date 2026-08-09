import { createClient } from "@/lib/supabase/server";
import { byItemCode } from "@/lib/itemOrder";

export interface LabelItem {
  itemId: string;
  barcode: string;
  designCode: string | null;
  name: string;
  /** Bangles are the reason this exists: a 2.6 and a 2.8 are the same
   *  design and the wrong one is a returned sale. Printed beside the
   *  name so it is read at the same moment as the piece. */
  size: string | null;
  /** Legal MRP, not the (possibly discounted) selling price -- this is what a price tag declares. */
  mrpPaise: number | null;
  photoPath: string | null;
}

// No embedded size here. The foreign key is COMPOSITE --
// (size_key, size_id) -> attribute_options(attr_key, id) -- and
// PostgREST cannot resolve a single-column embed against it, so
// `size:size_id(value)` fails the whole query with PGRST200. Sizes are
// resolved by a second lookup below, the same way the pricing screen
// resolves its attribute labels.
const SELECT = "id, barcode, design_code, name, mrp_paise, size_id" as const;

function toLabelItem(
  r: {
    id: string;
    barcode: string;
    design_code: string | null;
    name: string;
    mrp_paise: number | null;
    size_id?: string | null;
  },
  sizes?: Map<string, string>,
): LabelItem {
  return {
    itemId: r.id,
    barcode: r.barcode,
    designCode: r.design_code,
    name: r.name,
    size: (r.size_id && sizes?.get(r.size_id)) || null,
    mrpPaise: r.mrp_paise,
    photoPath: null,
  };
}

/**
 * Size labels for a batch of rows, in one query.
 *
 * Returns an empty map when nothing carries a size, so callers never
 * branch on it -- a missing size simply prints nothing.
 */
async function sizeLabels(
  rows: Array<{ size_id?: string | null }>,
): Promise<Map<string, string>> {
  const ids = [...new Set(rows.map((r) => r.size_id).filter((x): x is string => Boolean(x)))];
  if (ids.length === 0) return new Map();

  const supabase = await createClient();
  const { data } = await supabase
    .from("attribute_options")
    .select("id, value")
    .in("id", ids);

  return new Map((data ?? []).map((a) => [a.id as string, a.value as string]));
}

/** Search-as-you-type for the ad hoc print queue. */
export async function searchLabelItems(query: string, limit = 15): Promise<LabelItem[]> {
  const term = query.trim();
  if (!term) return [];

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("items")
    .select(SELECT)
    .eq("status", "active")
    .or(`barcode.ilike.%${term}%,name.ilike.%${term}%,design_code.ilike.%${term}%`)
    .order("name")
    .limit(limit);

  if (error) throw error;
  const sizes = await sizeLabels(data ?? []);
  return (data ?? []).map((r) => toLabelItem(r, sizes));
}

/** Full label data for a known set of items, in the order requested. */
export async function getLabelItems(itemIds: string[]): Promise<LabelItem[]> {
  if (itemIds.length === 0) return [];

  const supabase = await createClient();
  const { data, error } = await supabase.from("items").select(SELECT).in("id", itemIds);
  if (error) throw error;

  const sizes = await sizeLabels(data ?? []);
  const byId = new Map((data ?? []).map((r) => [r.id, toLabelItem(r, sizes)]));
  return itemIds.map((id) => byId.get(id)).filter((x): x is LabelItem => Boolean(x));
}

/** One item + its inward quantity, for prefilling the queue from an inward document. */
export interface InwardLabelLine {
  item: LabelItem;
  qty: number;
}

export async function getInwardLinesForLabels(inwardId: string): Promise<InwardLabelLine[]> {
  const supabase = await createClient();

  // Embedded from inwards, matching the pattern already used in
  // features/inward/queries.ts -- inward_lines is never queried standalone
  // elsewhere in this codebase, so this follows the established shape
  // rather than guessing at a foreign key column name.
  const { data, error } = await supabase
    .from("inwards")
    .select(`inward_lines(qty, line_no, items(${SELECT}))`)
    .eq("id", inwardId)
    .maybeSingle();

  if (error || !data) return [];

  type Row = {
    qty: number;
    line_no: number | null;
    items: Parameters<typeof toLabelItem>[0] | Parameters<typeof toLabelItem>[0][] | null;
  };
  const lines = (data.inward_lines ?? []) as Row[];
  const sizes = await sizeLabels(
    lines.map((r) => (Array.isArray(r.items) ? r.items[0] : r.items)).filter(Boolean) as Array<{
      size_id?: string | null;
    }>,
  );

  return lines
    .map((r) => {
      const item = Array.isArray(r.items) ? r.items[0] : r.items;
      if (!item) return null;
      return { item: toLabelItem(item, sizes), qty: Number(r.qty ?? 0), lineNo: r.line_no ?? 0 };
    })
    .filter((x): x is InwardLabelLine & { lineNo: number } => x !== null)
    // Code order, the same order the inward document and the pricing
    // screen use. There was no ordering here at all: the queue came back
    // in whatever sequence PostgREST returned the embedded rows, so a
    // strip of tags did not match the document it was printed from.
    .sort(byItemCode((l) => l.item.barcode, (l) => l.lineNo))
    .map(({ item, qty }) => ({ item, qty }));
}

/**
 * Prefill the label queue from an approved assembly.
 *
 * Pieces made in-house need tags exactly as much as ones that arrived in
 * a carton — arguably sooner, since they go straight onto the floor.
 * Mirrors getInwardLinesForLabels: same shape, same code ordering, so
 * the strip matches the document it was printed from.
 */
export async function getAssemblyLinesForLabels(
  assemblyId: string,
): Promise<InwardLabelLine[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("assemblies")
    .select(`assembly_items(qty, line_no, items(${SELECT}))`)
    .eq("id", assemblyId)
    .maybeSingle();

  if (error || !data) return [];

  type Row = {
    qty: number;
    line_no: number | null;
    items: Parameters<typeof toLabelItem>[0] | Parameters<typeof toLabelItem>[0][] | null;
  };
  const lines = (data.assembly_items ?? []) as Row[];
  const sizes = await sizeLabels(
    lines.map((r) => (Array.isArray(r.items) ? r.items[0] : r.items)).filter(Boolean) as Array<{
      size_id?: string | null;
    }>,
  );

  return lines
    .map((r) => {
      const item = Array.isArray(r.items) ? r.items[0] : r.items;
      if (!item) return null;
      return { item: toLabelItem(item, sizes), qty: Number(r.qty ?? 0), lineNo: r.line_no ?? 0 };
    })
    .filter((x): x is InwardLabelLine & { lineNo: number } => x !== null)
    .sort(byItemCode((l) => l.item.barcode, (l) => l.lineNo))
    .map(({ item, qty }) => ({ item, qty }));
}
