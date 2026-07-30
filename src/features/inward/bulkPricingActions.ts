"use server";

import { createClient } from "@/lib/supabase/server";
import { err, ok, toMessage, type Result } from "@/lib/result";
import { revalidateInwardCosts } from "./costCache";

/**
 * Document-level pricing.
 *
 * Pricing a carton is one decision, not thirty. These two actions do the
 * whole inward in a pass and report per line what happened, because the
 * lines they could NOT do are the ones that need a human.
 *
 * Both skip anything already filled in by default. A bulk action that
 * silently overwrites deliberate work is one nobody dares press twice.
 * `replaceExisting` is the deliberate escape hatch, driven by an explicit
 * checkbox, for when the existing values are the ones that are wrong.
 *
 * compute_inward_costs is called once at the end rather than per line —
 * it reallocates freight across the whole document, so calling it inside
 * the loop would be both slow and repeatedly wrong until the last line.
 */

export interface BulkLineOutcome {
  lineId: string;
  itemName: string;
  ok: boolean;
  /** Present when the line was skipped or refused. */
  reason?: string;
}

export interface BulkOutcome {
  applied: number;
  leftAsTyped: number;
  refused: number;
  lines: BulkLineOutcome[];
}

interface LineRow {
  id: string;
  item_id: string;
  items: { name: string; mrp_paise: number | null; gst_rate: number } | null;
  inward_line_costs: { rate_paise: number | null } | null;
}

function one<T>(v: T | T[] | null | undefined): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : (v ?? null);
}

async function loadLines(inwardId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("inward_lines")
    .select(
      `id, item_id,
       items(name, mrp_paise, gst_rate),
       inward_line_costs(rate_paise)`,
    )
    .eq("inward_id", inwardId)
    .order("created_at");

  if (error) return { supabase, lines: null as LineRow[] | null, error };
  return { supabase, lines: (data ?? []) as unknown as LineRow[], error: null };
}


/**
 * Read a purchase rate off each product title.
 *
 * Only DDMMYYYY is a valid stamp (plus the 7-digit form where the day or
 * month lost a leading zero). parse_design_code returns nothing for
 * anything else, and a line that cannot be read is reported, never
 * guessed at — a refused parse costs one typed rate, a wrong one costs a
 * mispriced carton.
 */
export async function applyRatesFromTitles(
  inwardId: string,
  replaceExisting = false,
): Promise<Result<BulkOutcome>> {
  const { supabase, lines, error } = await loadLines(inwardId);
  if (error || !lines) return err(toMessage(error));
  if (lines.length === 0) return err("This document has no lines.");

  const { data: inward, error: iErr } = await supabase
    .from("inwards")
    .select("vendor_id, vendors(name, pricing_mode, code_multiple)")
    .eq("id", inwardId)
    .maybeSingle();

  if (iErr) return err(toMessage(iErr));

  const vendor = one(inward?.vendors) as
    | { name: string; pricing_mode: string; code_multiple: string | null }
    | null;

  if (!vendor || vendor.pricing_mode !== "code_multiple" || !vendor.code_multiple) {
    return err(
      `${vendor?.name ?? "This vendor"} is not set up to price from a design code. ` +
        `Set the convention and multiple on the vendor page first.`,
    );
  }

  const out: BulkLineOutcome[] = [];
  let applied = 0, leftAsTyped = 0, refused = 0;

  for (const line of lines) {
    const name = line.items?.name ?? "—";
    const existing = one(line.inward_line_costs)?.rate_paise ?? null;

    if (!replaceExisting && existing !== null && existing > 0) {
      leftAsTyped++;
      out.push({ lineId: line.id, itemName: name, ok: false, reason: "Rate already entered" });
      continue;
    }

    const { data: rate } = await supabase.rpc("suggest_rate_from_title", {
      p_vendor: inward!.vendor_id,
      p_title: name,
    });

    if (rate === null || rate === undefined) {
      refused++;
      out.push({
        lineId: line.id, itemName: name, ok: false,
        reason: "No valid DDMMYYYY code in the title — type the rate by hand",
      });
      continue;
    }

    // Flag an ambiguous split rather than let it pass unremarked: the
    // 8- and 7-digit readings differ by a factor of ten on the rate.
    const { data: parsed } = await supabase.rpc("parse_design_code", {
      p_title: name, p_has_date: true,
    });
    const p = Array.isArray(parsed) ? parsed[0] : parsed;

    const { error: wErr } = await supabase
      .from("inward_line_costs")
      .upsert(
        {
          inward_line_id: line.id,
          rate_paise: Number(rate),
          gst_rate: line.items?.gst_rate ?? 3,
        },
        { onConflict: "inward_line_id" },
      );

    if (wErr) {
      refused++;
      out.push({ lineId: line.id, itemName: name, ok: false, reason: toMessage(wErr) });
      continue;
    }

    applied++;
    out.push({
      lineId: line.id, itemName: name, ok: true,
      reason: p?.ambiguous
        ? `Read as code ${p.code}; could also be ${p.alt_code} — check this one`
        : undefined,
    });
  }

  if (applied > 0) {
    await supabase.rpc("compute_inward_costs", { p_inward: inwardId });
    await revalidateInwardCosts(inwardId);
  }

  return ok({ applied, leftAsTyped, refused, lines: out });
}

