import { createClient } from "@/lib/supabase/server";
import type {
  Category, ItemTypeOption, Paise,
  PriceBand, PricingRule, PricingSettings,
} from "@/types/domain";

/**
 * Pricing reads.
 *
 * Every one of these sits on a cost surface. RLS returns zero rows to a
 * non-owner rather than a partial answer, so nothing here checks a role:
 * the page renders its owner-only notice when the collections come back
 * empty, and the database stays the single arbiter.
 */

function pick<T>(v: T | T[] | null | undefined): T | undefined {
  return Array.isArray(v) ? v[0] : (v ?? undefined);
}

/** One item on the pricing screen. */
export interface PricingRow {
  itemId: string;
  barcode: string;
  name: string;
  categoryName: string;
  vendorName: string | null;
  photoPath: string | null;
  mrpPaise: Paise | null;
  sellingPricePaise: Paise | null;
  landedCostPaise: Paise | null;
}

export async function listBands(): Promise<PriceBand[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("price_bands")
    .select("id, label, lo_bps, hi_bps")
    .eq("active", true)
    .order("sort_order");

  if (error) return [];
  return (data ?? []).map((b) => ({
    id: b.id, label: b.label, loBps: b.lo_bps, hiBps: b.hi_bps,
  }));
}

export async function getPricingSettings(): Promise<PricingSettings | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("pricing_settings")
    .select(
      `target_nudge_bps, round_mode, grid_switch_paise, high_ending_paise,
       low_endings_paise, margin_includes_gst, default_band_id`,
    )
    .maybeSingle();

  if (error || !data) return null;
  return {
    targetNudgeBps: data.target_nudge_bps,
    roundMode: data.round_mode,
    gridSwitchPaise: data.grid_switch_paise,
    highEndingPaise: data.high_ending_paise,
    lowEndingsPaise: data.low_endings_paise ?? [],
    marginIncludesGst: data.margin_includes_gst,
    defaultBandId: data.default_band_id,
  };
}

/** Most specific first, matching how the database resolves them. */
export async function listRules(): Promise<PricingRule[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("pricing_rules")
    .select(
      `id, name, band_id, active, specificity,
       vendor_id, category_id, item_type_id,
       vendors(name), categories(name), item_types(name),
       price_bands(label)`,
    )
    .eq("active", true)
    .order("specificity", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) return [];
  return (data ?? []).map((r) => ({
    id: r.id,
    name: r.name,
    vendorId: r.vendor_id,
    vendorName: pick(r.vendors)?.name ?? null,
    categoryId: r.category_id,
    categoryName: pick(r.categories)?.name ?? null,
    itemTypeId: r.item_type_id,
    itemTypeName: pick(r.item_types)?.name ?? null,
    bandId: r.band_id,
    bandLabel: pick(r.price_bands)?.label ?? "—",
    specificity: r.specificity,
    active: r.active,
  }));
}

/** Dropdown contents for the rule builder: vendor x category x item type. */
export async function listRuleScopeOptions(): Promise<{
  categories: Category[];
  itemTypes: ItemTypeOption[];
  vendors: Array<{ id: string; name: string }>;
}> {
  const supabase = await createClient();
  const [vendors, categories, itemTypes] = await Promise.all([
    supabase.from("vendors").select("id, name").eq("active", true).order("name"),
    supabase.from("categories")
      .select("id, name, markup_multiplier").eq("active", true).order("sort_order"),
    supabase.from("item_types")
      .select("id, name, category_id").eq("active", true).order("name"),
  ]);

  return {
    vendors: (vendors.data ?? []).map((v) => ({ id: v.id, name: v.name })),
    categories: (categories.data ?? []).map((c) => ({
      id: c.id, name: c.name, markupMultiplier: Number(c.markup_multiplier ?? 2.5),
    })),
    itemTypes: (itemTypes.data ?? []).map((t) => ({
      id: t.id, name: t.name, categoryId: t.category_id,
    })),
  };
}

