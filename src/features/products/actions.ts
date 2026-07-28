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
  categoryId: z.string().uuid().optional(),
  mrpPaise: z.coerce.number().int().nonnegative().nullable().optional(),
  sellingPricePaise: z.coerce.number().int().nonnegative().nullable().optional(),
});

export async function updateProduct(formData: FormData): Promise<Result> {
  const raw = {
    itemId: formData.get("itemId"),
    name: formData.get("name") ?? undefined,
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
