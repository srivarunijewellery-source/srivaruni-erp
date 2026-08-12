"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { err, ok, toMessage, type Result } from "@/lib/result";
import { getItemLedger } from "./queries";
import type { LedgerEntry } from "./types";

export async function fetchItemLedger(
  itemId: string,
  locationCode: string | null,
): Promise<Result<LedgerEntry[]>> {
  try {
    return ok(await getItemLedger(itemId, locationCode));
  } catch (e) {
    return err(toMessage(e));
  }
}

/**
 * Records what was actually on the shelf.
 *
 * Deliberately a COUNT, not a correction: the input is what a person saw
 * when they went and looked, and the system works out the difference.
 * A "resolve" button that silently zeroes the variance would hide the
 * one number worth knowing — how far out it was, and why.
 *
 * adjust_item_qty writes the balancing ledger row with the given reason,
 * so damaged, lost and miscounted stay distinguishable in every report
 * afterwards.
 */
export async function settleDiscrepancy(
  itemId: string,
  locationCode: string,
  countedQty: number,
  reason: string,
): Promise<Result<void>> {
  if (!Number.isFinite(countedQty) || countedQty < 0) {
    return err("Enter what you counted — zero or more.");
  }

  const supabase = await createClient();

  const { data: loc } = await supabase
    .from("locations")
    .select("id")
    .eq("code", locationCode)
    .maybeSingle();
  if (!loc) return err("That store could not be found.");

  const { error } = await supabase.rpc("adjust_item_qty", {
    p_item: itemId,
    p_location: loc.id,
    p_new_qty: countedQty,
    p_reason: reason,
  });
  if (error) return err(toMessage(error));

  revalidatePath("/stock/reconcile");
  revalidatePath("/stock");
  return ok(undefined);
}
