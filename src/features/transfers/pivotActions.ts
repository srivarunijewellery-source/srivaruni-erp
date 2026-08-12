"use server";

import { createClient } from "@/lib/supabase/server";
import { err, ok, toMessage, type Result } from "@/lib/result";
import type { PivotCell, PivotItem, PivotFilters } from "./pivotTypes";

function args(f: PivotFilters) {
  return {
    p_stages: f.stages.length ? f.stages : null,
    p_from_location: f.fromLocation || null,
    p_to_location: f.toLocation || null,
    p_min_qty: f.minQty ?? null,
  };
}

/** The grid. */
export async function loadPivot(f: PivotFilters): Promise<Result<PivotCell[]>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("transfer_pivot", {
    ...args(f),
    p_categories: f.categories.length ? f.categories : null,
    p_styles: f.styles.length ? f.styles : null,
  });
  if (error) return err(toMessage(error));

  return ok(
    ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
      category: String(r.category),
      style: String(r.style),
      items: Number(r.items ?? 0),
      pieces: Number(r.pieces ?? 0),
      retailPaise: Number(r.retail_paise ?? 0),
    })),
  );
}

/**
 * The pieces behind one cell.
 *
 * Null category or style means "all of them", so a row total, a column
 * total and the grand total all drill through this same call rather than
 * three near-identical ones that could drift apart.
 */
export async function loadPivotItems(
  f: PivotFilters,
  category: string | null,
  style: string | null,
): Promise<Result<PivotItem[]>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("transfer_pivot_items", {
    ...args(f),
    p_category: category,
    p_style: style,
  });
  if (error) return err(toMessage(error));

  return ok(
    ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
      itemId: String(r.item_id),
      barcode: String(r.barcode),
      name: String(r.name),
      category: String(r.category),
      style: String(r.style),
      photoPath: (r.photo_path as string | null) ?? null,
      sellingPricePaise: Number(r.selling_price_paise ?? 0),
      qty: Number(r.qty ?? 0),
      stage: String(r.stage),
      docNo: String(r.doc_no),
      fromCode: String(r.from_code),
      toCode: String(r.to_code),
    })),
  );
}
