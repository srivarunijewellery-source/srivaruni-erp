import { createClient } from "@/lib/supabase/server";

export type Grain = "day" | "week" | "month" | "year";

export type Dimension =
  | "category"
  | "item_type"
  | "plating"
  | "stone"
  | "colour"
  | "vendor"
  | "branch";

export const DIMENSIONS: Array<{ key: Dimension; label: string }> = [
  { key: "category", label: "Category" },
  { key: "item_type", label: "Item type" },
  { key: "plating", label: "Plating" },
  { key: "stone", label: "Stone" },
  { key: "colour", label: "Colour" },
  { key: "vendor", label: "Vendor" },
  { key: "branch", label: "Branch" },
];

export interface PeriodPoint {
  bucket: string;
  label: string;
  bills: number;
  qty: number;
  revenuePaise: number;
  costPaise: number;
  marginPaise: number;
}

export async function getSalesByPeriod(
  from: string,
  to: string,
  location: string | null,
  grain: Grain,
): Promise<PeriodPoint[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("dash_sales_by_period", {
    p_from: from,
    p_to: to,
    p_location: location,
    p_grain: grain,
  });
  if (error) return [];

  return ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
    bucket: String(r.bucket),
    label: String(r.label),
    bills: Number(r.bills ?? 0),
    qty: Number(r.qty ?? 0),
    revenuePaise: Number(r.revenue_paise ?? 0),
    costPaise: Number(r.cost_paise ?? 0),
    marginPaise: Number(r.margin_paise ?? 0),
  }));
}

/** A dimension pivoted across months: rows are values, columns are months. */
export interface PivotRow {
  dimension: string;
  months: Record<string, { qty: number; revenuePaise: number; marginPaise: number }>;
  totalQty: number;
  totalRevenuePaise: number;
  totalMarginPaise: number;
}

export interface Pivot {
  months: string[];
  rows: PivotRow[];
  totals: Record<string, number>;
  grandTotalPaise: number;
}

/**
 * Builds the month-pivot the old dashboard used, on whichever dimension
 * is asked for.
 *
 * Shaped here rather than in SQL because a pivot needs a column per
 * month and the month list is only known once the rows come back — the
 * alternative is dynamic SQL, which buys nothing at this size.
 */
function toPivot(
  rows: Array<{
    dimension: string;
    label: string;
    bucket: string;
    qty: number;
    revenuePaise: number;
    marginPaise: number;
  }>,
): Pivot {
  const monthOrder = new Map<string, string>();
  const byDim = new Map<string, PivotRow>();
  const totals: Record<string, number> = {};

  for (const r of rows) {
    monthOrder.set(r.bucket, r.label);

    let row = byDim.get(r.dimension);
    if (!row) {
      row = {
        dimension: r.dimension,
        months: {},
        totalQty: 0,
        totalRevenuePaise: 0,
        totalMarginPaise: 0,
      };
      byDim.set(r.dimension, row);
    }

    row.months[r.label] = {
      qty: r.qty,
      revenuePaise: r.revenuePaise,
      marginPaise: r.marginPaise,
    };
    row.totalQty += r.qty;
    row.totalRevenuePaise += r.revenuePaise;
    row.totalMarginPaise += r.marginPaise;

    totals[r.label] = (totals[r.label] ?? 0) + r.revenuePaise;
  }

  const months = [...monthOrder.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([, label]) => label);

  const out = [...byDim.values()].sort(
    (a, b) => b.totalRevenuePaise - a.totalRevenuePaise,
  );

  return {
    months,
    rows: out,
    totals,
    grandTotalPaise: out.reduce((s, r) => s + r.totalRevenuePaise, 0),
  };
}

export async function getSalesPivot(
  from: string,
  to: string,
  dimension: Dimension,
  location: string | null,
): Promise<Pivot> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("dash_sales_by_dimension", {
    p_from: from,
    p_to: to,
    p_dimension: dimension,
    p_location: location,
  });
  if (error) return { months: [], rows: [], totals: {}, grandTotalPaise: 0 };

  return toPivot(
    ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
      dimension: String(r.dimension ?? "Unspecified"),
      label: String(r.label),
      bucket: String(r.bucket),
      qty: Number(r.qty ?? 0),
      revenuePaise: Number(r.revenue_paise ?? 0),
      marginPaise: Number(r.margin_paise ?? 0),
    })),
  );
}

