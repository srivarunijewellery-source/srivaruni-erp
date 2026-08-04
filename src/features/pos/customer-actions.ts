"use server";

import { err, ok, type Result } from "@/lib/result";
import { searchCustomers, type CustomerHit } from "./queries";

/** Thin server action wrapper so the counter can search as you type. */
export async function searchCustomersAction(term: string): Promise<Result<CustomerHit[]>> {
  try {
    return ok(await searchCustomers(term));
  } catch {
    return err("Could not search customers.");
  }
}
