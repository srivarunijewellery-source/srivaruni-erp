"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { ROUTES } from "@/config/nav";
import { err, ok, toMessage, type Result } from "@/lib/result";

/**
 * The lists everything else is built from.
 *
 * Owner-only, enforced in Postgres rather than here — the RLS policies
 * on these tables and the is_owner() check inside each function are the
 * real gate, so a missing check in this file cannot open anything.
 */

function done(): void {
  revalidatePath(ROUTES.masters);
  revalidatePath(ROUTES.products);
  revalidatePath(ROUTES.inward);
}

export async function saveCategory(input: {
  id: string | null;
  name: string;
  hsn: string;
  gstRate: number;
  markupMultiplier: number;
  active: boolean;
}): Promise<Result<string>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("save_category", {
    p_id: input.id,
    p_name: input.name,
    p_hsn: input.hsn,
    p_gst_rate: input.gstRate,
    p_markup: input.markupMultiplier,
    p_active: input.active,
  });
  if (error) return err(toMessage(error));
  done();
  return ok(String(data));
}

export async function saveItemType(input: {
  id: string | null;
  categoryId: string;
  name: string;
  active: boolean;
}): Promise<Result<string>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("save_item_type", {
    p_id: input.id,
    p_category: input.categoryId,
    p_name: input.name,
    p_active: input.active,
  });
  if (error) return err(toMessage(error));
  done();
  return ok(String(data));
}

export async function saveAttributeOption(input: {
  id: string | null;
  key: "colour" | "plating" | "stone" | "size";
  value: string;
  active: boolean;
}): Promise<Result<string>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("save_attribute_option", {
    p_id: input.id,
    p_key: input.key,
    p_value: input.value,
    p_active: input.active,
  });
  if (error) return err(toMessage(error));
  done();
  return ok(String(data));
}

/**
 * Deletes only what nothing points at.
 *
 * The database refuses anything in use and says how many items depend on
 * it, so the message can be shown as-is rather than translated into a
 * guess about what went wrong.
 */
export async function deleteMaster(kind: string, id: string): Promise<Result<string>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("delete_master", {
    p_kind: kind,
    p_id: id,
  });
  if (error) return err(toMessage(error));
  done();
  return ok(String(data));
}
