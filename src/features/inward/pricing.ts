import { createClient } from "@/lib/supabase/server";
import type { Paise } from "@/types/domain";

/**
 * The owner's pricing view of a submitted inward.
 *
 * Everything needed to price a line sits in one row: the photo (the
 * owner prices from the image), the current attributes (which get
 * corrected at this point, because the person who unpacked the carton
 * was guessing), the quantity, and the rate.
 *
 * Cost fields come from inward_line_costs, which is owner-only via RLS.
 * A staff session gets nothing back here at all.
 */
export interface PricingLine {
  lineId: string;
  itemId: string;
  barcode: string;
  name: string;
  qty: number;
  photoPath: string | null;
  categoryId: string;
  categoryName: string;
  markupMultiplier: number;
  colourId: string | null;
  platingId: string | null;
  stoneId: string | null;
  sizeId: string | null;
  colourName: string | null;
  platingName: string | null;
  stoneName: string | null;
  sizeName: string | null;
  ratePaise: Paise | null;
  gstRate: number;
  /** Computed by compute_inward_costs, so the owner sees the tax and the
   *  freight share BEFORE approving rather than discovering it after. */
  taxablePaise: Paise;
  cgstPaise: Paise;
  sgstPaise: Paise;
  igstPaise: Paise;
  allocatedAddlPaise: Paise;
  landedUnitCostPaise: Paise;
  mrpPaise: Paise | null;
  sellingPricePaise: Paise | null;
}

export interface AdditionalCost {
  id: string;
  costType: string;
  amountPaise: Paise;
  basis: "value" | "quantity";
}

export interface InwardTaxSummary {
  priceMode: "gst_exclusive" | "gst_inclusive" | "no_gst";
  gstRate: number;
  vendorName: string;
  stateName: string | null;
  taxTreatment: string;
  isInterstate: boolean;
  itcEligible: boolean;
  taxablePaise: Paise;
  taxPaise: Paise;
  totalPaise: Paise;
}

export async function getTaxSummary(
  inwardId: string,
): Promise<InwardTaxSummary | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("inward_header_costs")
    .select(
      `tax_treatment, is_interstate, itc_eligible,
       invoice_taxable_paise, invoice_tax_paise, invoice_total_paise,
       inwards(vendors(name, price_mode, default_gst_rate, state_code))`,
    )
    .eq("inward_id", inwardId)
    .maybeSingle();

  if (error || !data) return null;

  const inw = pick(data.inwards as never);
  const vendor = pick((inw as { vendors?: unknown } | undefined)?.vendors as never) as
    | { name: string; price_mode: string; default_gst_rate: string; state_code: string | null }
    | undefined;

  let stateName: string | null = null;
  if (vendor?.state_code) {
    const { data: st } = await supabase
      .from("gst_states")
      .select("name")
      .eq("code", vendor.state_code)
      .maybeSingle();
    stateName = st?.name ?? null;
  }

  return {
    priceMode: (vendor?.price_mode ?? "no_gst") as InwardTaxSummary["priceMode"],
    gstRate: Number(vendor?.default_gst_rate ?? 0),
    vendorName: vendor?.name ?? "—",
    stateName,
    taxTreatment: data.tax_treatment,
    isInterstate: data.is_interstate,
    itcEligible: data.itc_eligible,
    taxablePaise: data.invoice_taxable_paise,
    taxPaise: data.invoice_tax_paise,
    totalPaise: data.invoice_total_paise,
  };
}

export async function getPricingLines(inwardId: string): Promise<PricingLine[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("inward_lines")
    .select(
      `id, qty, line_no, item_id,
       items(id, barcode, name, category_id, mrp_paise, selling_price_paise,
             colour_id, plating_id, stone_id, size_id,
             categories(id, name, markup_multiplier),
             item_photos(storage_path, is_primary, sort_order)),
       inward_line_costs(rate_paise, gst_rate, taxable_paise,
                         cgst_paise, sgst_paise, igst_paise,
                         allocated_addl_paise, landed_unit_cost_paise)`,
    )
    .eq("inward_id", inwardId)
    .order("line_no", { nullsFirst: false });

  if (error) throw error;

  // Resolve attribute labels in one round trip rather than per line.
  // The pricing screen shows these as tags on every row, so N+1 lookups
  // here would be N+1 hops to Mumbai.
  const attrIds = new Set<string>();
  for (const l of data ?? []) {
    const it = pick(l.items);
    for (const id of [it?.colour_id, it?.plating_id, it?.stone_id, it?.size_id]) {
      if (id) attrIds.add(id);
    }
  }

  const attrNames = new Map<string, string>();
  if (attrIds.size > 0) {
    const { data: attrs } = await supabase
      .from("attribute_options")
      .select("id, value")
      .in("id", [...attrIds]);
    for (const a of attrs ?? []) attrNames.set(a.id, a.value);
  }

  const label = (id: string | null | undefined) =>
    id ? attrNames.get(id) ?? null : null;

  return (data ?? []).map((l) => {
    const item = pick(l.items);
    const category = pick(item?.categories);
    const cost = pick(l.inward_line_costs);
    const photos = (item?.item_photos ?? []) as Array<{
      storage_path: string; is_primary: boolean; sort_order: number;
    }>;
    const primary =
      photos.find((p) => p.is_primary) ??
      [...photos].sort((a, b) => a.sort_order - b.sort_order)[0];

    return {
      lineId: l.id,
      itemId: l.item_id,
      barcode: item?.barcode ?? "—",
      name: item?.name ?? "Unknown item",
      qty: l.qty,
      photoPath: primary?.storage_path ?? null,
      categoryId: item?.category_id ?? "",
      categoryName: category?.name ?? "—",
      markupMultiplier: Number(category?.markup_multiplier ?? 2.5),
      colourId: item?.colour_id ?? null,
      platingId: item?.plating_id ?? null,
      stoneId: item?.stone_id ?? null,
      sizeId: item?.size_id ?? null,
      colourName: label(item?.colour_id),
      platingName: label(item?.plating_id),
      stoneName: label(item?.stone_id),
      sizeName: label(item?.size_id),
      ratePaise: cost?.rate_paise ?? null,
      gstRate: Number(cost?.gst_rate ?? 3),
      taxablePaise: cost?.taxable_paise ?? 0,
      cgstPaise: cost?.cgst_paise ?? 0,
      sgstPaise: cost?.sgst_paise ?? 0,
      igstPaise: cost?.igst_paise ?? 0,
      allocatedAddlPaise: cost?.allocated_addl_paise ?? 0,
      landedUnitCostPaise: cost?.landed_unit_cost_paise ?? 0,
      mrpPaise: item?.mrp_paise ?? null,
      sellingPricePaise: item?.selling_price_paise ?? null,
    };
  });
}

export async function listAdditionalCosts(inwardId: string): Promise<AdditionalCost[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("inward_additional_costs")
    .select("id, cost_type, amount_paise, basis")
    .eq("inward_id", inwardId)
    .order("cost_type");

  // Staff get zero rows by RLS rather than an error; treat both as empty.
  if (error) return [];
  return (data ?? []).map((c) => ({
    id: c.id, costType: c.cost_type, amountPaise: c.amount_paise, basis: c.basis,
  }));
}

/** PostgREST returns embeds as an object or a single-element array
 *  depending on the relationship it infers. Normalise once. */
function pick<T>(v: T | T[] | null | undefined): T | undefined {
  return Array.isArray(v) ? v[0] : (v ?? undefined);
}
