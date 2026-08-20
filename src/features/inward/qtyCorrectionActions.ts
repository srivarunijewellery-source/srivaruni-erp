"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { ROUTES } from "@/config/nav";
import { err, ok, toMessage, type Result } from "@/lib/result";

export interface QtyCorrection {
  barcode: string;
  docNo: string;
  was: number;
  now: number;
  delta: number;
  stockBefore: number;
  stockAfter: number;
  /** What the vendor is owed, before and after. The whole reason a
   *  quantity correction cannot be a quiet edit. */
  payableBefore: number;
  payableAfter: number;
  payableDelta: number;
}

/**
 * Changes a quantity on a document that has already been approved.
 *
 * The plain edit refuses there, and rightly: by then the pieces are on
 * the shelf and in the books, so moving the number on the paperwork
 * alone would leave three records of the same fact disagreeing with each
 * other, with nothing afterwards to say which was right.
 *
 * This does both halves in one transaction. The stock moves through
 * adjust_item_qty, which raises its own adjustment document, and the
 * line is then updated behind a transaction-scoped flag that the
 * immutability trigger recognises. A bare UPDATE still cannot get
 * through -- the flag is only ever set inside the database function,
 * after ownership is checked and after the stock has actually moved.
 *
 * Costs are recomputed afterwards because quantity is an input to nearly
 * every derived figure: the bill discount is a share of rate x qty, the
 * freight allocation moves with it, and landed unit cost divides by it.
 *
 * A delta journal is posted for the difference, dated TODAY rather than
 * the original bill date, so a month already reconciled is not reopened
 * by a correction made weeks later. The original posting stays put --
 * the purchase happened then, the correction happened today, and both
 * are readable side by side.
 *
 * Refused outright once any payment has been allocated to the bill.
 * Moving the amount underneath a payment leaves the allocation pointing
 * at a figure that no longer exists, and what is owed stops reconciling
 * with what was paid. A short delivery found after payment is a debit
 * note against the vendor, not an edit.
 *
 * This is a stopgap. Once the document check compares quantities against
 * the vendor's own bill at entry, a wrong count should be caught before
 * approval and this becomes the rare exception rather than the fix.
 */
export async function correctApprovedLineQty(
  lineId: string,
  inwardId: string,
  newQty: number,
  reason: string,
): Promise<Result<QtyCorrection | null>> {
  if (!Number.isInteger(newQty) || newQty < 1) {
    return err("Quantity must be a whole number, at least 1.");
  }
  const why = reason.trim();
  if (!why) {
    return err("Say why it is changing — this is the only explanation the ledger carries.");
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("correct_approved_inward_qty", {
    p_line: lineId,
    p_new_qty: newQty,
    p_reason: why,
  });

  if (error) return err(toMessage(error));

  const r = data as Record<string, unknown> | null;
  if (!r || r.changed !== true) return ok(null);

  revalidatePath(ROUTES.inwardDetail(inwardId));
  revalidatePath(ROUTES.stock);

  revalidatePath("/accounts");

  return ok({
    barcode: String(r.barcode ?? ""),
    docNo: String(r.doc_no ?? ""),
    was: Number(r.was ?? 0),
    now: Number(r.now ?? 0),
    delta: Number(r.delta ?? 0),
    stockBefore: Number(r.stock_before ?? 0),
    stockAfter: Number(r.stock_after ?? 0),
    payableBefore: Number(r.payable_before ?? 0),
    payableAfter: Number(r.payable_after ?? 0),
    payableDelta: Number(r.payable_delta ?? 0),
  });
}
