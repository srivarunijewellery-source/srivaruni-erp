"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { ROUTES } from "@/config/nav";
import { err, ok, toMessage, type Result } from "@/lib/result";

const optionalText = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v ? v : undefined));

const optionalDate = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v ? v : undefined))
  .refine((v) => v === undefined || /^\d{4}-\d{2}-\d{2}$/.test(v), "Use a valid date.");

const schema = z.object({
  id: z.string().uuid().optional(),
  phone: z.string().trim().min(1, "A phone number is required."),
  name: optionalText,
  email: optionalText.refine(
    (v) => v === undefined || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v),
    "That email address doesn't look right.",
  ),
  dob: optionalDate,
  anniversary: optionalDate,
  gstin: optionalText,
  pan: optionalText.refine(
    (v) => v === undefined || /^[A-Za-z]{5}[0-9]{4}[A-Za-z]$/.test(v),
    "A PAN is five letters, four digits, then one letter.",
  ),
  city: optionalText,
  notes: optionalText,
});

/**
 * Always sends the complete record.
 *
 * upsert_customer is a full replace, not a patch -- so that a wrongly
 * entered PAN or date of birth can be cleared. That only works if the
 * form submits every field every time, including the empty ones.
 */
export async function saveCustomer(formData: FormData): Promise<Result<string>> {
  const parsed = schema.safeParse({
    id: (formData.get("id") as string) || undefined,
    phone: formData.get("phone"),
    name: formData.get("name") ?? undefined,
    email: formData.get("email") ?? undefined,
    dob: formData.get("dob") ?? undefined,
    anniversary: formData.get("anniversary") ?? undefined,
    gstin: formData.get("gstin") ?? undefined,
    pan: formData.get("pan") ?? undefined,
    city: formData.get("city") ?? undefined,
    notes: formData.get("notes") ?? undefined,
  });

  if (!parsed.success) return err(parsed.error.issues[0]?.message ?? "Check the form.");

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("upsert_customer", {
    p_id: parsed.data.id ?? null,
    p_phone: parsed.data.phone,
    p_name: parsed.data.name ?? null,
    p_email: parsed.data.email ?? null,
    p_dob: parsed.data.dob ?? null,
    p_anniversary: parsed.data.anniversary ?? null,
    p_gstin: parsed.data.gstin ?? null,
    p_pan: parsed.data.pan ?? null,
    p_city: parsed.data.city ?? null,
    p_notes: parsed.data.notes ?? null,
  });

  if (error) return err(toMessage(error));

  revalidatePath(ROUTES.customers);
  const id = String(data);
  revalidatePath(ROUTES.customerDetail(id));
  return ok(id);
}
