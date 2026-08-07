"use server";

import { err, ok, type Result } from "@/lib/result";
import { getBillDetail, type BillDetail } from "./queries";

/** Reads one bill for the peek modal. */
export async function fetchBillDetail(id: string): Promise<Result<BillDetail>> {
  const bill = await getBillDetail(id);
  if (!bill) return err("That bill could not be read.");
  return ok(bill);
}