/**
 * Price the whole document from a band.
 *
 * "rules_first" lets each item's own pricing rule win and falls back to
 * the chosen band only where no rule reaches it. "override" ignores rules
 * entirely. MRP is computed off the BARE rate, deliberately: freight
 * allocation depends on what else shared the carton, so pricing off
 * landed cost would give two identical necklaces different MRPs according
 * to which shipment they arrived in.
 */
export async function applyBandToDocument(
  inwardId: string,
  bandId: string,
  mode: "rules_first" | "override",
  replaceExisting = false,
): Promise<Result<BulkOutcome>> {
  if (!bandId) return err("Choose a band first.");

  const { supabase, lines, error } = await loadLines(inwardId);
  if (error || !lines) return err(toMessage(error));
  if (lines.length === 0) return err("This document has no lines.");

  const out: BulkLineOutcome[] = [];
  let applied = 0, leftAsTyped = 0, refused = 0;

  for (const line of lines) {
    const name = line.items?.name ?? "—";
    const rate = one(line.inward_line_costs)?.rate_paise ?? null;

    if (!replaceExisting
        && line.items?.mrp_paise !== null
        && line.items?.mrp_paise !== undefined) {
      leftAsTyped++;
      out.push({ lineId: line.id, itemName: name, ok: false, reason: "Already priced" });
      continue;
    }

    if (rate === null || rate === 0) {
      refused++;
      out.push({
        lineId: line.id, itemName: name, ok: false,
        reason: "No rate yet, so there is no margin to price from",
      });
      continue;
    }

    // Rules first: ask with no band so the item's own rule decides, then
    // fall back to the chosen band only if no rule actually matched.
    let rec: Record<string, unknown> | null = null;

    if (mode === "rules_first") {
      const { data } = await supabase.rpc("recommend_price", {
        p_item: line.item_id, p_band: null, p_landed: rate,
      });
      rec = (Array.isArray(data) ? data[0] : data) ?? null;
      if (!rec || rec.rule_id === null) rec = null;
    }

    if (!rec) {
      const { data } = await supabase.rpc("recommend_price", {
        p_item: line.item_id, p_band: bandId, p_landed: rate,
      });
      rec = (Array.isArray(data) ? data[0] : data) ?? null;
    }

    if (!rec || rec.recommended_mrp_paise === null) {
      refused++;
      out.push({ lineId: line.id, itemName: name, ok: false, reason: "No price could be worked out" });
      continue;
    }

    const mrp = Number(rec.recommended_mrp_paise);

    // MRP and selling match on almost everything here, so set both.
    const { error: wErr } = await supabase
      .from("items")
      .update({ mrp_paise: mrp, selling_price_paise: mrp })
      .eq("id", line.item_id);

    if (wErr) {
      refused++;
      out.push({ lineId: line.id, itemName: name, ok: false, reason: toMessage(wErr) });
      continue;
    }

    applied++;
    out.push({
      lineId: line.id, itemName: name, ok: true,
      reason: rec.in_band === false ? "Priced, but the grid pushed it outside the band" : undefined,
    });
  }

  if (applied > 0) {
    await supabase.rpc("compute_inward_costs", { p_inward: inwardId });
    await revalidateInwardCosts(inwardId);
  }

  return ok({ applied, leftAsTyped, refused, lines: out });
}

/**
 * The invoice-level trade discount, as printed on the vendor's bill.
 *
 * Applied before tax and prorated across lines by value, because that is
 * how GST treats a discount recorded on the invoice: the taxable value
 * itself is reduced, so tax is charged on the net and the ITC claimed
 * matches what the vendor filed.
 *
 * A credit note received later is a different animal — it does not reduce
 * taxable value — and belongs against the vendor on the payments side,
 * not folded into the cost of stock.
 */
export async function saveInwardDiscount(
  inwardId: string,
  kind: "none" | "percent" | "amount",
  value: string,
): Promise<Result<void>> {
  const supabase = await createClient();

  let bps: number | null = null;
  let paise: number | null = null;

  if (kind === "percent") {
    const pct = Number(value.replace(/[%\s]/g, ""));
    if (!Number.isFinite(pct) || pct <= 0 || pct > 100) {
      return err("Enter a discount percentage between 0 and 100.");
    }
    bps = Math.round(pct * 100);
  } else if (kind === "amount") {
    const rupees = Number(value.replace(/[,\s]/g, ""));
    if (!Number.isFinite(rupees) || rupees <= 0) {
      return err("Enter a discount amount like 250 or 250.50");
    }
    paise = Math.round(rupees * 100);
  }

  const { error: wErr } = await supabase
    .from("inwards")
    .update({ discount_kind: kind, discount_bps: bps, discount_paise: paise })
    .eq("id", inwardId);

  if (wErr) return err(toMessage(wErr));

  await supabase.rpc("compute_inward_costs", { p_inward: inwardId });
  await revalidateInwardCosts(inwardId);
  return ok(undefined);
}
