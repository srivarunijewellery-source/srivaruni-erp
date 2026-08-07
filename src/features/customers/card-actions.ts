"use server";

import { ok, err, type Result } from "@/lib/result";
import {
  getCustomerSummary,
  listCustomerPurchases,
  listCustomerGifts,
  type CustomerSummary,
  type CustomerPurchase,
  type CustomerGift,
} from "./queries";
import { fetchCustomerCredits, type CustomerCredit } from "@/features/pos/actions";

export interface CustomerCard {
  summary: CustomerSummary;
  purchases: CustomerPurchase[];
  gifts: CustomerGift[];
  credits: CustomerCredit[];
}

/**
 * Everything worth knowing about one customer, in one round trip.
 *
 * Four separate calls from the browser would each pay their own latency
 * and land at different moments, so the panel would assemble itself in
 * pieces while someone stands at the counter waiting.
 */
export async function fetchCustomerCard(id: string): Promise<Result<CustomerCard>> {
  const [summary, purchases, gifts, credits] = await Promise.all([
    getCustomerSummary(id),
    listCustomerPurchases(id, 40),
    listCustomerGifts(id),
    fetchCustomerCredits(id),
  ]);
  if (!summary) return err("That customer could not be read.");
  return ok({
    summary,
    purchases,
    gifts,
    credits: credits.ok ? credits.data : [],
  });
}
