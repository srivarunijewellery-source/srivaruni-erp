import { createClient } from "@/lib/supabase/server";
import type {
  DiscountScheme, DiscountSettings, DiscountTarget, StoreLocation,
} from "@/types/domain";

export async function getDiscountSettings(): Promise<DiscountSettings | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("discount_settings").select("*").maybeSingle();
  if (!data) return null;
  return {
    maxPercentStaffBps: data.max_percent_staff_bps,
    maxPercentManagerBps: data.max_percent_manager_bps,
    maxPercentOwnerBps: data.max_percent_owner_bps,
    maxCampaignDays: data.max_campaign_days,
    allowStacking: data.allow_stacking,
    neverBelowCost: data.never_below_cost,
    minMarginBps: data.min_margin_bps,
    requireReasonAboveBps: data.require_reason_above_bps,
    requireApprovalAboveBps: data.require_approval_above_bps,
  };
}

export async function listSchemes(): Promise<DiscountScheme[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("discount_schemes")
    .select(
      `id, name, scope, value_kind, value_bps, value_paise,
       starts_on, ends_on, active, priority, stackable,
       min_bill_paise, max_discount_paise, location_ids, note,
       discount_targets(
         id, category_id, item_type_id, vendor_id, item_id,
         categories(name), item_types(name), vendors(name), items(name)
       )`,
    )
    .order("active", { ascending: false })
    .order("starts_on", { ascending: false });

  if (error) return [];

  return (data ?? []).map((s) => ({
    id: s.id,
    name: s.name,
    scope: s.scope,
    valueKind: s.value_kind,
    valueBps: s.value_bps,
    valuePaise: s.value_paise,
    startsOn: s.starts_on,
    endsOn: s.ends_on,
    active: s.active,
    priority: s.priority,
    stackable: s.stackable,
    minBillPaise: s.min_bill_paise,
    maxDiscountPaise: s.max_discount_paise,
    locationIds: s.location_ids,
    note: s.note,
    targets: ((s.discount_targets ?? []) as Array<never>).map((t) => {
      const row = t as unknown as {
        id: string;
        category_id: string | null; item_type_id: string | null;
        vendor_id: string | null; item_id: string | null;
        categories: { name: string } | null;
        item_types: { name: string } | null;
        vendors: { name: string } | null;
        items: { name: string } | null;
      };
      return {
        id: row.id,
        categoryId: row.category_id,
        categoryName: pick(row.categories)?.name ?? null,
        itemTypeId: row.item_type_id,
        itemTypeName: pick(row.item_types)?.name ?? null,
        vendorId: row.vendor_id,
        vendorName: pick(row.vendors)?.name ?? null,
        itemId: row.item_id,
        itemName: pick(row.items)?.name ?? null,
      } satisfies DiscountTarget;
    }),
  }));
}

export async function listLocations(): Promise<StoreLocation[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("locations")
    .select("id, code, name, kind")
    .eq("kind", "store")
    .eq("active", true)
    .order("code");
  return data ?? [];
}

/** Items the simulator can put in a basket. */
export async function listSellableItems(limit = 300): Promise<Array<{
  id: string; name: string; barcode: string; sellingPricePaise: number | null;
}>> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("items")
    .select("id, name, barcode, selling_price_paise")
    .eq("status", "active")
    .not("selling_price_paise", "is", null)
    .order("name")
    .limit(limit);
  return (data ?? []).map((i) => ({
    id: i.id, name: i.name, barcode: i.barcode,
    sellingPricePaise: i.selling_price_paise,
  }));
}

function pick<T>(v: T | T[] | null | undefined): T | undefined {
  return Array.isArray(v) ? v[0] : (v ?? undefined);
}
