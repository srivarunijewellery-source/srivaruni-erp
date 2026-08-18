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
        // A fraction of a bundle is a real quantity; only a
        // non-positive one is meaningless.
        .update({ qty: existing.qty + Math.max(0.001, qty) })
        .eq("id", existing.id)
    : await supabase
        .from("assembly_components")
        .insert({
          assembly_item_id: productId,
          item_id: itemId,
          qty: Math.max(0.001, qty),
        });

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

export interface SendBackOutcome {
  /** The new document the ticked products were moved into. */
  assemblyId: string;
  docNo: string;
  moved: number;
}

/**
 * Send SOME products back, not the whole document.
 *
 * Rejecting is all-or-nothing, and a batch of forty rarely fails as a
 * batch: three pieces have the wrong photo or a missing component and
 * the other thirty-seven are ready to post. The only way to act on that
 * was to send the whole thing back and re-check every good piece
 * afterwards, so in practice nobody did — the bad ones got approved
 * with the rest and the wrong cost stuck to them forever.
 *
 * The ticked products move to a NEW draft document carrying the reason,
 * which the bench can open and fix. Their materials travel with them,
 * because components hang off the product rather than the document.
 * What is left behind stays submitted and can be approved immediately.
 *
 * The split is one statement in the database rather than a delete and
 * re-insert here: a half-finished move would leave a product on no
 * document at all, and its materials with it.
 */
