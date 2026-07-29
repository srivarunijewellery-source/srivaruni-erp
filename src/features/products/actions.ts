"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { ROUTES } from "@/config/nav";
import { err, ok, toMessage, type Result } from "@/lib/result";

/**
 * No role checks here, deliberately.
 *
 * items_pricing_guard is a database trigger that rejects any change to
 * mrp_paise, selling_price_paise, status or barcode from a non-owner.
 * Re-implementing that rule in TypeScript would create a second source
 * of truth that drifts. The UI hides the fields; the database refuses
 * the write.
 */

const updateSchema = z.object({
  itemId: z.string().uuid(),
  name: z.string().trim().min(1, "Name cannot be empty.").max(120).optional(),
  description: z.string().trim().max(1000).optional(),
  categoryId: z.string().uuid().optional(),
  mrpPaise: z.coerce.number().int().nonnegative().nullable().optional(),
  sellingPricePaise: z.coerce.number().int().nonnegative().nullable().optional(),
});

export async function updateProduct(formData: FormData): Promise<Result> {
  const raw = {
    itemId: formData.get("itemId"),
    name: formData.get("name") ?? undefined,
    description: formData.get("description") ?? undefined,
    categoryId: formData.get("categoryId") || undefined,
    mrpPaise: formData.get("mrpPaise") === null ? undefined : formData.get("mrpPaise"),
    sellingPricePaise:
      formData.get("sellingPricePaise") === null
        ? undefined
        : formData.get("sellingPricePaise"),
  };

  const parsed = updateSchema.safeParse(raw);
  if (!parsed.success) {
    return err(parsed.error.issues[0]?.message ?? "Check the values.");
  }

  const { itemId, ...fields } = parsed.data;

  const patch: Record<string, unknown> = {};
  if (fields.name !== undefined) patch.name = fields.name;
  if (fields.description !== undefined) patch.description = fields.description || null;
  if (fields.categoryId !== undefined) patch.category_id = fields.categoryId;
  if (fields.mrpPaise !== undefined) patch.mrp_paise = fields.mrpPaise;
  if (fields.sellingPricePaise !== undefined) {
    patch.selling_price_paise = fields.sellingPricePaise;
  }

  if (Object.keys(patch).length === 0) return ok(undefined);

  const supabase = await createClient();
  const { error } = await supabase.from("items").update(patch).eq("id", itemId);

  if (error) return err(toMessage(error));

  revalidatePath(ROUTES.products);
  return ok(undefined);
}

const createSchema = z.object({
  name: z.string().trim().min(1, "Give the item a name.").max(120),
  description: z.string().trim().max(1000).optional(),
  categoryId: z.string().uuid("Choose a category."),
  itemTypeId: z.string().uuid().optional().or(z.literal("")),
  colourId: z.string().uuid().optional().or(z.literal("")),
  platingId: z.string().uuid().optional().or(z.literal("")),
  stoneId: z.string().uuid().optional().or(z.literal("")),
  sizeId: z.string().uuid().optional().or(z.literal("")),
  mrpPaise: z.coerce.number().int().nonnegative().optional(),
  sellingPricePaise: z.coerce.number().int().nonnegative().optional(),
});

const blank = (v: FormDataEntryValue | null) => {
  const s = v === null ? "" : String(v);
  return s.length > 0 ? s : null;
};

/**
 * Creates a catalog entry ahead of any goods arriving.
 *
 * Status stays pending_pricing and no stock is posted, so the item is
 * NOT sellable. It becomes attachable to an inward, and only an approved
 * inward activates it. Creating a product is not the same as having one.
 */
export async function createProduct(formData: FormData): Promise<Result<string>> {
  const parsed = createSchema.safeParse({
    name: formData.get("name"),
    description: formData.get("description") ?? undefined,
    categoryId: formData.get("categoryId"),
    itemTypeId: formData.get("itemTypeId") ?? "",
    colourId: formData.get("colourId") ?? "",
    platingId: formData.get("platingId") ?? "",
    stoneId: formData.get("stoneId") ?? "",
    sizeId: formData.get("sizeId") ?? "",
    mrpPaise: formData.get("mrpPaise") || undefined,
    sellingPricePaise: formData.get("sellingPricePaise") || undefined,
  });
  if (!parsed.success) {
    return err(parsed.error.issues[0]?.message ?? "Check the details.");
  }
  const v = parsed.data;

  const supabase = await createClient();
  const { data: staffRows } = await supabase.rpc("get_current_staff");
  const staff = Array.isArray(staffRows) ? staffRows[0] : staffRows;
  if (!staff) return err("No staff record is linked to this login.");

  const { data, error } = await supabase
    .from("items")
    .insert({
      name: v.name,
      description: v.description || null,
      category_id: v.categoryId,
      item_type_id: blank(formData.get("itemTypeId")),
      colour_id: blank(formData.get("colourId")),
      plating_id: blank(formData.get("platingId")),
      stone_id: blank(formData.get("stoneId")),
      size_id: blank(formData.get("sizeId")),
      mrp_paise: v.mrpPaise ?? null,
      selling_price_paise: v.sellingPricePaise ?? null,
      created_by: staff.staff_id,
    })
    .select("id, barcode")
    .single();

  if (error) return err(toMessage(error));

  revalidatePath(ROUTES.products);
  return ok(data.barcode);
}

const qtySchema = z.object({
  itemId: z.string().uuid(),
  locationId: z.string().uuid("Choose which store."),
  newQty: z.coerce.number().int().nonnegative("Quantity cannot be negative."),
  reason: z.string().trim().min(1, "Say why the count is changing."),
});

/**
 * Corrects on-hand quantity.
 *
 * Routes through adjust_item_qty, which raises and approves a real
 * stock_adjustment document. The difference lands in the ledger with a
 * reason and a person attached; nothing writes a balance directly.
 */
export async function adjustQty(formData: FormData): Promise<Result<number>> {
  const parsed = qtySchema.safeParse({
    itemId: formData.get("itemId"),
    locationId: formData.get("locationId"),
    newQty: formData.get("newQty"),
    reason: formData.get("reason"),
  });
  if (!parsed.success) {
    return err(parsed.error.issues[0]?.message ?? "Check the quantity.");
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("adjust_item_qty", {
    p_item: parsed.data.itemId,
    p_location: parsed.data.locationId,
    p_new_qty: parsed.data.newQty,
    p_reason: parsed.data.reason,
  });

  if (error) return err(toMessage(error));

  revalidatePath(ROUTES.products);
  revalidatePath(ROUTES.productDetail(parsed.data.itemId));
  revalidatePath(ROUTES.stock);
  return ok(Number(data ?? 0));
}
