"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { ROUTES } from "@/config/nav";
import { err, ok, toMessage, type Result } from "@/lib/result";
import type { PriceRecommendation, VendorPricingMode } from "@/types/domain";

/**
 * Pricing writes.
 *
 * Nothing here checks a role. set_item_price and apply_pricing_rules
 * both raise "Only the owner can set prices." from inside the function,
 * and pricing_rules / pricing_settings are owner-only by RLS. A staff
 * session calling any of this gets a database error — the right failure
 * direction, and it keeps the UI from quietly becoming the security
 * boundary.
 */

function toRecommendation(
  row: Record<string, unknown> | undefined | null,
): PriceRecommendation | null {
  if (!row || row.recommended_mrp_paise === null || row.recommended_mrp_paise === undefined) {
    return null;
  }
  return {
    landedCostPaise: Number(row.landed_cost_paise),
    bandId: String(row.band_id),
    bandLabel: String(row.band_label),
    loBps: Number(row.lo_bps),
    hiBps: Number(row.hi_bps),
    targetBps: Number(row.target_bps),
    ruleId: (row.rule_id as string | null) ?? null,
    ruleName: (row.rule_name as string | null) ?? null,
    mrpMinPaise: Number(row.mrp_min_paise),
    mrpMaxPaise: Number(row.mrp_max_paise),
    idealMrpPaise: Number(row.ideal_mrp_paise),
    recommendedMrpPaise: Number(row.recommended_mrp_paise),
    achievedMarginBps: Number(row.achieved_margin_bps),
    inBand: Boolean(row.in_band),
  };
}

/**
 * What would this item be priced at, in this band?
 *
 * Read-only. Returns null data rather than an error when the item has no
 * landed cost, because that is an ordinary state for a freshly created
 * item, not a fault the owner needs an error box about.
 */
export async function previewRecommendation(
  itemId: string,
  bandId: string | null,
): Promise<Result<PriceRecommendation | null>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("recommend_price", {
    p_item: itemId,
    p_band: bandId,
    p_landed: null,
  });

  if (error) return err(toMessage(error));
  return ok(toRecommendation(Array.isArray(data) ? data[0] : data));
}

const savePriceSchema = z.object({
  itemId: z.string().uuid(),
  mrpPaise: z.number().int().positive("Enter an MRP above zero."),
  sellingPricePaise: z.number().int().positive().nullable().optional(),
  bandId: z.string().uuid().nullable().optional(),
});

/** Set one item's price. Selling defaults to MRP inside the function. */
export async function savePrice(input: {
  itemId: string;
  mrpPaise: number;
  sellingPricePaise?: number | null;
  bandId?: string | null;
}): Promise<Result> {
  const parsed = savePriceSchema.safeParse(input);
  if (!parsed.success) {
    return err(parsed.error.issues[0]?.message ?? "Check the amounts.");
  }
  const v = parsed.data;

  const supabase = await createClient();
  const { error } = await supabase.rpc("set_item_price", {
    p_item: v.itemId,
    p_mrp: v.mrpPaise,
    p_selling: v.sellingPricePaise ?? null,
    p_band: v.bandId ?? null,
    p_source: "manual",
    p_note: null,
  });

  if (error) return err(toMessage(error));

  revalidatePath(ROUTES.pricing);
  revalidatePath(ROUTES.products);
  revalidatePath(ROUTES.productDetail(v.itemId));
  return ok(undefined);
}

export interface RuleApplyResult {
  applied: number;
  skipped: Array<{ itemId: string; reason: string }>;
}

/**
 * Price a batch from whatever rule governs each item.
 *
 * The skipped list matters more than the count. An item with no landed
 * cost, or one whose category has no rule and no default band, cannot be
 * priced — and a carton that half-prices itself in silence is how a
 * mispriced tray reaches the counter.
 */
export async function applyRulesToItems(
  itemIds: string[],
): Promise<Result<RuleApplyResult>> {
  if (itemIds.length === 0) return err("Select at least one item first.");

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("apply_pricing_rules", {
    p_items: itemIds,
  });

  if (error) return err(toMessage(error));

  const rows = (data ?? []) as Array<Record<string, unknown>>;
  const skipped = rows
    .filter((r) => !r.applied)
    .map((r) => ({ itemId: String(r.item_id), reason: String(r.reason) }));

  revalidatePath(ROUTES.pricing);
  revalidatePath(ROUTES.products);

  return ok({ applied: rows.length - skipped.length, skipped });
}

const ruleSchema = z.object({
  name: z.string().min(1, "Give the rule a name.").max(120),
  vendorId: z.string().uuid().nullable().optional(),
  categoryId: z.string().uuid().nullable().optional(),
  itemTypeId: z.string().uuid().nullable().optional(),
  bandId: z.string().uuid("Choose a band."),
});