export async function sendBackAssemblyProducts(
  assemblyId: string,
  productIds: string[],
  reason: string,
): Promise<Result<SendBackOutcome>> {
  const ids = [...new Set(productIds.filter(Boolean))];
  if (ids.length === 0) return err("Tick the products that need fixing.");

  const note = reason.trim();
  if (!note) {
    return err("Say what needs fixing — this note is the only thing the bench sees.");
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("split_assembly_products", {
    p_assembly: assemblyId,
    p_products: ids,
    p_reason: note,
  });
  if (error) return err(toMessage(error));

  const row = (Array.isArray(data) ? data[0] : data) as
    | { new_assembly_id: string; new_doc_no: string }
    | null
    | undefined;
  if (!row) return err("Nothing was sent back. Reload the page and try again.");

  revalidatePath(`${PATH}/${assemblyId}`);
  revalidatePath(`${PATH}/${row.new_assembly_id}`);
  revalidatePath(PATH);
  return ok({
    assemblyId: row.new_assembly_id,
    docNo: row.new_doc_no,
    moved: ids.length,
  });
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

export interface AssemblyBandOutcome {
  applied: number;
  leftAsTyped: number;
  refused: number;
  lines: Array<{ name: string; ok: boolean; reason?: string }>;
}

/**
 * Price every finished product on the document from one band.
 *
 * The same decision the inward pricing bar makes, for the same reason:
 * choosing a band six times is that decision typed six times, which is
 * how two identical pieces end up at different prices. "Rules first"
 * lets each item's own rule win and falls back to the band only where no
 * rule reaches it.
 *
 * Skips anything already priced unless replaceExisting is ticked, so
 * pressing it twice is safe and deliberate per-item work is not
 * clobbered. Reports what it could NOT do — that list is the point.
 */
export async function applyBandToAssembly(
  assemblyId: string,
  bandId: string,
  mode: "rules_first" | "override",
  replaceExisting = false,
): Promise<Result<AssemblyBandOutcome>> {
  if (!bandId) return err("Choose a band first.");
  const supabase = await createClient();

  const { data: costs, error: costErr } = await supabase.rpc("assembly_costs", {
    p_assembly: assemblyId,
  });
  if (costErr) return err(toMessage(costErr));

  // One row per component, so collapse to one landed figure per product.
  const landed = new Map<string, number>();
  for (const c of (costs ?? []) as Array<Record<string, unknown>>) {
    landed.set(String(c.product_id), Number(c.unit_landed_paise ?? 0));
  }

  const { data: rows, error } = await supabase
    .from("assembly_items")
    .select("id, item_id, items(name, mrp_paise)")
    .eq("assembly_id", assemblyId);
  if (error) return err(toMessage(error));

  const out: AssemblyBandOutcome = {
    applied: 0, leftAsTyped: 0, refused: 0, lines: [],
  };

  for (const row of rows ?? []) {
    const item = (Array.isArray(row.items) ? row.items[0] : row.items) as
      | { name: string; mrp_paise: number | null }
      | undefined;
    const name = item?.name ?? "—";
    const cost = landed.get(row.id) ?? 0;

    if (!replaceExisting && item?.mrp_paise != null) {
      out.leftAsTyped++;
      out.lines.push({ name, ok: false, reason: "already priced" });
      continue;
    }
    if (cost === 0) {
      out.refused++;
      out.lines.push({ name, ok: false, reason: "no cost yet, so there is no margin to price from" });
      continue;
    }

    let rec: Record<string, unknown> | null = null;
    if (mode === "rules_first") {
      const { data } = await supabase.rpc("recommend_price", {
        p_item: row.item_id, p_band: null, p_landed: cost,
      });
      rec = (Array.isArray(data) ? data[0] : data) ?? null;
      if (!rec || rec.rule_id === null) rec = null;
    }
    if (!rec) {
      const { data } = await supabase.rpc("recommend_price", {
        p_item: row.item_id, p_band: bandId, p_landed: cost,
      });
      rec = (Array.isArray(data) ? data[0] : data) ?? null;
    }
    if (!rec || rec.recommended_mrp_paise === null) {
      out.refused++;
      out.lines.push({ name, ok: false, reason: "no price could be worked out" });
      continue;
    }

    const mrp = Number(rec.recommended_mrp_paise);
    const { error: wErr } = await supabase
      .from("items")
      .update({ mrp_paise: mrp, selling_price_paise: mrp })
      .eq("id", row.item_id);
    if (wErr) {
      out.refused++;
      out.lines.push({ name, ok: false, reason: toMessage(wErr) });
      continue;
    }
    out.applied++;
    out.lines.push({
      name, ok: true,
      reason: rec.in_band === false ? "priced, but outside the band" : undefined,
    });
  }

  revalidatePath(`${PATH}/${assemblyId}`);
  return ok(out);
}

/** Deletes a draft, and the parent items created inside it.
 *
 *  Only a draft: once approved, materials have been consumed and stock
 *  moved, and deleting the paperwork behind a stock movement is how a
 *  ledger stops meaning anything. A wrong approved assembly needs a
 *  correcting entry, not an erasure.
 */
export async function deleteAssembly(assemblyId: string): Promise<Result<void>> {
  const supabase = await createClient();

  const { data: asm } = await supabase
    .from("assemblies")
    .select("status")
    .eq("id", assemblyId)
    .maybeSingle();
  if (!asm) return err("That assembly could not be found.");
  if (asm.status !== "draft") {
    return err(
      `This assembly is ${asm.status} and cannot be deleted. Send it back to draft first, or leave it as a record.`,
    );
  }

  // The parent ASINs were created by this document and exist for nothing
  // else, so they go with it rather than lingering as unsellable rows.
  const { data: items } = await supabase
    .from("assembly_items")
    .select("item_id")
    .eq("assembly_id", assemblyId);

  const { error } = await supabase.from("assemblies").delete().eq("id", assemblyId);
  if (error) return err(toMessage(error));

  for (const row of items ?? []) {
    // Best effort: an item that has since picked up stock or a bill will
    // refuse to delete, and that refusal is correct.
    await supabase.from("items").delete().eq("id", row.item_id);
  }

  revalidatePath(PATH);
  return ok(undefined);
}

/** Sends a submitted assembly back to draft so it can be corrected. */
export async function reopenAssembly(assemblyId: string): Promise<Result<void>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("assemblies")
    .update({ status: "draft", submitted_at: null })
    .eq("id", assemblyId)
    .eq("status", "submitted")
    .select("id");
  if (error) return err(toMessage(error));
  if (!data || data.length === 0) {
    return err("Only a submitted assembly can be reopened.");
  }
  revalidatePath(`${PATH}/${assemblyId}`);
  return ok(undefined);
}

/**
 * Attach an item that already exists as the thing being assembled.
 *
 * Same escape hatch the inward page has: the piece may already be in the
 * catalog because someone created it ahead of the work, or because a
 * previous assembly line was deleted. Making them retype it as a new
 * ASIN would leave two catalog entries for one design.
 *
 * Unlike inward, the item does NOT have to be unattached — a design made
 * repeatedly is normal here, and each run is its own document.
 */
export async function attachExistingToAssembly(
  formData: FormData,
): Promise<Result<void>> {
  const assemblyId = String(formData.get("assemblyId") ?? "");
  const itemId = String(formData.get("itemId") ?? "");
  const qty = Math.max(1, Number(formData.get("qty") ?? 1));
  const labourHours = Math.max(0, Number(formData.get("labourHours") ?? 0));

  if (!assemblyId || !itemId) return err("Choose an item.");

  const supabase = await createClient();

  // Already on this document? Adding it twice would create two blocks
  // for one product and split its materials across them.
  const { data: dupe } = await supabase
    .from("assembly_items")
    .select("id")
    .eq("assembly_id", assemblyId)
    .eq("item_id", itemId)
    .maybeSingle();
  if (dupe) return err("That product is already on this document.");

  const { data: last } = await supabase
    .from("assembly_items")
    .select("line_no")
    .eq("assembly_id", assemblyId)
    .order("line_no", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();

  const { error } = await supabase.from("assembly_items").insert({
    assembly_id: assemblyId,
    item_id: itemId,
    qty,
    labour_hours: labourHours,
    line_no: (last?.line_no ?? 0) + 1,
  });
  if (error) return err(toMessage(error));

  revalidatePath(`${PATH}/${assemblyId}`);
  return ok(undefined);
}

export interface AssemblyPickItem {
  id: string;
  barcode: string;
  name: string;
  categoryName: string;
}

/** Catalog search for the attach dialog. Any active or pending item can
 *  be made in-house, so this is not filtered the way inward's is. */
export async function searchAssemblyParents(
  term: string,
): Promise<Result<AssemblyPickItem[]>> {
  const t = term.trim();
  const supabase = await createClient();

  let q = supabase
    .from("items")
    .select("id, barcode, name, categories(name)")
    .in("status", ["active", "pending_pricing"])
    // Barcode descending, matching every other item list in the app.
    .order("is_test")
    .order("barcode", { ascending: false })
    .limit(25);

  if (t) q = q.or(`barcode.ilike.%${t}%,name.ilike.%${t}%`);

  const { data, error } = await q;
  if (error) return err(toMessage(error));

  return ok(
    (data ?? []).map((i) => {
      const c = (Array.isArray(i.categories) ? i.categories[0] : i.categories) as
        | { name: string }
        | undefined;
      return {
        id: i.id,
        barcode: i.barcode,
        name: i.name,
        categoryName: c?.name ?? "—",
      };
    }),
  );
}

/** A material with no catalog entry: thread, glue, a loose findings
 *  packet. Costs the piece properly without inventing a catalog row for
 *  a rupee of thread, and consumes no stock because there is none. */
export async function addCustomComponent(
  assemblyId: string,
  productId: string,
  description: string,
  qty: number,
  costPaise: number,
): Promise<Result<void>> {
  const d = description.trim();
  if (!d) return err("Describe what it is.");

  const supabase = await createClient();
  const { error } = await supabase.from("assembly_components").insert({
    assembly_item_id: productId,
    item_id: null,
    description: d,
    qty: Math.max(0.001, qty),
    override_cost_paise: Math.max(0, costPaise),
  });
  if (error) return err(toMessage(error));

  await supabase.rpc("compute_assembly_costs", { p_assembly: assemblyId });
  revalidatePath(`${PATH}/${assemblyId}`);
  return ok(undefined);
}

/**
 * Take an approved assembly apart: pieces out of stock, materials back
 * in, and the document returns to draft. Refused if the pieces are no
 * longer on the shelf.
 */
export async function dismantleAssembly(assemblyId: string): Promise<Result<void>> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("dismantle_assembly", { p_assembly: assemblyId });
  if (error) return err(toMessage(error));
  revalidatePath(`${PATH}/${assemblyId}`);
  revalidatePath("/stock");
  return ok(undefined);
}

/**
 * Rename, re-attribute and re-photograph a piece while pricing it.
 *
 * The same three edits the inward pricing screen allows, and needed for
 * the same reason: pricing is the moment someone looks properly at the
 * piece, and it is when a name typed at the bench gets corrected and the
 * stone and plating actually get recorded.
 *
 * Item-scoped, like their inward counterparts — those take an inwardId
 * only to know what to revalidate, so these are thin equivalents rather
 * than a second implementation of the rule.
 */
export async function renameAssemblyItem(
  assemblyId: string,
  itemId: string,
  name: string,
): Promise<Result<void>> {
  const n = name.trim();
  if (n.length < 2) return err("Give the item a name.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("rename_item", { p_item: itemId, p_name: n });
  if (error) return err(toMessage(error));
  revalidatePath(`${PATH}/${assemblyId}`);
  return ok(undefined);
}

export async function setAssemblyItemAttributes(
  assemblyId: string,
  itemId: string,
  attrs: {
    colourId?: string | null;
    platingId?: string | null;
    stoneId?: string | null;
    sizeId?: string | null;
  },
): Promise<Result<void>> {
  const blank = (v: string | null | undefined) => (v && v.length > 0 ? v : null);

  const supabase = await createClient();
  const { error } = await supabase
    .from("items")
    .update({
      colour_id: blank(attrs.colourId),
      plating_id: blank(attrs.platingId),
      stone_id: blank(attrs.stoneId),
      size_id: blank(attrs.sizeId),
    })
    .eq("id", itemId);

  if (error) return err(toMessage(error));
  revalidatePath(`${PATH}/${assemblyId}`);
  return ok(undefined);
}

export async function addAssemblyItemPhotos(
  assemblyId: string,
  itemId: string,
  paths: string[],
): Promise<Result<void>> {
  if (paths.length === 0) return ok(undefined);

  const supabase = await createClient();
  const { data: staffRows } = await supabase.rpc("get_current_staff");
  const staff = Array.isArray(staffRows) ? staffRows[0] : staffRows;

  // Only the first photo on an item may be primary, enforced by a
  // partial unique index — so check rather than assume.
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
      uploaded_by: staff?.staff_id ?? null,
    })),
  );
  if (error) return err(toMessage(error));
  revalidatePath(`${PATH}/${assemblyId}`);
  return ok(undefined);
}
