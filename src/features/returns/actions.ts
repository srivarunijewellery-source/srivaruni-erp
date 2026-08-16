"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { ROUTES } from "@/config/nav";
import { err, ok, toMessage, type Result } from "@/lib/result";

/**
 * Attaches a customer to a return that was taken without one.
 *
 * The counter's only recourse used to be cancelling the whole bill and
 * starting again — which is what happened to ZHB/26/00043 and put one
 * anklet back into stock twice, because a return and a cancellation both
 * credit the goods.
 *
 * Nothing about the money moves. The return happened, the goods are
 * back, the journal is posted. Only who it belongs to changes, so the
 * customer's history and any credit note find their owner.
 */
export async function assignReturnCustomer(
  returnId: string,
  customerId: string | null,
  note?: string,
): Promise<Result<{ returnNo: string; customer: string }>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("set_return_customer", {
    p_return: returnId,
    p_customer: customerId,
    p_note: note ?? null,
  });
  if (error) return err(toMessage(error));

  const d = (data ?? {}) as Record<string, unknown>;
  revalidatePath(ROUTES.returns);
  return ok({
    returnNo: String(d.return_no ?? ""),
    customer: String(d.customer ?? ""),
  });
}
