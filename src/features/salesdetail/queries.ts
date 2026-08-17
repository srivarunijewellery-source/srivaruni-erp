import { createClient } from "@/lib/supabase/server";
import type { SalesLine, SalesBucket } from "./types";

export type { SalesLine, SalesBucket } from "./types";
export { GROUPINGS } from "./types";

export interface SalesDetailFilters {
  location?: string;
  soldBy?: string;
  category?: string;
  style?: string;
  exCategory?: string;
  vendor?: string;
  q?: string;
}

/** Comma-separated from the URL, so a filtered view stays a link. */
const many = (v?: string) => {
  const list = (v ?? "").split(",").filter(Boolean);
  return list.length ? list : null;
};

const args = (from: string, to: string, f: SalesDetailFilters) => ({
  p_from: from,
  p_to: to,
  p_location: f.location || null,
  p_sold_by: f.soldBy || null,
  p_categories: many(f.category),
  p_styles: many(f.style),
  p_ex_categories: many(f.exCategory),
  p_vendor: f.vendor || null,
  p_query: f.q?.trim() || null,
});

/**
 * Every line sold in the period, filtered.
 *
 * The grain is the LINE, not the bill, because that is where the
 * answers live: one bill has a single salesman but several categories,
 * and a category total built from bills would be wrong.
 */
export async function listSalesLines(
  from: string,
  to: string,
  filters: SalesDetailFilters = {},
  limit = 200,
  offset = 0,
): Promise<{ rows: SalesLine[]; total: number }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("sales_lines_detail", {
    ...args(from, to, filters),
    p_limit: limit,
    p_offset: offset,
  });
  if (error || !data) return { rows: [], total: 0 };

  const rows = (data as Array<Record<string, unknown>>).map((r) => ({
    billId: String(r.bill_id),
    billNo: String(r.bill_no),
    billDate: String(r.bill_date),
    locationCode: String(r.location_code),
    salesman: String(r.salesman ?? "—"),
    customerName: (r.customer_name as string | null) ?? null,
    customerPhone: (r.customer_phone as string | null) ?? null,
    itemId: String(r.item_id),
    barcode: String(r.barcode),
    itemName: String(r.item_name),
    category: String(r.category),
    style: String(r.style ?? ""),
    plating: String(r.plating ?? ""),
    vendor: (r.vendor as string | null) ?? null,
    variant: (r.variant as string | null) ?? null,
    qty: Number(r.qty ?? 0),
    unitPricePaise: Number(r.unit_price_paise ?? 0),
    lineTotalPaise: Number(r.line_total_paise ?? 0),
    costPaise: r.cost_paise === null ? null : Number(r.cost_paise),
    marginPaise: r.margin_paise === null ? null : Number(r.margin_paise),
    marginBps: r.margin_bps === null ? null : Number(r.margin_bps),
    totalRows: Number(r.total_rows ?? 0),
  }));

  return { rows, total: rows[0]?.totalRows ?? 0 };
}

/** The same slice, summarised — one call, so the totals can never
 *  disagree with the rows beneath them. */
export async function summariseSalesLines(
  from: string,
  to: string,
  filters: SalesDetailFilters = {},
  groupBy = "category",
): Promise<SalesBucket[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("sales_lines_summary", {
    ...args(from, to, filters),
    p_group_by: groupBy,
  });
  if (error || !data) return [];

  return (data as Array<Record<string, unknown>>).map((r) => ({
    bucket: String(r.bucket ?? "—"),
    lines: Number(r.lines ?? 0),
    pieces: Number(r.pieces ?? 0),
    soldPaise: Number(r.sold_paise ?? 0),
    costPaise: r.cost_paise === null ? null : Number(r.cost_paise),
    marginPaise: r.margin_paise === null ? null : Number(r.margin_paise),
    marginBps: r.margin_bps === null ? null : Number(r.margin_bps),
    shareBps: Number(r.share_bps ?? 0),
  }));
}
