"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { ROUTES } from "@/config/nav";
import { err, ok, toMessage, type Result } from "@/lib/result";

/**
 * Pricing writes. Owner-only, but not because of a check in here.
 *
 * inward_line_costs is owner-only via RLS, and items_pricing_guard
 * rejects an MRP or selling-price change from anyone else. A staff
 * session calling these gets a database error, which is the correct
 * failure direction.
 */

const attrSchema = z.object({
  itemId:    z.string().uuid(),
  inwardId:  z.string().uuid(),
  colourId:  z.string().uuid().nullable().optional(),
  platingId: z.string().uuid().nullable().optional(),
  stoneId:   z.string().uuid().nullable().optional(),
  sizeId:    z.string().uuid().nullable().optional(),
});

const blankToNull = (v: FormDataEntryValue | null) => {
  const s = v === null ? "" : String(v);
  return s.length > 0 ? s : null;
};

/**
 * Corrects the attributes on an item.
 *
 * Used at pricing time: the person unpacking the carton is guessing at
 * plating and stonework, and the owner fixes it while looking at the
 * photo. Also available on the Products tab.
 */
export async function updateItemAttributes(formData: FormData): Promise<Result> {
  const parsed = attrSchema.safeParse({
    itemId:    formData.get("itemId"),
    inwardId:  formData.get("inwardId"),
    colourId:  blankToNull(formData.get("colourId")),
    platingId: blankToNull(formData.get("platingId")),
    stoneId:   blankToNull(formData.get("stoneId")),
    sizeId:    blankToNull(formData.get("sizeId")),
  });
  if (!parsed.success) return err("Could not save that attribute.");

  const supabase = await createClient();
  const { error } = await supabase
    .from("items")
    .update({
      colour_id:  parsed.data.colourId ?? null,
      plating_id: parsed.data.platingId ?? null,
      stone_id:   parsed.data.stoneId ?? null,
      size_id:    parsed.data.sizeId ?? null,
    })
    .eq("id", parsed.data.itemId);

  if (error) return err(toMessage(error));

  revalidatePath(ROUTES.inwardDetail(parsed.data.inwardId));
  revalidatePath(ROUTES.products);
  return ok(undefined);
}

const lineSchema = z.object({
  lineId:            z.string().uuid(),
  itemId:            z.string().uuid(),
  inwardId:          z.string().uuid(),
  ratePaise:         z.coerce.number().int().nonnegative(),
  gstRate:           z.coerce.number().nonnegative().default(3),
  mrpPaise:          z.coerce.number().int().nonnegative().nullable().optional(),
  sellingPricePaise: z.coerce.number().int().nonnegative().nullable().optional(),
});

/** Saves the rate for one line, plus that item's MRP and selling price. */
export async function savePricingLine(formData: FormData): Promise<Result> {
  const parsed = lineSchema.safeParse({
    lineId:            formData.get("lineId"),
    itemId:            formData.get("itemId"),
    inwardId:          formData.get("inwardId"),
    ratePaise:         formData.get("ratePaise"),
    gstRate:           formData.get("gstRate") ?? 3,
    mrpPaise:          formData.get("mrpPaise") || null,
    sellingPricePaise: formData.get("sellingPricePaise") || null,
  });
  if (!parsed.success) {
    return err(parsed.error.issues[0]?.message ?? "Check the amounts.");
  }
  const v = parsed.data;

  const supabase = await createClient();

  const { error: costError } = await supabase
    .from("inward_line_costs")
    .upsert(
      {
        inward_line_id: v.lineId,
        rate_paise: v.ratePaise,
        gst_rate: v.gstRate,
      },
      { onConflict: "inward_line_id" },
    );

  if (costError) return err(toMessage(costError));

  if (v.mrpPaise !== null || v.sellingPricePaise !== null) {
    const patch: Record<string, unknown> = {};
    if (v.mrpPaise !== null && v.mrpPaise !== undefined) patch.mrp_paise = v.mrpPaise;
    if (v.sellingPricePaise !== null && v.sellingPricePaise !== undefined) {
      patch.selling_price_paise = v.sellingPricePaise;
    }
    if (Object.keys(patch).length > 0) {
      const { error } = await supabase.from("items").update(patch).eq("id", v.itemId);
      if (error) return err(toMessage(error));
    }
  }

  await supabase.rpc("compute_inward_costs", { p_inward: v.inwardId });

  revalidatePath(ROUTES.inwardDetail(v.inwardId));
  return ok(undefined);
}

const addlSchema = z.object({
  inwardId:    z.string().uuid(),
  costType:    z.enum(["freight", "packing", "hamali", "courier", "insurance", "other"]),
  amountPaise: z.coerce.number().int().nonnegative(),
  basis:       z.enum(["value", "quantity"]).default("value"),
});

/** Freight, packing, hamali. Prorated across lines at approval using
 *  largest-remainder allocation, so the split always sums exactly. */
export async function saveAdditionalCost(formData: FormData): Promise<Result> {
  const parsed = addlSchema.safeParse({
    inwardId:    formData.get("inwardId"),
    costType:    formData.get("costType"),
    amountPaise: formData.get("amountPaise"),
    basis:       formData.get("basis") ?? "value",
  });
  if (!parsed.success) return err("Check the amount.");

  const supabase = await createClient();

  // One row per cost type per inward: re-entering freight replaces it
  // rather than silently double-charging the document.
  await supabase
    .from("inward_additional_costs")
    .delete()
    .eq("inward_id", parsed.data.inwardId)
    .eq("cost_type", parsed.data.costType);

  if (parsed.data.amountPaise > 0) {
    const { error } = await supabase.from("inward_additional_costs").insert({
      inward_id: parsed.data.inwardId,
      cost_type: parsed.data.costType,
      amount_paise: parsed.data.amountPaise,
      basis: parsed.data.basis,
    });
    if (error) return err(toMessage(error));
  }

  await supabase.rpc("compute_inward_costs", { p_inward: parsed.data.inwardId });

  revalidatePath(ROUTES.inwardDetail(parsed.data.inwardId));
  return ok(undefined);
}
