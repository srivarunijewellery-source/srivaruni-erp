import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { ROUTES } from "@/config/nav";

/**
 * Invalidate every page whose numbers move when an inward's costs change.
 *
 * Editing a rate, a freight figure or the bill discount changes
 * landed_unit_cost_paise for every line on the document, which changes
 * what item_latest_cost reports, which changes the cost and margin shown
 * on each product page. Those pages are server-rendered and cached, so
 * without this they keep serving the old figures — the reported symptom
 * where MRP updated but purchase rate and landed cost did not, because
 * MRP happened to be written by a path that already revalidated the
 * product page.
 *
 * The item ids have to be looked up: a cost edit names an inward, not the
 * products it touches.
 */
export async function revalidateInwardCosts(inwardId: string): Promise<void> {
  revalidatePath(ROUTES.inwardDetail(inwardId));
  revalidatePath(ROUTES.products);
  revalidatePath(ROUTES.pricing);

  const supabase = await createClient();
  const { data } = await supabase
    .from("inward_lines")
    .select("item_id")
    .eq("inward_id", inwardId);

  for (const row of data ?? []) {
    revalidatePath(ROUTES.productDetail(row.item_id));
  }
}