/**
 * Items for the pricing screen.
 *
 * "pending" is the working set: priced items are the exception here, and
 * showing hundreds of already-priced rows buries the four that need
 * attention. Rows without a landed cost are dropped entirely — there is
 * no margin to price from, so a row would only offer a control that
 * cannot work.
 */
export async function listPricingRows(
  opts: { status?: "pending" | "all"; search?: string; limit?: number } = {},
): Promise<PricingRow[]> {
  const supabase = await createClient();

  let q = supabase
    .from("items")
    .select(
      `id, barcode, name, mrp_paise, selling_price_paise,
       categories(name), vendors(name),
       item_photos(storage_path, is_primary, sort_order),
       item_latest_cost(landed_cost_paise)`,
    )
    .order("created_at", { ascending: false })
    .limit(opts.limit ?? 200);

  if (opts.status !== "all") q = q.is("mrp_paise", null);

  if (opts.search) {
    const term = opts.search.trim();
    if (term) q = q.or(`name.ilike.%${term}%,barcode.ilike.%${term}%`);
  }

  const { data, error } = await q;
  if (error || !data) return [];

  return data
    .map((i) => {
      const photos = (i.item_photos ?? []) as Array<{
        storage_path: string; is_primary: boolean; sort_order: number;
      }>;
      const primary =
        photos.find((p) => p.is_primary) ??
        [...photos].sort((a, b) => a.sort_order - b.sort_order)[0];

      return {
        itemId: i.id,
        barcode: i.barcode,
        name: i.name,
        categoryName: pick(i.categories)?.name ?? "—",
        vendorName: pick(i.vendors)?.name ?? null,
        photoPath: primary?.storage_path ?? null,
        mrpPaise: i.mrp_paise,
        sellingPricePaise: i.selling_price_paise,
        landedCostPaise: pick(i.item_latest_cost)?.landed_cost_paise ?? null,
      } satisfies PricingRow;
    })
    .filter((r) => (r.landedCostPaise ?? 0) > 0);
}

/**
 * How many inwards are still sitting at "awaiting pricing".
 *
 * The pricing screen looks broken when it is empty, and the reason is
 * almost always upstream: an item has no landed cost until its inward has
 * been priced and approved. This lets the empty state point at the real
 * next action instead of shrugging.
 */
export async function countInwardsAwaitingPricing(): Promise<number> {
  const supabase = await createClient();
  const { count, error } = await supabase
    .from("inwards")
    .select("id", { count: "exact", head: true })
    .eq("status", "submitted");

  if (error) return 0;
  return count ?? 0;
}

/** The vendor's pricing convention, for the document pricing bar. */
export async function getInwardVendorPricing(inwardId: string): Promise<{
  name: string;
  pricingMode: "code_multiple" | "serial_list" | "manual";
  codeMultiple: number | null;
} | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("inwards")
    .select("vendors(name, pricing_mode, code_multiple)")
    .eq("id", inwardId)
    .maybeSingle();

  if (error || !data) return null;
  const v = pick(data.vendors) as
    | { name: string; pricing_mode: "code_multiple" | "serial_list" | "manual";
        code_multiple: string | null }
    | undefined;
  if (!v) return null;

  return {
    name: v.name,
    pricingMode: v.pricing_mode,
    codeMultiple: v.code_multiple === null ? null : Number(v.code_multiple),
  };
}

/** The invoice-level discount recorded on an inward. */
export async function getInwardDiscount(inwardId: string): Promise<{
  kind: "none" | "percent" | "amount";
  bps: number | null;
  paise: number | null;
}> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("inwards")
    .select("discount_kind, discount_bps, discount_paise")
    .eq("id", inwardId)
    .maybeSingle();

  if (error || !data) return { kind: "none", bps: null, paise: null };
  return {
    kind: data.discount_kind,
    bps: data.discount_bps,
    paise: data.discount_paise,
  };
}