export async function getExpensePivot(
  from: string,
  to: string,
  location: string | null,
): Promise<Pivot> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("dash_expenses_by_month", {
    p_from: from,
    p_to: to,
    p_location: location,
  });
  if (error) return { months: [], rows: [], totals: {}, grandTotalPaise: 0 };

  return toPivot(
    ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
      dimension: String(r.account ?? "Unclassified"),
      label: String(r.label),
      bucket: String(r.bucket),
      qty: 0,
      revenuePaise: Number(r.total_paise ?? 0),
      marginPaise: 0,
    })),
  );
}

/* ------------------------------------------------------------------ */
/* Who we gave things to                                                */
/* ------------------------------------------------------------------ */

export interface BenefitRow {
  kind: "coupon" | "discount" | "gift";
  name: string;
  billId: string;
  billNo: string;
  billDate: string;
  customerId: string | null;
  customerName: string | null;
  customerPhone: string | null;
  locationCode: string | null;
  staffName: string | null;
  /** What the customer got off, or what the gift would have sold for. */
  valuePaise: number;
  /** What a gift actually cost us. Zero for coupons and discounts. */
  costPaise: number;
}

export async function getBenefitsGiven(
  from: string,
  to: string,
  location: string | null,
): Promise<BenefitRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("dash_benefits_given", {
    p_from: from,
    p_to: to,
    p_location: location,
  });
  if (error) return [];

  return ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
    kind: String(r.kind) as BenefitRow["kind"],
    name: String(r.name ?? ""),
    billId: String(r.bill_id),
    billNo: String(r.bill_no),
    billDate: String(r.bill_date),
    customerId: r.customer_id ? String(r.customer_id) : null,
    customerName: r.customer_name ? String(r.customer_name) : null,
    customerPhone: r.customer_phone ? String(r.customer_phone) : null,
    locationCode: r.location_code ? String(r.location_code) : null,
    staffName: r.staff_name ? String(r.staff_name) : null,
    valuePaise: Number(r.value_paise ?? 0),
    costPaise: Number(r.cost_paise ?? 0),
  }));
}

/* ------------------------------------------------------------------ */
/* What actually sold                                                   */
/* ------------------------------------------------------------------ */

export interface SoldItem {
  itemId: string;
  barcode: string | null;
  name: string;
  photoPath: string | null;
  category: string | null;
  stone: string | null;
  vendor: string | null;
  qtySold: number;
  bills: number;
  customers: number;
  revenuePaise: number;
  costPaise: number;
  marginPaise: number;
  qtyRemaining: number;
  sellingPricePaise: number;
}

/**
 * One row per piece sold in the window, with its photo.
 *
 * The pivots answer "which category earned most". This answers "which
 * PIECE", which for jewellery is the question actually asked — a design
 * either moves or it does not, and the picture is how you recognise it.
 */
export interface SoldItemFilters {
  category?: string;
  stone?: string;
  vendor?: string;
  search?: string;
  sort?: string;
}

export interface SoldItemsPage {
  items: SoldItem[];
  /** How many match the filters in total, not just on this page. */
  total: number;
}

export async function getItemsSold(
  from: string,
  to: string,
  location: string | null,
  filters: SoldItemFilters = {},
  limit = 48,
  offset = 0,
): Promise<SoldItemsPage> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("dash_items_sold", {
    p_from: from,
    p_to: to,
    p_location: location,
    p_category: filters.category || null,
    p_stone: filters.stone || null,
    p_vendor: filters.vendor || null,
    p_search: filters.search || null,
    p_sort: filters.sort || "revenue",
    p_limit: limit,
    p_offset: offset,
  });
  if (error) return { items: [], total: 0 };

  const rows = (data ?? []) as Array<Record<string, unknown>>;
  return {
    total: rows.length > 0 ? Number(rows[0]!.total_matching ?? 0) : 0,
    items: rows.map((r) => ({
      itemId: String(r.item_id),
      barcode: r.barcode ? String(r.barcode) : null,
      name: String(r.name ?? "Item"),
      photoPath: r.photo_path ? String(r.photo_path) : null,
      category: r.category ? String(r.category) : null,
      stone: r.stone ? String(r.stone) : null,
      vendor: r.vendor ? String(r.vendor) : null,
      qtySold: Number(r.qty_sold ?? 0),
      bills: Number(r.bills ?? 0),
      customers: Number(r.customers ?? 0),
      revenuePaise: Number(r.revenue_paise ?? 0),
      costPaise: Number(r.cost_paise ?? 0),
      marginPaise: Number(r.margin_paise ?? 0),
      qtyRemaining: Number(r.qty_remaining ?? 0),
      sellingPricePaise: Number(r.selling_price_paise ?? 0),
    })),
  };
}
