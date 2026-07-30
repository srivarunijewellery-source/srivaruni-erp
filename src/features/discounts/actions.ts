"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { ROUTES } from "@/config/nav";
import { err, ok, toMessage, type Result } from "@/lib/result";
import type { DiscountResolution } from "@/types/domain";

const targetSchema = z.object({
  categoryId: z.string().uuid().nullable().optional(),
  itemTypeId: z.string().uuid().nullable().optional(),
  vendorId: z.string().uuid().nullable().optional(),
  platingId: z.string().uuid().nullable().optional(),
  stoneId: z.string().uuid().nullable().optional(),
  colourId: z.string().uuid().nullable().optional(),
  sizeId: z.string().uuid().nullable().optional(),
  itemId: z.string().uuid().nullable().optional(),
});

const schemeSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1, "Name the offer.").max(80),
  scope: z.enum(["selection", "invoice"]),
  valueKind: z.enum(["percent", "amount"]),
  valueBps: z.coerce.number().int().min(1).max(10000).nullable().optional(),
  valuePaise: z.coerce.number().int().positive().nullable().optional(),
  startsOn: z.string().min(1, "Give it a start date."),
  endsOn: z.string().min(1, "Give it an end date."),
  priority: z.coerce.number().int().min(0).max(1000).default(100),
  stackable: z.coerce.boolean().default(false),
  minBillPaise: z.coerce.number().int().nonnegative().default(0),
  maxDiscountPaise: z.coerce.number().int().positive().nullable().optional(),
  locationIds: z.array(z.string().uuid()).nullable().optional(),
  note: z.string().trim().max(200).optional().or(z.literal("")),
  targets: z.array(targetSchema).default([]),
});

/**
 * Creates or replaces an offer.
 *
 * The date window, the ceiling and the "invoice schemes carry no product
 * targets" rule are all enforced by a trigger rather than only here, so
 * a scheme written by any other route obeys the same policy.
 */
export async function saveScheme(input: unknown): Promise<Result<string>> {
  const parsed = schemeSchema.safeParse(input);
  if (!parsed.success) {
    return err(parsed.error.issues[0]?.message ?? "Check the offer.");
  }
  const v = parsed.data;

  if (v.valueKind === "percent" && !v.valueBps) return err("Enter a percentage.");
  if (v.valueKind === "amount" && !v.valuePaise) return err("Enter an amount.");
  if (v.endsOn < v.startsOn) return err("The end date is before the start date.");
  if (v.scope === "invoice" && v.targets.length > 0) {
    return err("A whole-bill offer applies to everything and cannot carry product targets.");
  }

  const row = {
    name: v.name,
    scope: v.scope,
    value_kind: v.valueKind,
    value_bps: v.valueKind === "percent" ? v.valueBps : null,
    value_paise: v.valueKind === "amount" ? v.valuePaise : null,
    starts_on: v.startsOn,
    ends_on: v.endsOn,
    priority: v.priority,
    stackable: v.stackable,
    min_bill_paise: v.minBillPaise,
    max_discount_paise: v.maxDiscountPaise ?? null,
    location_ids: v.locationIds && v.locationIds.length > 0 ? v.locationIds : null,
    note: v.note || null,
  };

  const supabase = await createClient();

  const { data, error } = v.id
    ? await supabase.from("discount_schemes").update(row).eq("id", v.id).select("id").single()
    : await supabase.from("discount_schemes").insert(row).select("id").single();

  if (error) return err(toMessage(error));
  const schemeId = data.id as string;

  // Targets are replaced wholesale. Diffing them would be more code for
  // a set that is never more than a handful of rows.
  await supabase.from("discount_targets").delete().eq("scheme_id", schemeId);

  if (v.targets.length > 0) {
    const { error: tErr } = await supabase.from("discount_targets").insert(
      v.targets.map((t) => ({
        scheme_id: schemeId,
        category_id: t.categoryId || null,
        item_type_id: t.itemTypeId || null,
        vendor_id: t.vendorId || null,
        plating_id: t.platingId || null,
        stone_id: t.stoneId || null,
        colour_id: t.colourId || null,
        size_id: t.sizeId || null,
        item_id: t.itemId || null,
      })),
    );
    if (tErr) return err(toMessage(tErr));
  }

  revalidatePath(ROUTES.discounts);
  return ok(schemeId);
}

