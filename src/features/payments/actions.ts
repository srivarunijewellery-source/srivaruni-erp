"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { ROUTES } from "@/config/nav";
import { err, ok, toMessage, type Result } from "@/lib/result";

const allocationSchema = z.object({
  inward_id: z.string().uuid(),
  amount_paise: z.number().int().positive(),
});

const paymentSchema = z.object({
  vendorId: z.string().uuid("Choose a vendor."),
  accountId: z.string().uuid("Choose which account the money leaves."),
  amountPaise: z.coerce.number().int().positive("Enter an amount."),
  paidOn: z.string().min(1),
  method: z.enum(["cash", "bank_transfer", "upi", "cheque", "card", "other"]),
  reference: z.string().trim().max(80).optional().or(z.literal("")),
  note: z.string().trim().max(200).optional().or(z.literal("")),
  allocations: z.array(allocationSchema).default([]),
});

/**
 * Records a payment to a vendor.
 *
 * Anything not allocated to a specific bill stays as an advance: real
 * money with the vendor, not yet set against a document. That is a
 * normal state in this trade, not an error, so it is represented rather
 * than forced to zero.
 */
export async function recordPayment(input: unknown): Promise<Result<string>> {
  const parsed = paymentSchema.safeParse(input);
  if (!parsed.success) {
    return err(parsed.error.issues[0]?.message ?? "Check the payment details.");
  }
  const v = parsed.data;

  const allocTotal = v.allocations.reduce((s, a) => s + a.amount_paise, 0);
  if (allocTotal > v.amountPaise) {
    return err("Allocated more than the payment amount.");
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("record_vendor_payment", {
    p_vendor: v.vendorId,
    p_account: v.accountId,
    p_amount: v.amountPaise,
    p_paid_on: v.paidOn,
    p_method: v.method,
    p_reference: v.reference || null,
    p_note: v.note || null,
    p_allocations: v.allocations,
  });

  if (error) return err(toMessage(error));

  revalidatePath(ROUTES.payments);
  revalidatePath(ROUTES.vendors);
  revalidatePath(ROUTES.vendorDetail(v.vendorId));
  return ok(String(data));
}

const accountSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1, "Name the account.").max(80),
  kind: z.enum(["bank", "cash", "wallet"]),
  bankName: z.string().trim().max(80).optional().or(z.literal("")),
  accountLast4: z.string().trim().max(4).optional().or(z.literal("")),
});

export async function saveAccount(formData: FormData): Promise<Result> {
  const parsed = accountSchema.safeParse({
    id: (formData.get("id") as string) || undefined,
    name: formData.get("name"),
    kind: formData.get("kind"),
    bankName: formData.get("bankName") ?? "",
    accountLast4: formData.get("accountLast4") ?? "",
  });
  if (!parsed.success) {
    return err(parsed.error.issues[0]?.message ?? "Check the account details.");
  }
  const v = parsed.data;

  const row = {
    name: v.name,
    kind: v.kind,
    bank_name: v.bankName || null,
    account_last4: v.accountLast4 || null,
  };

  const supabase = await createClient();
  const { error } = v.id
    ? await supabase.from("payment_accounts").update(row).eq("id", v.id)
    : await supabase.from("payment_accounts").insert(row);

  if (error) return err(toMessage(error));

  revalidatePath(ROUTES.payments);
  return ok(undefined);
}
