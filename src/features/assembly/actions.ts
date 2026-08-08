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

/** Owner-entered cost for a component the rules could not price. */
export async function setComponentCost(
  assemblyId: string,
  componentId: string,
  paise: number,
): Promise<Result<void>> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_component_cost", {
    p_component: componentId,
    p_paise: paise,
  });
  if (error) return err(toMessage(error));
  revalidatePath(`${PATH}/${assemblyId}`);
  return ok(undefined);
}

/**
 * Adds a parent product using the SAME form the inward page uses.
 *
 * Deliberately not a cut-down version: a piece made in-house needs its
 * photo and its colour, plating, stone and size recorded exactly as much
 * as one that arrived in a carton — arguably more, since there is no
 * vendor invoice to fall back on later. Reusing the dialog also means
 * these two screens cannot drift apart.
 */
export async function addAssemblyItemFromForm(
  formData: FormData,
): Promise<Result<string>> {
  const assemblyId = String(formData.get("assemblyId") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const categoryId = String(formData.get("categoryId") ?? "");
  const qty = Math.max(1, Number(formData.get("qty") ?? 1));
  const labourHours = Math.max(0, Number(formData.get("labourHours") ?? 0));
  const photoPaths = formData.getAll("photoPaths").map(String).filter(Boolean);

  if (!assemblyId) return err("No assembly on this form.");
  if (!name) return err("Give the product a name.");
  if (!categoryId) return err("Choose a category.");

  const supabase = await createClient();
  const orNull = (k: string) => {
    const v = String(formData.get(k) ?? "");
    return v.length > 0 ? v : null;
  };

  const { data: staffRows } = await supabase.rpc("get_current_staff");
  const staff = Array.isArray(staffRows) ? staffRows[0] : staffRows;
  if (!staff) return err("No staff record is linked to this login.");

  // Barcode comes from the column default, same as inward — never
  // assigned client-side.
  const { data: item, error: itemError } = await supabase
    .from("items")
    .insert({
      name,
      category_id: categoryId,
      item_type_id: orNull("itemTypeId"),
      colour_id: orNull("colourId"),
      plating_id: orNull("platingId"),
      stone_id: orNull("stoneId"),
      size_id: orNull("sizeId"),
      created_by: staff.staff_id,
    })
    .select("id, barcode")
    .single();
  if (itemError) return err(toMessage(itemError));

  const { data: last } = await supabase
    .from("assembly_items")
    .select("line_no")
    .eq("assembly_id", assemblyId)
    .order("line_no", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();

  const { error: lineError } = await supabase.from("assembly_items").insert({
    assembly_id: assemblyId,
    item_id: item.id,
    qty,
    labour_hours: labourHours,
    line_no: (last?.line_no ?? 0) + 1,
  });

  if (lineError) {
    // Orphaned item otherwise: it can never be sold, but it would sit in
    // the catalog forever. Same cleanup the inward path does.
    await supabase.from("items").delete().eq("id", item.id);
    return err(toMessage(lineError));
  }

  if (photoPaths.length > 0) {
    await supabase.from("item_photos").insert(
      photoPaths.map((path, i) => ({
        item_id: item.id,
        storage_path: path,
        is_primary: i === 0,
        sort_order: i,
        uploaded_by: staff.staff_id,
      })),
    );
  }

  revalidatePath(`${PATH}/${assemblyId}`);
  return ok(item.barcode as string);
}

export interface PriceSuggestion {
  recommendedMrpPaise: number | null;
  ruleId: string | null;
  inBand: boolean | null;
}

/**
 * What the pricing rules make of this piece.
 *
 * Same recommend_price the inward pricing screen uses, so an assembled
 * neck set is priced by exactly the rules that price a bought one. The
 * only difference is where the cost came in from — components rather
 * than a vendor invoice — and by this point that difference is already
 * resolved into a single landed figure.
 */
export async function suggestAssemblyPrice(
  itemId: string,
  landedPaise: number,
): Promise<Result<PriceSuggestion>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("recommend_price", {
    p_item: itemId,
    p_band: null,
    p_landed: landedPaise,
  });
  if (error) return err(toMessage(error));

  const r = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | null;
  if (!r || r.recommended_mrp_paise === null) {
    return err("No rule reaches this item, so there is nothing to suggest.");
  }
  return ok({
    recommendedMrpPaise: Number(r.recommended_mrp_paise),
    ruleId: (r.rule_id as string | null) ?? null,
    inBand: (r.in_band as boolean | null) ?? null,
  });
}

/**
 * MRP and selling price for an assembled piece.
 *
 * They ALWAYS move together, for the same reason as inward: updating one
 * alone makes the database compare the new value against the stale other
 * one still in the row, so a valid MRP gets rejected for being below a
 * selling price the person already changed on screen. A blank one
 * mirrors the other.
 */
export async function saveAssemblyPrice(
  assemblyId: string,
  itemId: string,
  mrpPaise: number | null,
  sellingPaise: number | null,
): Promise<Result<void>> {
  const mrp = mrpPaise ?? sellingPaise ?? null;
  const selling = sellingPaise ?? mrpPaise ?? null;
  if (mrp === null && selling === null) return err("Enter a price.");
  if (mrp !== null && selling !== null && mrp < selling) {
    return err(
      `MRP ${Math.round(mrp / 100)} is below the selling price ${Math.round(selling / 100)}. MRP is the ceiling.`,
    );
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("items")
    .update({ mrp_paise: mrp, selling_price_paise: selling })
    .eq("id", itemId)
    .select("id");

  if (error) return err(toMessage(error));
  if (!data || data.length === 0) return err("Only the owner can set prices.");

  revalidatePath(`${PATH}/${assemblyId}`);
  return ok(undefined);
}