export async function saveRule(input: {
  name: string;
  vendorId: string | null;
  categoryId: string | null;
  itemTypeId: string | null;
  bandId: string;
}): Promise<Result> {
  const parsed = ruleSchema.safeParse(input);
  if (!parsed.success) {
    return err(parsed.error.issues[0]?.message ?? "Check the rule.");
  }
  const v = parsed.data;

  const supabase = await createClient();
  const { error } = await supabase.from("pricing_rules").insert({
    name: v.name,
    vendor_id: v.vendorId ?? null,
    category_id: v.categoryId ?? null,
    item_type_id: v.itemTypeId ?? null,
    band_id: v.bandId,
  });

  if (error) {
    // A partial unique index allows one ACTIVE rule per distinct scope.
    // Say that, rather than surfacing the constraint name.
    if (String(error.message).includes("pricing_rules_scope_uk")) {
      return err("A rule already covers exactly that combination. Retire it first.");
    }
    return err(toMessage(error));
  }

  revalidatePath(ROUTES.pricingRules);
  revalidatePath(ROUTES.pricing);
  return ok(undefined);
}

/** Retire, never delete: a price set last month should stay explicable. */
export async function deleteRule(ruleId: string): Promise<Result> {
  if (!ruleId) return err("Missing rule.");

  const supabase = await createClient();
  const { error } = await supabase
    .from("pricing_rules")
    .update({ active: false })
    .eq("id", ruleId);

  if (error) return err(toMessage(error));

  revalidatePath(ROUTES.pricingRules);
  revalidatePath(ROUTES.pricing);
  return ok(undefined);
}

const settingsSchema = z.object({
  targetNudgeBps: z.number().int()
    .min(-200, "The nudge is capped at two points either way.")
    .max(200, "The nudge is capped at two points either way."),
  roundMode: z.enum(["nearest", "up"]),
  marginIncludesGst: z.boolean(),
  defaultBandId: z.string().uuid().nullable().optional(),
});

