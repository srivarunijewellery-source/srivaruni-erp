"use server";

import { listCustomers } from "@/features/customers/queries";
import { err, ok, toMessage, type Result } from "@/lib/result";

/** Narrow customer lookup for the coupon assignment box. */
export async function searchCustomersForCoupon(
  query: string,
): Promise<Result<Array<{ id: string; name: string | null; phone: string }>>> {
  if (!query.trim()) return ok([]);
  try {
    const rows = await listCustomers(query, 8);
    return ok(rows.map((c) => ({ id: c.id, name: c.name, phone: c.phone })));
  } catch (e) {
    return err(toMessage(e));
  }
}
