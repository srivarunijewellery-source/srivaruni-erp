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
export interface QuickCustomer {
  phone: string;
  name: string;
  email?: string;
  city?: string;
  state?: string;
  gstin?: string;
  dob?: string;
  anniversary?: string;
}

export async function quickAddCustomer(input: QuickCustomer): Promise<Result<CustomerHit>> {
  const digits = input.phone.replace(/\D/g, "");
  if (digits.length < 10) return err("Enter a full phone number.");

  const supabase = await createClient();
  // upsert_customer is a full replace, so every parameter has to be
  // passed even when blank -- omitting them would blank an existing
  // customer's details if this phone number already exists.
  const { data, error } = await supabase.rpc("upsert_customer", {
    p_id: null,
    p_phone: digits,
    p_name: input.name.trim() || null,
    p_email: input.email?.trim() || null,
    p_dob: input.dob || null,
    p_anniversary: input.anniversary || null,
    p_gstin: input.gstin?.trim() || null,
    p_pan: null,
    p_city: input.city?.trim() || null,
    p_notes: null,
  });

  if (error) return err(toMessage(error));

  const id = typeof data === "string" ? data : String(data);

  // State is not on upsert_customer, but it decides CGST+SGST versus
  // IGST on every invoice for this customer, so it is set directly.
  if (input.state?.trim()) {
    await supabase.from("customers").update({ state: input.state.trim() }).eq("id", id);
  }

  return ok({
    id,
    phone: digits,
    name: input.name.trim() || null,
    city: input.city?.trim() || null,
    state: input.state?.trim() || null,
  });
}

/**
 * One customer by id.
 *
 * Resuming a held bill needs this: the hold stores a customer_id, and
 * without a way to turn it back into a customer the counter silently
 * dropped whoever the bill was for. Rebuilding the bill under "walk-in"
 * loses the attribution AND the state that decides CGST+SGST versus
 * IGST.
 */
export async function getCustomerAction(id: string): Promise<Result<CustomerHit>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("customers")
    .select("id, phone, name, city, state")
    .eq("id", id)
    .maybeSingle();

  if (error || !data) return err("That customer could not be read back.");
  return ok({
    id: data.id,
    phone: data.phone,
    name: data.name,
    city: data.city,
    state: data.state,
  });
}