export async function setSchemeActive(id: string, active: boolean): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase.from("discount_schemes").update({ active }).eq("id", id);
  if (error) return err(toMessage(error));
  revalidatePath(ROUTES.discounts);
  return ok(undefined);
}

export async function deleteScheme(id: string): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase.from("discount_schemes").delete().eq("id", id);
  if (error) return err(toMessage(error));
  revalidatePath(ROUTES.discounts);
  return ok(undefined);
}

const settingsSchema = z.object({
  maxPercentStaffBps: z.coerce.number().int().min(0).max(10000),
  maxPercentManagerBps: z.coerce.number().int().min(0).max(10000),
  maxPercentOwnerBps: z.coerce.number().int().min(0).max(10000),
  maxCampaignDays: z.coerce.number().int().min(1).max(400),
  allowStacking: z.coerce.boolean(),
  neverBelowCost: z.coerce.boolean(),
  minMarginBps: z.coerce.number().int().min(0).max(9000),
  requireReasonAboveBps: z.coerce.number().int().min(0).max(10000),
  requireApprovalAboveBps: z.coerce.number().int().min(0).max(10000),
});

export async function saveDiscountSettings(input: unknown): Promise<Result> {
  const parsed = settingsSchema.safeParse(input);
  if (!parsed.success) {
    return err(parsed.error.issues[0]?.message ?? "Check the settings.");
  }
  const v = parsed.data;

  if (v.maxPercentStaffBps > v.maxPercentManagerBps
   || v.maxPercentManagerBps > v.maxPercentOwnerBps) {
    return err("The ceilings must not decrease as you go up the roles.");
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("discount_settings")
    .update({
      max_percent_staff_bps: v.maxPercentStaffBps,
      max_percent_manager_bps: v.maxPercentManagerBps,
      max_percent_owner_bps: v.maxPercentOwnerBps,
      max_campaign_days: v.maxCampaignDays,
      allow_stacking: v.allowStacking,
      never_below_cost: v.neverBelowCost,
      min_margin_bps: v.minMarginBps,
      require_reason_above_bps: v.requireReasonAboveBps,
      require_approval_above_bps: v.requireApprovalAboveBps,
      updated_at: new Date().toISOString(),
    })
    .eq("id", true);

  if (error) return err(toMessage(error));
  revalidatePath(ROUTES.discountSettings);
  revalidatePath(ROUTES.discounts);
  return ok(undefined);
}

/**
 * Runs a hypothetical basket through the resolver.
 *
 * This is the same function a till will call. It exists as a screen so
 * the policy can be tested against real stock today, months before there
 * is a cart to test it from.
 */
export async function simulate(input: {
  lines: Array<{ itemId: string; qty: number; unitPricePaise: number }>;
  locationId?: string | null;
  role?: "owner" | "manager" | "staff";
  manualBps?: number | null;
  on?: string | null;
}): Promise<Result<DiscountResolution>> {
  if (input.lines.length === 0) return err("Add at least one item.");

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("resolve_discounts", {
    p_lines: input.lines.map((l) => ({
      item_id: l.itemId, qty: l.qty, unit_price_paise: l.unitPricePaise,
    })),
    p_location: input.locationId ?? null,
    p_on: input.on ?? null,
    p_role: input.role ?? null,
    p_manual_bps: input.manualBps ?? null,
    p_manual_paise: null,
  });

  if (error) return err(toMessage(error));
  return ok(data as DiscountResolution);
}
