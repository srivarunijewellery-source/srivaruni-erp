"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { ROUTES } from "@/config/nav";
import { err, ok, toMessage, type Result } from "@/lib/result";

/**
 * Vendor writes. Owner-only by RLS, not by a check here.
 *
 * The GSTIN rules are also constraints in the database
 * (vendor_registered_needs_gstin, vendor_unregistered_has_no_gstin), so
 * a bad combination is rejected even if this validation were bypassed.
 * state_code is derived from the GSTIN by trigger, which is what drives
 * IGST vs CGST/SGST later.
 */
const vendorSchema = z
  .object({
    id: z.string().uuid().optional(),
    name: z.string().trim().min(1, "Vendor name is required.").max(160),
    gstStatus: z.enum(["registered", "composition", "unregistered"]),
    gstin: z.string().trim().toUpperCase().optional().or(z.literal("")),
    phone: z.string().trim().max(20).optional().or(z.literal("")),
    city: z.string().trim().max(80).optional().or(z.literal("")),
    placeOfBusiness: z.string().trim().max(200).optional().or(z.literal("")),
    priceMode: z.enum(["gst_exclusive", "gst_inclusive", "no_gst"]),
    defaultGstRate: z.coerce.number().min(0).max(100),
    paymentTermsDays: z.coerce.number().int().min(0).max(365).default(0),
  })
  .refine(
    (v) =>
      v.gstStatus !== "registered" ||
      /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(v.gstin ?? ""),
    {
      // Length alone was not enough: "123456789012345" passed, and its
      // leading 12 silently made a Hyderabad vendor interstate.
      message:
        "That is not a valid GSTIN. Format is 2-digit state, 10-character PAN, entity digit, Z, checksum.",
      path: ["gstin"],
    },
  )
  .refine((v) => v.gstStatus !== "unregistered" || !v.gstin, {
    message: "An unregistered vendor cannot have a GSTIN.",
    path: ["gstin"],
  })
  .refine((v) => v.gstStatus !== "unregistered" || v.priceMode === "no_gst", {
    message: "An unregistered vendor cannot charge GST.",
    path: ["priceMode"],
  });

function read(formData: FormData) {
  return {
    id: (formData.get("id") as string) || undefined,
    name: formData.get("name"),
    gstStatus: formData.get("gstStatus"),
    gstin: formData.get("gstin") ?? "",
    phone: formData.get("phone") ?? "",
    city: formData.get("city") ?? "",
    placeOfBusiness: formData.get("placeOfBusiness") ?? "",
    priceMode: formData.get("priceMode"),
    defaultGstRate: formData.get("defaultGstRate") ?? 3,
    paymentTermsDays: formData.get("paymentTermsDays") ?? 0,
  };
}

export async function saveVendor(formData: FormData): Promise<Result> {
  const parsed = vendorSchema.safeParse(read(formData));
  if (!parsed.success) {
    return err(parsed.error.issues[0]?.message ?? "Check the vendor details.");
  }
  const v = parsed.data;

  const row = {
    name: v.name,
    gst_status: v.gstStatus,
    gstin: v.gstin ? v.gstin : null,
    phone: v.phone || null,
    city: v.city || null,
    place_of_business: v.placeOfBusiness || null,
    price_mode: v.priceMode,
    default_gst_rate: v.defaultGstRate,
    payment_terms_days: v.paymentTermsDays,
  };

  const supabase = await createClient();
  const { error } = v.id
    ? await supabase.from("vendors").update(row).eq("id", v.id)
    : await supabase.from("vendors").insert(row);

  if (error) return err(toMessage(error));

  revalidatePath(ROUTES.vendors);
  return ok(undefined);
}

export async function setVendorActive(formData: FormData): Promise<Result> {
  const id = String(formData.get("id") ?? "");
  const active = String(formData.get("active") ?? "") === "true";
  if (!id) return err("Missing vendor.");

  const supabase = await createClient();
  const { error } = await supabase.from("vendors").update({ active }).eq("id", id);
  if (error) return err(toMessage(error));

  revalidatePath(ROUTES.vendors);
  return ok(undefined);
}
