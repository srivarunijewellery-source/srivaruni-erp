"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { err, ok, toMessage, type Result } from "@/lib/result";

/**
 * Sets a new selling price, and MRP with it.
 *
 * Both together because they are equal everywhere in this catalogue —
 * leaving MRP at the old figure would print a tag showing a discount
 * that is not being given, which is worse than the wrong price it was
 * meant to fix.
 *
 * The price history trigger records the change, so a repricing done here
 * is as traceable as one done on the product page.
 */
export async function repriceItem(
  itemId: string,
  sellingPaise: number,
): Promise<Result<void>> {
  if (!Number.isFinite(sellingPaise) || sellingPaise <= 0) {
    return err("Enter a price above zero.");
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("items")
    .update({ selling_price_paise: sellingPaise, mrp_paise: sellingPaise })
    .eq("id", itemId)
    // Without .select() PostgREST returns 200 and zero rows when RLS
    // blocks the write, which reads as success.
    .select("id");

  if (error) return err(toMessage(error));
  if (!data || data.length === 0) {
    return err("That price could not be saved — you may not have permission.");
  }

  revalidatePath("/pricing/check");
  return ok(undefined);
}
