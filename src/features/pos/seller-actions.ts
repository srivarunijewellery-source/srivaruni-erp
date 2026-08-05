"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { ROUTES } from "@/config/nav";
import { err, ok, toMessage, type Result } from "@/lib/result";
import { getBillLines, type BillLineDetail } from "./dashboard-queries";

export async function loadBillLines(billId: string): Promise<Result<BillLineDetail[]>> {
  try {
    return ok(await getBillLines(billId));
  } catch {
    return err("Could not load that invoice.");
  }
}

/**
 * Moves credit for one line to a different salesman.
 *
 * Same-day only for ordinary staff — attribution drives incentive, and
 * letting last month's credit move after a payout was calculated turns
 * a paid incentive into a dispute. Managers can reach further back.
 */
export async function reassignLine(
  billLineId: string,
  staffId: string | null,
): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("reassign_line_seller", {
    p_bill_line: billLineId,
    p_staff: staffId,
  });
  if (error) return err(toMessage(error));

  revalidatePath(ROUTES.sales);
  return ok(undefined);
}

export async function reassignBill(
  billId: string,
  staffId: string,
): Promise<Result<number>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("reassign_bill_seller", {
    p_bill: billId,
    p_staff: staffId,
  });
  if (error) return err(toMessage(error));

  revalidatePath(ROUTES.sales);
  return ok(Number(data ?? 0));
}
