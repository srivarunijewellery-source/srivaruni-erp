"use server";

import { revalidateInwardCosts } from "./costCache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
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

  await revalidateInwardCosts(parsed.data.inwardId);
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

  // MRP and selling ALWAYS move together.
  //
  // Updating one alone made the database compare the new value against
  // the stale other one still in the row, so a valid MRP was rejected
  // for being below a selling price the user had already changed on
  // screen. Sending both means the constraint sees the intended state.
  //
  // A blank one mirrors the other, because they are equal in almost
  // every case and a half-priced item cannot be approved anyway.
  const mrp = v.mrpPaise ?? v.sellingPricePaise ?? null;
  const selling = v.sellingPricePaise ?? v.mrpPaise ?? null;

  if (mrp !== null || selling !== null) {
    if (mrp !== null && selling !== null && mrp < selling) {
      return err(
        `MRP ${(mrp / 100).toFixed(2)} is below the selling price ${(selling / 100).toFixed(2)}. MRP is the ceiling.`,
      );
    }

    const { error } = await supabase
      .from("items")
      .update({ mrp_paise: mrp, selling_price_paise: selling })
      .eq("id", v.itemId);

    if (error) return err(toMessage(error));
  }

  const { error: computeError } = await supabase.rpc("compute_inward_costs", {
    p_inward: v.inwardId,
  });
  if (computeError) return err(toMessage(computeError));

  // Rate, MRP and selling all moved: refresh the product pages too, not
  // just this document.
  await revalidateInwardCosts(v.inwardId);
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
  const { error: delError } = await supabase
    .from("inward_additional_costs")
    .delete()
    .eq("inward_id", parsed.data.inwardId)
    .eq("cost_type", parsed.data.costType);
  if (delError) return err(toMessage(delError));

  if (parsed.data.amountPaise > 0) {
    const { error } = await supabase.from("inward_additional_costs").insert({
      inward_id: parsed.data.inwardId,
      cost_type: parsed.data.costType,
      amount_paise: parsed.data.amountPaise,
      basis: parsed.data.basis,
    });
    if (error) return err(toMessage(error));
  }

  // Same trap as the bill discount: this raises for a non-owner, and
  // ignoring it left freight recorded against a document whose line
  // costs never absorbed it. Landed cost would then be quietly wrong.
  const { error: computeError } = await supabase.rpc("compute_inward_costs", {
    p_inward: parsed.data.inwardId,
  });
  if (computeError) return err(toMessage(computeError));

  await revalidateInwardCosts(parsed.data.inwardId);
  return ok(undefined);
}

const categorySchema = z.object({
  itemId: z.string().uuid(),
  inwardId: z.string().uuid(),
  categoryId: z.string().uuid("Choose a category."),
});

/**
 * Changes an item's category from the pricing screen.
 *
 * The person unpacking the carton is guessing, and the owner correcting
 * it while looking at the photo is the natural moment. Category also
 * drives the MRP suggestion multiplier, so getting it right here has a
 * direct effect on the price about to be set.
 */
export async function updateItemCategory(formData: FormData): Promise<Result> {
  const parsed = categorySchema.safeParse({
    itemId: formData.get("itemId"),
    inwardId: formData.get("inwardId"),
    categoryId: formData.get("categoryId"),
  });
  if (!parsed.success) {
    return err(parsed.error.issues[0]?.message ?? "Could not change the category.");
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("items")
    .update({ category_id: parsed.data.categoryId })
    .eq("id", parsed.data.itemId);

  if (error) return err(toMessage(error));

  await revalidateInwardCosts(parsed.data.inwardId);
  return ok(undefined);
}

/**
 * Renames an item while pricing it.
 *
 * Pricing is the first time anyone reads a new piece properly, and the
 * vendor's shorthand ("black beads 19526") is what the counter will
 * search on and what prints on the customer's bill. Fixing it here saves
 * a trip to the product page, which in practice means it never gets
 * fixed at all.
 */
export async function renameInwardItem(formData: FormData): Promise<Result> {
  const itemId = String(formData.get("itemId") ?? "");
  const inwardId = String(formData.get("inwardId") ?? "");
  const name = String(formData.get("name") ?? "").trim();

  if (!itemId || !inwardId) return err("Missing item.");
  if (name.length < 2) return err("Give the item a name.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("rename_item", {
    p_item: itemId,
    p_name: name,
  });
  if (error) return err(toMessage(error));

  await revalidateInwardCosts(inwardId);
  return ok(undefined);
}

/**
 * Attaches photos to an item during pricing.
 *
 * Photos arrive already uploaded to storage — the browser sends the file
 * straight to the bucket, so this only records where it landed. The
 * first photo on an item becomes primary; a partial unique index makes
 * sure only one ever holds that flag, so this checks rather than
 * assumes.
 */
export async function addItemPhotos(
  itemId: string,
  inwardId: string,
  paths: string[],
): Promise<Result> {
  if (paths.length === 0) return ok(undefined);

  const supabase = await createClient();
  const { data: staff } = await supabase.rpc("get_current_staff");
  const staffId = Array.isArray(staff) ? staff[0]?.staff_id : null;

  const { count } = await supabase
    .from("item_photos")
    .select("id", { count: "exact", head: true })
    .eq("item_id", itemId);

  const existing = count ?? 0;

  const { error } = await supabase.from("item_photos").insert(
    paths.map((path, i) => ({
      item_id: itemId,
      storage_path: path,
      is_primary: existing === 0 && i === 0,
      sort_order: existing + i,
      uploaded_by: staffId,
    })),
  );
  if (error) return err(toMessage(error));

  await revalidateInwardCosts(inwardId);
  return ok(undefined);
}

/** Removes a photo. The item keeps its remaining photos and its primary. */
export async function removeItemPhoto(
  photoId: string,
  inwardId: string,
): Promise<Result> {
  const supabase = await createClient();

  const { data: photo } = await supabase
    .from("item_photos")
    .select("item_id, is_primary")
    .eq("id", photoId)
    .maybeSingle();

  const { error } = await supabase.from("item_photos").delete().eq("id", photoId);
  if (error) return err(toMessage(error));

  // Losing the primary leaves an item with photos but no thumbnail, so
  // the next one in order is promoted.
  if (photo?.is_primary) {
    const { data: next } = await supabase
      .from("item_photos")
      .select("id")
      .eq("item_id", photo.item_id)
      .order("sort_order")
      .limit(1)
      .maybeSingle();

    if (next) {
      await supabase.from("item_photos").update({ is_primary: true }).eq("id", next.id);
    }
  }

  await revalidateInwardCosts(inwardId);
  return ok(undefined);
}

/** Photos on an item, so the pricing editor can show and remove them. */
export async function listItemPhotos(
  itemId: string,
): Promise<Result<Array<{ id: string; storagePath: string; isPrimary: boolean }>>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("item_photos")
    .select("id, storage_path, is_primary")
    .eq("item_id", itemId)
    .order("sort_order");

  if (error) return err(toMessage(error));
  return ok(
    (data ?? []).map((r) => ({
      id: r.id,
      storagePath: r.storage_path,
      isPrimary: r.is_primary,
    })),
  );
}
