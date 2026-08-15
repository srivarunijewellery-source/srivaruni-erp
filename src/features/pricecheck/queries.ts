import { createClient } from "@/lib/supabase/server";
import type { PriceCheckRow } from "./types";

export type { PriceCheckRow, PriceIssue } from "./types";
export { ISSUE_LABEL } from "./types";

/**
 * Prices worth a second look.
 *
 * Two tests rather than one, because a single threshold gets both wrong.
 * "Thin" is a floor the owner sets — whether a piece earns enough is a
 * business judgement. "Out of step" compares against what the SAME
 * category normally does, because Black Beads run at 1.58x and Bracelets
 * at 2.76x, and a flat rule would condemn every Black Bead while missing
 * a Bracelet priced at 1.6x.
 */
export async function listPriceChecks(
  minMarkup = 1.3,
  deviation = 0.4,
  locationId?: string,
): Promise<PriceCheckRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("price_check", {
    p_min_markup: minMarkup,
    p_deviation: deviation,
    p_location: locationId ?? null,
  });
  if (error || !data) return [];

  return (data as Array<Record<string, unknown>>).map((r) => ({
    issue: r.issue as PriceCheckRow["issue"],
    itemId: String(r.item_id),
    barcode: String(r.barcode),
    name: String(r.name),
    category: String(r.category),
    style: String(r.style ?? ""),
    photoPath: (r.photo_path as string | null) ?? null,
    costPaise: Number(r.cost_paise ?? 0),
    sellingPaise: Number(r.selling_paise ?? 0),
    mrpPaise: r.mrp_paise === null ? null : Number(r.mrp_paise),
    markup: Number(r.markup ?? 0),
    categoryMedian: r.category_median === null ? null : Number(r.category_median),
    suggestedPaise: r.suggested_paise === null ? null : Number(r.suggested_paise),
    onHand: Number(r.on_hand ?? 0),
    detail: String(r.detail ?? ""),
  }));
}
