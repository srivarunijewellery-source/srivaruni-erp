"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { err, ok, toMessage, type Result } from "@/lib/result";
import { searchComponents, type ComponentSearchResult } from "./queries";

const PATH = "/assembly";

export async function startAssembly(
  locationId: string,
  note: string | null,
): Promise<Result<string>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_assembly", {
    p_location: locationId,
    p_note: note,
  });
  if (error) return err(toMessage(error));
  revalidatePath(PATH);
  return ok(data as string);
}

/**
 * Adds a parent product: a brand new item, created here.
 *
 * It goes in as `pending_pricing`, not `active` — the schema refuses an
 * active item with no price, and until the assembly is approved and
 * priced there is nothing legitimate to sell it at.
 */
export async function addAssemblyProduct(
  assemblyId: string,
  input: { name: string; categoryId: string; qty: number; labourHours: number },
): Promise<Result<string>> {
  const supabase = await createClient();

  const name = input.name.trim();
  if (!name) return err("Give the product a name.");
  if (!input.categoryId) return err("Choose a category.");
  if (input.qty < 1) return err("Quantity must be at least one.");

  const { data: barcode, error: bcErr } = await supabase.rpc("next_barcode");
  if (bcErr) return err(toMessage(bcErr, "Could not allocate a tag number."));

  const { data: item, error: itemErr } = await supabase
    .from("items")
    .insert({
      barcode,
      name,
      category_id: input.categoryId,
      status: "pending_pricing",
    })
    .select("id")
    .single();
  if (itemErr) return err(toMessage(itemErr));

  const { data: row, error } = await supabase
    .from("assembly_items")
    .insert({
      assembly_id: assemblyId,
      item_id: item.id,
      qty: input.qty,
      labour_hours: input.labourHours,
    })
    .select("id")
    .single();
  if (error) return err(toMessage(error));

  revalidatePath(`${PATH}/${assemblyId}`);
  return ok(row.id as string);
}

export async function updateAssemblyProduct(
  assemblyId: string,
  productId: string,
  patch: { qty?: number; labourHours?: number },
): Promise<Result<void>> {
  const supabase = await createClient();
  const row: Record<string, unknown> = {};
  if (patch.qty !== undefined) row.qty = Math.max(1, patch.qty);
  if (patch.labourHours !== undefined) row.labour_hours = Math.max(0, patch.labourHours);

  const { error } = await supabase.from("assembly_items").update(row).eq("id", productId);
  if (error) return err(toMessage(error));
  revalidatePath(`${PATH}/${assemblyId}`);
  return ok(undefined);
}

export async function removeAssemblyProduct(
  assemblyId: string,
  productId: string,
): Promise<Result<void>> {
  const supabase = await createClient();
  const { error } = await supabase.from("assembly_items").delete().eq("id", productId);
  if (error) return err(toMessage(error));
  revalidatePath(`${PATH}/${assemblyId}`);
  return ok(undefined);
}

/** Components are what ONE piece takes, not the whole batch. */
export async function addComponent(
  assemblyId: string,
  productId: string,
  itemId: string,
  qty: number,
): Promise<Result<void>> {
  const supabase = await createClient();

  // Scanning the same material twice should add to the line rather than
  // create a duplicate one — on a bench that is what the person means.
  const { data: existing } = await supabase
    .from("assembly_components")
    .select("id, qty")
    .eq("assembly_item_id", productId)
    .eq("item_id", itemId)
    .maybeSingle();

  const { error } = existing
    ? await supabase
        .from("assembly_components")
        .update({ qty: existing.qty + Math.max(1, qty) })
        .eq("id", existing.id)
    : await supabase
        .from("assembly_components")
        .insert({ assembly_item_id: productId, item_id: itemId, qty: Math.max(1, qty) });

  if (error) return err(toMessage(error));
  revalidatePath(`${PATH}/${assemblyId}`);
  return ok(undefined);
}

export async function updateComponentQty(
  assemblyId: string,
  componentId: string,
  qty: number,
): Promise<Result<void>> {
  const supabase = await createClient();
  const { error } =
    qty <= 0
      ? await supabase.from("assembly_components").delete().eq("id", componentId)
      : await supabase.from("assembly_components").update({ qty }).eq("id", componentId);
  if (error) return err(toMessage(error));
  revalidatePath(`${PATH}/${assemblyId}`);
  return ok(undefined);
}

export async function recomputeCosts(assemblyId: string): Promise<Result<void>> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("compute_assembly_costs", { p_assembly: assemblyId });
  if (error) return err(toMessage(error));
  revalidatePath(`${PATH}/${assemblyId}`);
  return ok(undefined);
}

export async function submitAssembly(assemblyId: string): Promise<Result<void>> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("submit_assembly", { p_assembly: assemblyId });
  if (error) return err(toMessage(error));
  revalidatePath(`${PATH}/${assemblyId}`);
  return ok(undefined);
}

/**
 * Approve: consumes the raw materials and brings the finished pieces
 * into stock at their computed landed cost. Not reversible from the app.
 */
export async function approveAssembly(assemblyId: string): Promise<Result<void>> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("approve_assembly", { p_assembly: assemblyId });
  if (error) return err(toMessage(error));
  revalidatePath(`${PATH}/${assemblyId}`);
  revalidatePath("/stock");
  return ok(undefined);
}

export async function rejectAssembly(
  assemblyId: string,
  reason: string,
): Promise<Result<void>> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("reject_assembly", {
    p_assembly: assemblyId,
    p_reason: reason,
  });
  if (error) return err(toMessage(error));
  revalidatePath(`${PATH}/${assemblyId}`);
  return ok(undefined);
}

export async function findComponents(term: string): Promise<Result<ComponentSearchResult[]>> {
  try {
    return ok(await searchComponents(term));
  } catch {
    return err("Could not search the catalog.");
  }
}

/**
 * The shop's hourly rate for assembly work.
 *
 * Deliberately its own action rather than another parameter on
 * save_business_settings: adding a defaulted parameter to an existing
 * function creates a second overload instead of replacing it, and
 * Postgres then cannot tell which one you meant.
 *
 * Changing this does not restate work already recorded — each assembly
 * snapshots the rate when it is started.
 */
export async function saveLabourRate(rupeesPerHour: string): Promise<Result<void>> {
  const n = Number(String(rupeesPerHour).replace(/[₹,\s]/g, ""));
  if (!Number.isFinite(n) || n < 0) return err("Enter an hourly rate like 50 or 62.50");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("business_settings")
    .update({ labour_rate_paise: Math.round(n * 100) })
    .not("id", "is", null)
    .select("id");

  if (error) return err(toMessage(error));
  // .select() so a row filtered out by RLS reports as a failure rather
  // than a silent 200 that wrote nothing.
  if (!data || data.length === 0) {
    return err("Only the owner can change the labour rate.");
  }
  revalidatePath("/settings/company");
  revalidatePath(PATH);
  return ok(undefined);
}
