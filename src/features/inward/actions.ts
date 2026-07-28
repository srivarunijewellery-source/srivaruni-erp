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

const addItemSchema = z.object({
  inwardId:   z.string().uuid(),
  categoryId: z.string().uuid("Choose a category."),
  name:       z.string().trim().min(1, "Give the item a name.").max(120),
  qty:        z.coerce.number().int().positive("Quantity must be at least 1."),
  itemTypeId: z.string().uuid().optional().or(z.literal("")),
  colourId:   z.string().uuid().optional().or(z.literal("")),
  platingId:  z.string().uuid().optional().or(z.literal("")),
  stoneId:    z.string().uuid().optional().or(z.literal("")),
  sizeId:     z.string().uuid().optional().or(z.literal("")),
  photoPaths: z.array(z.string()).default([]),
});

const orNull = (v: string | undefined) => (v && v.length > 0 ? v : null);

/**
 * Creates a NEW item and attaches it to the inward as a line.
 *
 * Always a new SKU. There is deliberately no "find existing item" step:
 * a design received again is a different lot with a different barcode,
 * because two pieces that look identical are not. The database enforces
 * the same rule via one_inward_per_item.
 *
 * No cost fields anywhere in here. Staff never see or enter rates.
 */
export async function addInwardItem(formData: FormData): Promise<Result<string>> {
  const parsed = addItemSchema.safeParse({
    inwardId:   formData.get("inwardId"),
    categoryId: formData.get("categoryId"),
    name:       formData.get("name"),
    qty:        formData.get("qty"),
    itemTypeId: formData.get("itemTypeId") ?? "",
    colourId:   formData.get("colourId") ?? "",
    platingId:  formData.get("platingId") ?? "",
    stoneId:    formData.get("stoneId") ?? "",
    sizeId:     formData.get("sizeId") ?? "",
    photoPaths: formData.getAll("photoPaths").map(String).filter(Boolean),
  });

  if (!parsed.success) {
    return err(parsed.error.issues[0]?.message ?? "Check the form.");
  }
  const v = parsed.data;

  const supabase = await createClient();

  const { data: staffRows } = await supabase.rpc("get_current_staff");
  const staff = Array.isArray(staffRows) ? staffRows[0] : staffRows;
  if (!staff) return err("No staff record is linked to this login.");

  // Barcode comes from the column default (next_barcode), continuing the
  // live Vasy SV##### series. Never assigned client-side.
  const { data: item, error: itemError } = await supabase
    .from("items")
    .insert({
      name: v.name,
      category_id: v.categoryId,
      item_type_id: orNull(v.itemTypeId),
      colour_id: orNull(v.colourId),
      plating_id: orNull(v.platingId),
      stone_id: orNull(v.stoneId),
      size_id: orNull(v.sizeId),
      created_by: staff.staff_id,
    })
    .select("id, barcode")
    .single();

  if (itemError) return err(toMessage(itemError));

  const { data: lastLine } = await supabase
    .from("inward_lines")
    .select("line_no")
    .eq("inward_id", v.inwardId)
    .order("line_no", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();

  const { error: lineError } = await supabase.from("inward_lines").insert({
    inward_id: v.inwardId,
    item_id: item.id,
    qty: v.qty,
    line_no: (lastLine?.line_no ?? 0) + 1,
    created_by: staff.staff_id,
  });

  if (lineError) {
    // The item exists but is orphaned. Remove it so a retry is clean: an
    // unattached pending_pricing item can never be sold, but it would
    // clutter the catalog permanently.
    await supabase.from("items").delete().eq("id", item.id);
    return err(toMessage(lineError));
  }

  // First photo becomes primary; a partial unique index enforces that
  // only one per item can hold that flag.
  if (v.photoPaths.length > 0) {
    await supabase.from("item_photos").insert(
      v.photoPaths.map((path, i) => ({
        item_id: item.id,
        storage_path: path,
        is_primary: i === 0,
        sort_order: i,
        uploaded_by: staff.staff_id,
      })),
    );
  }

  revalidatePath(ROUTES.inwardDetail(v.inwardId));
  return ok(item.barcode);
}

export async function removeInwardLine(formData: FormData): Promise<Result> {
  const lineId = String(formData.get("lineId") ?? "");
  const inwardId = String(formData.get("inwardId") ?? "");
  if (!lineId || !inwardId) return err("Missing line reference.");

  const supabase = await createClient();
  const { error } = await supabase.from("inward_lines").delete().eq("id", lineId);
  if (error) return err(toMessage(error));

  revalidatePath(ROUTES.inwardDetail(inwardId));
  return ok(undefined);
}

const qtySchema = z.object({
  lineId:   z.string().uuid(),
  inwardId: z.string().uuid(),
  qty:      z.coerce.number().int().positive("Quantity must be at least 1."),
});

/** Inline quantity edit on the document itself, not just at add time.
 *  RLS restricts this to draft documents at the user's own location. */
export async function updateInwardLineQty(formData: FormData): Promise<Result> {
  const parsed = qtySchema.safeParse({
    lineId:   formData.get("lineId"),
    inwardId: formData.get("inwardId"),
    qty:      formData.get("qty"),
  });
  if (!parsed.success) return err(parsed.error.issues[0]?.message ?? "Check the quantity.");

  const supabase = await createClient();
  const { error } = await supabase
    .from("inward_lines")
    .update({ qty: parsed.data.qty })
    .eq("id", parsed.data.lineId);

  if (error) return err(toMessage(error));

  revalidatePath(ROUTES.inwardDetail(parsed.data.inwardId));
  return ok(undefined);
}

const invoiceSchema = z.object({
  inwardId:    z.string().uuid(),
  storagePath: z.string().min(1),
});

/** Records an uploaded vendor bill. The file itself goes straight from
 *  the browser to the private inward-invoices bucket; this only stores
 *  the reference. Without at least one of these, submit_inward refuses. */
export async function attachInvoice(formData: FormData): Promise<Result> {
  const parsed = invoiceSchema.safeParse({
    inwardId:    formData.get("inwardId"),
    storagePath: formData.get("storagePath"),
  });
  if (!parsed.success) return err("Could not record that file.");

  const supabase = await createClient();
  const { data: staffRows } = await supabase.rpc("get_current_staff");
  const staff = Array.isArray(staffRows) ? staffRows[0] : staffRows;

  const { error } = await supabase.from("inward_attachments").insert({
    inward_id: parsed.data.inwardId,
    storage_path: parsed.data.storagePath,
    kind: "invoice",
    uploaded_by: staff?.staff_id ?? null,
  });

  if (error) return err(toMessage(error));

  revalidatePath(ROUTES.inwardDetail(parsed.data.inwardId));
  return ok(undefined);
}

/** Owner-only: mints a short-lived link to a private invoice scan. */
export async function getInvoiceUrl(storagePath: string): Promise<Result<string>> {
  const supabase = await createClient();
  const { data, error } = await supabase.storage
    .from("inward-invoices")
    .createSignedUrl(storagePath, 300);

  if (error || !data) return err("Could not open that file.");
  return ok(data.signedUrl);
}

const headerSchema = z.object({
  inwardId:          z.string().uuid(),
  vendorId:          z.string().uuid("Choose a vendor."),
  vendorInvoiceNo:   z.string().trim().max(60).optional().or(z.literal("")),
  vendorInvoiceDate: z.string().optional().or(z.literal("")),
});

/**
 * Vendor and bill details, editable at ANY document state.
 *
 * Deliberately not gated on draft: a bill number gets mistyped, or the
 * wrong vendor gets picked, and that is discovered weeks later. Locking
 * it after approval would force a reversal of good stock movements to
 * fix a typo.
 *
 * Changing the VENDOR after approval also changes the tax treatment, so
 * the caller re-runs compute_inward_costs afterwards.
 */
export async function updateInwardHeader(formData: FormData): Promise<Result> {
  const parsed = headerSchema.safeParse({
    inwardId:          formData.get("inwardId"),
    vendorId:          formData.get("vendorId"),
    vendorInvoiceNo:   formData.get("vendorInvoiceNo") ?? "",
    vendorInvoiceDate: formData.get("vendorInvoiceDate") ?? "",
  });
  if (!parsed.success) {
    return err(parsed.error.issues[0]?.message ?? "Check the bill details.");
  }
  const v = parsed.data;

  const supabase = await createClient();
  const { error } = await supabase
    .from("inwards")
    .update({
      vendor_id: v.vendorId,
      vendor_invoice_no: v.vendorInvoiceNo || null,
      vendor_invoice_date: v.vendorInvoiceDate || null,
    })
    .eq("id", v.inwardId);

  if (error) return err(toMessage(error));

  // Vendor drives price mode and state, so the tax figures are stale now.
  // Ignore the failure: staff cannot compute costs, and for them there is
  // nothing to refresh.
  await supabase.rpc("compute_inward_costs", { p_inward: v.inwardId });

  revalidatePath(ROUTES.inwardDetail(v.inwardId));
  return ok(undefined);
}

const attachSchema = z.object({
  inwardId: z.string().uuid(),
  itemId: z.string().uuid(),
  qty: z.coerce.number().int().positive("Quantity must be at least 1."),
});

/**
 * Attaches an EXISTING catalog entry to an inward.
 *
 * Covers two real cases: an item created ahead of the goods arriving,
 * and one whose line was removed from a document and needs adding back.
 * one_inward_per_item still blocks anything genuinely received before,
 * so this cannot be used to re-inward live stock.
 */
export async function attachExistingItem(formData: FormData): Promise<Result<string>> {
  const parsed = attachSchema.safeParse({
    inwardId: formData.get("inwardId"),
    itemId: formData.get("itemId"),
    qty: formData.get("qty"),
  });
  if (!parsed.success) {
    return err(parsed.error.issues[0]?.message ?? "Check the quantity.");
  }
  const v = parsed.data;

  const supabase = await createClient();
  const { data: staffRows } = await supabase.rpc("get_current_staff");
  const staff = Array.isArray(staffRows) ? staffRows[0] : staffRows;
  if (!staff) return err("No staff record is linked to this login.");

  const { data: lastLine } = await supabase
    .from("inward_lines")
    .select("line_no")
    .eq("inward_id", v.inwardId)
    .order("line_no", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();

  const { error } = await supabase.from("inward_lines").insert({
    inward_id: v.inwardId,
    item_id: v.itemId,
    qty: v.qty,
    line_no: (lastLine?.line_no ?? 0) + 1,
    created_by: staff.staff_id,
  });

  if (error) {
    const msg = toMessage(error);
    return err(
      msg.includes("one_inward_per_item")
        ? "That item has already been received on another document."
        : msg,
    );
  }

  revalidatePath(ROUTES.inwardDetail(v.inwardId));
  return ok(v.itemId);
}
