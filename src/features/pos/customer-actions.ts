"use server";

import { createClient } from "@/lib/supabase/server";
import { err, ok, toMessage, type Result } from "@/lib/result";
import { searchCustomers, type CustomerHit } from "./queries";

/** Thin server action wrapper so the counter can search as you type. */
export async function searchCustomersAction(term: string): Promise<Result<CustomerHit[]>> {
  try {
    return ok(await searchCustomers(term));
  } catch {
    return err("Could not search customers.");
  }
}

/**
 * Adds a customer without leaving the counter.
 *
 * Phone is the identity key, so this is deliberately the only required
 * field — asking for a full profile while someone waits at the till is
 * how counters end up with a hundred "walk-in" sales that could have
 * been attributed.
 */
export async function quickAddCustomer(
  phone: string,
  name: string,
): Promise<Result<CustomerHit>> {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 10) return err("Enter a full phone number.");

  const supabase = await createClient();
  // upsert_customer is a full replace, so every parameter has to be
  // passed even when blank -- omitting them would blank an existing
  // customer's details if this phone number already exists.
  const { data, error } = await supabase.rpc("upsert_customer", {
    p_id: null,
    p_phone: digits,
    p_name: name.trim() || null,
    p_email: null,
    p_dob: null,
    p_anniversary: null,
    p_gstin: null,
    p_pan: null,
    p_city: null,
    p_notes: null,
  });

  if (error) return err(toMessage(error));

  const id = typeof data === "string" ? data : String(data);
  return ok({ id, phone: digits, name: name.trim() || null, city: null });
}
