"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { ROUTES } from "@/config/nav";
import { err, ok, toMessage, type Result } from "@/lib/result";

/**
 * Write side for inward.
 *
 * Note what is NOT here: no role checks. Authorization lives in the
 * database, inside each SECURITY DEFINER function. Re-implementing it in
 * TypeScript would create a second source of truth that silently drifts.
 * The UI hides what you cannot do; the database refuses it.
 */

const submitSchema = z.object({ inwardId: z.string().uuid() });

export async function submitInward(formData: FormData): Promise<Result> {
  const parsed = submitSchema.safeParse({ inwardId: formData.get("inwardId") });
  if (!parsed.success) return err("Missing inward reference.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("submit_inward", {
    p_inward: parsed.data.inwardId,
  });

  if (error) return err(toMessage(error));

  revalidatePath(ROUTES.inward);
  return ok(undefined);
}

export async function approveInward(formData: FormData): Promise<Result> {
  const parsed = submitSchema.safeParse({ inwardId: formData.get("inwardId") });
  if (!parsed.success) return err("Missing inward reference.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("approve_inward", {
    p_inward: parsed.data.inwardId,
  });

  if (error) return err(toMessage(error));

  revalidatePath(ROUTES.inward);
  revalidatePath(ROUTES.stock);
  return ok(undefined);
}

const rejectSchema = submitSchema.extend({
  reason: z.string().trim().min(1, "Say why you are sending it back."),
});

export async function rejectInward(formData: FormData): Promise<Result> {
  const parsed = rejectSchema.safeParse({
    inwardId: formData.get("inwardId"),
    reason: formData.get("reason"),
  });
  if (!parsed.success) return err(parsed.error.issues[0]?.message ?? "Check the form.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("reject_inward", {
    p_inward: parsed.data.inwardId,
    p_reason: parsed.data.reason,
  });

  if (error) return err(toMessage(error));

  revalidatePath(ROUTES.inward);
  return ok(undefined);
}

const createSchema = z.object({
  locationId: z.string().uuid("Choose which store received the goods."),
  vendorId: z.string().uuid("Choose the vendor."),
  vendorInvoiceNo: z.string().trim().optional(),
});

/** Opens an empty draft. Items are added afterwards, as the carton is
 *  unpacked, so staff are never holding a half-filled form. */
export async function createInward(formData: FormData): Promise<Result<string>> {
  const parsed = createSchema.safeParse({
    locationId: formData.get("locationId"),
    vendorId: formData.get("vendorId"),
    vendorInvoiceNo: formData.get("vendorInvoiceNo") ?? undefined,
  });
  if (!parsed.success) return err(parsed.error.issues[0]?.message ?? "Check the form.");

  const supabase = await createClient();

  const { data: docNo, error: docErr } = await supabase.rpc("next_inward_doc_no", {
    p_location: parsed.data.locationId,
  });
  if (docErr) return err(toMessage(docErr));

  const { data: staff } = await supabase
    .from("staff")
    .select("id")
    .eq("auth_user_id", (await supabase.auth.getUser()).data.user?.id ?? "")
    .maybeSingle();

  if (!staff) return err("No staff record is linked to this login.");

  const { data, error } = await supabase
    .from("inwards")
    .insert({
      doc_no: docNo,
      location_id: parsed.data.locationId,
      vendor_id: parsed.data.vendorId,
      vendor_invoice_no: parsed.data.vendorInvoiceNo || null,
      created_by: staff.id,
    })
    .select("id")
    .single();

  if (error) return err(toMessage(error));

  revalidatePath(ROUTES.inward);
  return ok(data.id);
}