export async function savePricingSettings(input: {
  targetNudgeBps: number;
  roundMode: "nearest" | "up";
  marginIncludesGst: boolean;
  defaultBandId: string | null;
}): Promise<Result> {
  const parsed = settingsSchema.safeParse(input);
  if (!parsed.success) {
    return err(parsed.error.issues[0]?.message ?? "Check the settings.");
  }
  const v = parsed.data;

  const supabase = await createClient();
  const { error } = await supabase
    .from("pricing_settings")
    .update({
      target_nudge_bps: v.targetNudgeBps,
      round_mode: v.roundMode,
      margin_includes_gst: v.marginIncludesGst,
      default_band_id: v.defaultBandId ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", true);

  if (error) return err(toMessage(error));

  revalidatePath(ROUTES.pricingSettings);
  revalidatePath(ROUTES.pricing);
  return ok(undefined);
}

const vendorPricingSchema = z.object({
  vendorId: z.string().uuid(),
  pricingMode: z.enum(["code_multiple", "serial_list", "manual"]),
  codeMultiple: z.number().positive().nullable().optional(),
  codeHasDateSuffix: z.boolean(),
  pricingNote: z.string().max(500).nullable().optional(),
});

/**
 * How a vendor prices.
 *
 * Until this is set on the Jaipur vendors, nothing derives a rate and
 * every item falls through to manual entry. It is the first thing to
 * fill in on a fresh install.
 */
export async function saveVendorPricing(input: {
  vendorId: string;
  pricingMode: VendorPricingMode;
  codeMultiple: number | null;
  codeHasDateSuffix: boolean;
  pricingNote: string | null;
}): Promise<Result> {
  const parsed = vendorPricingSchema.safeParse(input);
  if (!parsed.success) {
    return err(parsed.error.issues[0]?.message ?? "Check the vendor pricing.");
  }
  const v = parsed.data;

  if (v.pricingMode === "code_multiple" && !v.codeMultiple) {
    return err("A code-multiple vendor needs a multiple; without it no rate can be derived.");
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("vendors")
    .update({
      pricing_mode: v.pricingMode,
      code_multiple: v.pricingMode === "code_multiple" ? v.codeMultiple : null,
      code_has_date_suffix: v.codeHasDateSuffix,
      pricing_note: v.pricingNote || null,
    })
    .eq("id", v.vendorId);

  if (error) return err(toMessage(error));

  revalidatePath(ROUTES.vendorDetail(v.vendorId));
  revalidatePath(ROUTES.pricing);
  return ok(undefined);
}

export interface DesignCodeProbe {
  code: string | null;
  rateePaise: number | null;
  ambiguous: boolean;
  altCode: string | null;
  parsedDate: string | null;
}

/**
 * Try the parser against a sample title before trusting it on a carton.
 *
 * The ambiguous flag is the point of this. "...34329072026" splits two
 * legal ways — code 343 with 29/07/2026, or code 3432 with 9/07/2026 —
 * and those differ by a factor of ten on the rate. Better to see that on
 * one sample now than to find it in a tray of mispriced stock.
 */
export async function readDesignCode(
  vendorId: string,
  sampleTitle: string,
): Promise<Result<DesignCodeProbe>> {
  if (!sampleTitle.trim()) return err("Paste a product title to test.");

  const supabase = await createClient();

  const { data: vendor, error: vErr } = await supabase
    .from("vendors")
    .select("code_has_date_suffix")
    .eq("id", vendorId)
    .maybeSingle();

  if (vErr) return err(toMessage(vErr));

  const [parsed, rate] = await Promise.all([
    supabase.rpc("parse_design_code", {
      p_title: sampleTitle,
      p_has_date: vendor?.code_has_date_suffix ?? true,
    }),
    supabase.rpc("suggest_rate_from_title", {
      p_vendor: vendorId,
      p_title: sampleTitle,
    }),
  ]);

  if (parsed.error) return err(toMessage(parsed.error));

  const p = (Array.isArray(parsed.data) ? parsed.data[0] : parsed.data) as
    | Record<string, unknown>
    | null;

  return ok({
    code: (p?.code as string | null) ?? null,
    rateePaise: rate.data === null || rate.data === undefined ? null : Number(rate.data),
    ambiguous: Boolean(p?.ambiguous),
    altCode: (p?.alt_code as string | null) ?? null,
    parsedDate: (p?.parsed_date as string | null) ?? null,
  });
}

/**
 * A recommendation from a rate being typed, before the inward is approved.
 *
 * The inward screen is where an item's FIRST price is set, and at that
 * moment no landed cost exists — compute_inward_costs has not run. So the
 * bare rate is passed straight in as p_landed.
 *
 * That is deliberate, not a shortcut. Freight allocation depends on what
 * else shared the carton, so pricing off landed cost gives two identical
 * necklaces different MRPs according to which shipment they arrived in.
 * Pricing off the rate keeps identical pieces priced identically; the
 * freight is shown separately in the Landed and Margin columns so the
 * cost of it stays visible.
 */
export async function recommendForRate(
  itemId: string,
  bandId: string | null,
  ratePaise: number,
): Promise<Result<PriceRecommendation | null>> {
  if (!ratePaise || ratePaise <= 0) return ok(null);

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("recommend_price", {
    p_item: itemId,
    p_band: bandId,
    p_landed: ratePaise,
  });

  if (error) return err(toMessage(error));
  return ok(toRecommendation(Array.isArray(data) ? data[0] : data));
}

/**
 * Renames an item from the pricing bench.
 *
 * Pricing is the first time anyone looks properly at a new piece, and it
 * is where the vendor's shorthand gets noticed. The name is what the
 * counter searches on and what prints on the customer's bill, so fixing
 * it here rather than on a separate trip to the product page is worth
 * the field.
 */
export async function renameItem(
  itemId: string,
  name: string,
): Promise<Result<string>> {
  const trimmed = name.trim();
  if (trimmed.length < 2) return err("Give the item a name.");

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("rename_item", {
    p_item: itemId,
    p_name: trimmed,
  });
  if (error) return err(toMessage(error));

  revalidatePath(ROUTES.pricing);
  revalidatePath(ROUTES.products);
  revalidatePath(ROUTES.productDetail(itemId));
  return ok(String(data ?? trimmed));
}

/**
 * Margin bands, owner only.
 *
 * The nine bands ("25–30%", "30–35%" ...) were seeded once by a
 * migration and had no editor anywhere — anyone wanting a different
 * spread had to ask for a database change. Renaming and adjusting a band
 * stays open even once it has history behind it, the same as a
 * category: the label is what the counter and the pricing bench show,
 * not an identity, and today's "50-55%" reading differently next season
 * should not require a new row.
 */
export async function savePriceBand(input: {
  id: string | null;
  label: string;
  loPercent: number;
  hiPercent: number;
  active: boolean;
}): Promise<Result<string>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("save_price_band", {
    p_id: input.id,
    p_label: input.label,
    p_lo_bps: Math.round(input.loPercent * 100),
    p_hi_bps: Math.round(input.hiPercent * 100),
    p_active: input.active,
  });
  if (error) return err(toMessage(error));
  revalidatePath(ROUTES.pricingSettings);
  revalidatePath(ROUTES.pricing);
  return ok(String(data));
}

/** Refused, with the reason, unless nothing past or present uses the band. */
export async function deletePriceBand(id: string): Promise<Result<string>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("delete_price_band", { p_id: id });
  if (error) return err(toMessage(error));
  revalidatePath(ROUTES.pricingSettings);
  revalidatePath(ROUTES.pricing);
  return ok(String(data));
}
