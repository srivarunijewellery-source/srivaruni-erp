"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { ROUTES } from "@/config/nav";
import { err, ok, toMessage, type Result } from "@/lib/result";

const generateSchema = z
  .object({
    name: z.string().trim().min(1, "Give the batch a name."),
    prefix: z
      .string()
      .trim()
      .min(1, "Give the codes a prefix.")
      .regex(/^[A-Za-z0-9-]+$/, "Prefix can use letters, numbers and dashes only."),
    kind: z.enum(["percent", "amount"]),
    percentOff: z.coerce.number().min(0.01).max(100).optional(),
    amountOffRupees: z.coerce.number().min(1).optional(),
    minPurchaseRupees: z.coerce.number().min(0).default(0),
    validFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a start date."),
    validTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick an end date."),
    startNumber: z.coerce.number().int().min(0),
    count: z.coerce.number().int().min(1).max(2000),
    notes: z.string().trim().optional(),
  })
  .refine((v) => v.validTo >= v.validFrom, { message: "The end date is before the start date." })
  .refine((v) => (v.kind === "percent" ? v.percentOff !== undefined : v.amountOffRupees !== undefined), {
    message: "Enter the discount value.",
  });

export async function generateCoupons(formData: FormData): Promise<Result<string>> {
  const parsed = generateSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return err(parsed.error.issues[0]?.message ?? "Check the form.");
  const d = parsed.data;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("generate_coupon_batch", {
    p_name: d.name,
    p_prefix: d.prefix,
    p_kind: d.kind,
    // Rupees in the form, basis points and paise in the database -- the
    // conversion happens once, here, so no screen deals in mixed units.
    p_discount_bps: d.kind === "percent" ? Math.round((d.percentOff ?? 0) * 100) : null,
    p_discount_paise: d.kind === "amount" ? Math.round((d.amountOffRupees ?? 0) * 100) : null,
    p_min_purchase_paise: Math.round(d.minPurchaseRupees * 100),
    p_valid_from: d.validFrom,
    p_valid_to: d.validTo,
    p_start_number: d.startNumber,
    p_count: d.count,
    p_notes: d.notes || null,
  });

  if (error) return err(toMessage(error));
  revalidatePath(ROUTES.coupons);
  return ok(String(data));
}

async function couponRpc(
  fn: "assign_coupon" | "unassign_coupon" | "void_coupon",
  args: Record<string, unknown>,
  batchId: string,
): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase.rpc(fn, args);
  if (error) return err(toMessage(error));
  revalidatePath(ROUTES.coupons);
  revalidatePath(ROUTES.couponBatch(batchId));
  return ok(undefined);
}

export async function assignCoupon(formData: FormData): Promise<Result> {
  const couponId = String(formData.get("couponId") ?? "");
  const customerId = String(formData.get("customerId") ?? "");
  const batchId = String(formData.get("batchId") ?? "");
  if (!couponId || !customerId) return err("Pick a customer first.");
  return couponRpc("assign_coupon", { p_coupon: couponId, p_customer: customerId }, batchId);
}

export async function unassignCoupon(formData: FormData): Promise<Result> {
  const couponId = String(formData.get("couponId") ?? "");
  const batchId = String(formData.get("batchId") ?? "");
  return couponRpc("unassign_coupon", { p_coupon: couponId }, batchId);
}

export async function voidCoupon(formData: FormData): Promise<Result> {
  const couponId = String(formData.get("couponId") ?? "");
  const batchId = String(formData.get("batchId") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();
  if (!reason) return err("Give a reason for voiding.");
  return couponRpc("void_coupon", { p_coupon: couponId, p_reason: reason }, batchId);
}
