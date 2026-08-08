import { createClient } from "@/lib/supabase/server";
import { clampGeometry, type LabelGeometry } from "./constants";

/**
 * Geometry is a property of the label stock, not of whoever is printing.
 * It lives in a singleton settings row so it survives a refresh and every
 * person prints against the same measured numbers.
 */
export async function getLabelSettings(): Promise<LabelGeometry> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("label_settings")
    .select("print_area_mm, fold_at_mm, gap_mm, uppercase_items")
    .maybeSingle();

  return clampGeometry({
    printAreaMm: data ? Number(data.print_area_mm) : undefined,
    foldAtMm: data ? Number(data.fold_at_mm) : undefined,
    gapMm: data ? Number(data.gap_mm) : undefined,
    uppercaseItems: Boolean(data?.uppercase_items ?? false),
  });
}
