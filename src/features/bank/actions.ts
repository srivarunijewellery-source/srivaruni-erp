"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { ROUTES } from "@/config/nav";
import { err, ok, toMessage, type Result } from "@/lib/result";

export async function postBankAlert(input: {
  id: string;
  accountId: string;
  amountPaise: number;
  date: string;
  payee: string;
  method: string;
  locationId: string | null;
  note: string | null;
}): Promise<Result<string>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("post_bank_alert", {
    p_id: input.id,
    p_account: input.accountId,
    p_amount_paise: input.amountPaise,
    p_date: input.date,
    p_payee: input.payee,
    p_method: input.method,
    p_location: input.locationId,
    p_note: input.note,
  });
  if (error) return err(toMessage(error));
  revalidatePath(ROUTES.bankInbox);
  revalidatePath(ROUTES.expenses);
  return ok(String((data as Record<string, unknown>)?.expense_no ?? ""));
}

export async function ignoreBankAlert(id: string): Promise<Result<void>> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("ignore_bank_alert", { p_id: id });
  if (error) return err(toMessage(error));
  revalidatePath(ROUTES.bankInbox);
  return ok(undefined);
}
