import { createClient } from "@/lib/supabase/server";

export interface BranchSales {
  locationId: string;
  code: string;
  name: string;
  bills: number;
  items: number;
  grossPaise: number;
  discountPaise: number;
  taxPaise: number;
  netPaise: number;
  cashPaise: number;
  upiPaise: number;
  cardPaise: number;
  otherPaise: number;
}

/**
 * The summary cards above the invoice list.
 *
 * Takes the SAME filters as the list, because they sit on one screen and
 * must answer one question. They used to take only the dates, so
 * narrowing to a salesman or a branch changed the list underneath while
 * the cards carried on describing the whole day — two numbers on one
 * page, disagreeing.
 */
export async function getSalesSummary(
  from: string,
  to: string,
  filters: {
    location?: string;
    soldBy?: string;
    status?: string;
    q?: string;
  } = {},
): Promise<BranchSales[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("sales_summary", {
    p_from: from,
    p_to: to,
    p_location: filters.location || null,
    p_sold_by: filters.soldBy || null,
    p_status: filters.status || null,
    p_query: filters.q?.trim() || null,
  });
  if (error) throw error;

  type Row = Record<string, unknown>;
  return ((data ?? []) as Row[]).map((r) => ({
    locationId: String(r.location_id),
    code: String(r.location_code ?? ""),
    name: String(r.location_name ?? ""),
    bills: Number(r.bills ?? 0),
    items: Number(r.items ?? 0),
    grossPaise: Number(r.gross_paise ?? 0),
    discountPaise: Number(r.discount_paise ?? 0),
    taxPaise: Number(r.tax_paise ?? 0),
    netPaise: Number(r.net_paise ?? 0),
    cashPaise: Number(r.cash_paise ?? 0),
    upiPaise: Number(r.upi_paise ?? 0),
    cardPaise: Number(r.card_paise ?? 0),
    otherPaise: Number(r.other_paise ?? 0),
  }));
}

export interface RegisterStatus {
  sessionId: string;
  locationCode: string;
  terminal: string;
  openedBy: string | null;
  openedAt: string;
  floatPaise: number;
  bills: number;
  salesPaise: number;
  cashPaise: number;
  expectedCashPaise: number;
}

export async function getRegisterStatus(): Promise<RegisterStatus[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("register_status");
  if (error) return [];

  type Row = Record<string, unknown>;
  return ((data ?? []) as Row[]).map((r) => ({
    sessionId: String(r.session_id),
    locationCode: String(r.location_code ?? ""),
    terminal: String(r.terminal ?? ""),
    openedBy: r.opened_by ? String(r.opened_by) : null,
    openedAt: String(r.opened_at),
    floatPaise: Number(r.float_paise ?? 0),
    bills: Number(r.bills ?? 0),
    salesPaise: Number(r.sales_paise ?? 0),
    cashPaise: Number(r.cash_paise ?? 0),
    expectedCashPaise: Number(r.expected_cash_paise ?? 0),
  }));
}

export interface RecentBill {
  customerId: string | null;
  soldById: string | null;
  id: string;
  billNo: string;
  billDate: string;
  locationCode: string | null;
  customerName: string | null;
  soldByName: string | null;
  totalPaise: number;
  status: string;
  paymentMode: string | null;
}

export interface BillFilters {
  from?: string;
  to?: string;
  location?: string;
  soldBy?: string;
  status?: string;
  q?: string;
}

export async function listRecentBills(
  limit = 50,
  filters: BillFilters = {},
): Promise<RecentBill[]> {
  const supabase = await createClient();

  let query = supabase
    .from("bills")
    .select(`id, bill_no, bill_date, total_paise, status, payment_mode,
             customer_id, sold_by,
             locations:location_id(code), customers:customer_id(name),
             staff:sold_by(name)`)
    .order("bill_date", { ascending: false })
    .order("finalised_at", { ascending: false, nullsFirst: false })
    .limit(limit);

  query =
    filters.status === "final" || filters.status === "cancelled"
      ? query.eq("status", filters.status)
      : query.in("status", ["final", "cancelled"]);

  // Rehearsal bills stay out of the invoice register.
  //
  // Every dashboard already excluded them, but this list did not — so
  // the Today figures and the sales page disagreed, and the page that
  // looks most like an invoice book was the one showing sales that never
  // happened. A bill is flagged only when EVERY line is test stock, so a
  // real sale is never hidden by this.
  query = query.eq("is_test", false);

  // The list follows the same window as the figures above it. Showing
  // "the last 50 bills ever" beside a one-day revenue total was the
  // reason people thought the numbers disagreed.
  if (filters.from) query = query.gte("bill_date", filters.from);
  if (filters.to) query = query.lte("bill_date", filters.to);
  if (filters.location) query = query.eq("location_id", filters.location);
  if (filters.soldBy) query = query.eq("sold_by", filters.soldBy);

  const term = filters.q?.trim();
  if (term) query = query.ilike("bill_no", `%${term}%`);

  const { data, error } = await query;
  if (error) return [];

  type Row = {
    id: string; bill_no: string; bill_date: string; total_paise: number;
    status: string; payment_mode: string | null;
    locations: { code: string } | { code: string }[] | null;
    customers: { name: string } | { name: string }[] | null;
    staff: { name: string } | { name: string }[] | null;
    customer_id: string | null;
    sold_by: string | null;
  };
  const one = <T,>(v: T | T[] | null): T | null =>
    Array.isArray(v) ? (v[0] ?? null) : v;

  return ((data ?? []) as unknown as Row[]).map((r) => ({
    id: r.id,
    customerId: r.customer_id ?? null,
    soldById: r.sold_by ?? null,
    billNo: r.bill_no,
    billDate: r.bill_date,
    locationCode: one(r.locations)?.code ?? null,
    customerName: one(r.customers)?.name ?? null,
    soldByName: one(r.staff)?.name ?? null,
    totalPaise: Number(r.total_paise ?? 0),
    status: r.status,
    paymentMode: r.payment_mode,
  }));
}

export interface SalespersonRow {
  staffId: string;
  staffName: string;
  locationCode: string | null;
  /** False when they have left. They still sold what they sold. */
  stillHere: boolean;
  linesSold: number;
  pieces: number;
  soldPaise: number;
  billsTouched: number;
  avgBillPaise: number;
  costPaise: number;
  marginPaise: number;
  /** Basis points of the period's revenue — 2400 is 24%. */
  shareBps: number;
  daysActive: number;
}

/**
 * Credit by LINE, falling back to the bill's seller — so a ticket split
 * between two people counts for both, which is the whole reason the
 * per-line column exists.
 */
export async function getSalespersonReport(
  from: string,
  to: string,
  locationId?: string,
): Promise<SalespersonRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("salesperson_report", {
    p_from: from,
    p_to: to,
    p_location: locationId || null,
  });
  if (error) return [];

  type Row = Record<string, unknown>;
  return ((data ?? []) as Row[]).map((r) => ({
    staffId: String(r.staff_id),
    staffName: String(r.staff_name ?? ""),
    locationCode: r.location_code ? String(r.location_code) : null,
    // Someone who has left still sold what they sold. Marking them
    // rather than hiding them keeps the period honest.
    stillHere: Boolean(r.still_here),
    linesSold: Number(r.lines_sold ?? 0),
    pieces: Number(r.pieces ?? 0),
    soldPaise: Number(r.sold_paise ?? 0),
    billsTouched: Number(r.bills_touched ?? 0),
    avgBillPaise: Number(r.avg_bill_paise ?? 0),
    costPaise: Number(r.cost_paise ?? 0),
    marginPaise: Number(r.margin_paise ?? 0),
    /** Basis points of the period's revenue — 2400 is 24%. */
    shareBps: Number(r.share_bps ?? 0),
    daysActive: Number(r.days_active ?? 0),
  }));
}

export interface BillLineDetail {
  id: string;
  itemName: string;
  qty: number;
  lineTotalPaise: number;
  soldById: string | null;
  soldByName: string | null;
}

export async function getBillLines(billId: string): Promise<BillLineDetail[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("bill_lines")
    .select("id, qty, line_total_paise, sold_by, items:item_id(name), staff:sold_by(name)")
    .eq("bill_id", billId)
    .order("line_no");
  if (error) return [];

  type Row = {
    id: string; qty: number; line_total_paise: number; sold_by: string | null;
    items: { name: string } | { name: string }[] | null;
    staff: { name: string } | { name: string }[] | null;
  };
  const one = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);

  return ((data ?? []) as unknown as Row[]).map((r) => ({
    id: r.id,
    itemName: one(r.items)?.name ?? "Item",
    qty: Number(r.qty ?? 0),
    lineTotalPaise: Number(r.line_total_paise ?? 0),
    soldById: r.sold_by,
    soldByName: one(r.staff)?.name ?? null,
  }));
}

/**
 * The bills behind a number on the dashboard.
 *
 * Reads from the database rather than filtering the "recent bills" list
 * already on screen: that list is capped, so filtering it would quietly
 * show a subset and call it the total.
 */
export async function listBillsBehind(opts: {
  from: string;
  to: string;
  locationId?: string | null;
  /** Narrows to one payment method, for the "how it was paid" cards. */
  method?: string | null;
  /** Narrows to one salesperson, for the "who sold what" rows. */
  staffId?: string | null;
  /** Only bills carrying a discount, for that card. */
  discountedOnly?: boolean;
}): Promise<RecentBill[]> {
  const supabase = await createClient();

  let q = supabase
    .from("bills")
    .select(
      `id, bill_no, bill_date, total_paise, status, payment_mode,
       customer_id, sold_by,
       locations:location_id(code), customers:customer_id(name), staff:sold_by(name)`,
    )
    .eq("status", "final")
    .gte("bill_date", opts.from)
    .lte("bill_date", opts.to)
    .order("bill_date", { ascending: false })
    .limit(500);

  if (opts.locationId) q = q.eq("location_id", opts.locationId);
  if (opts.method) q = q.eq("payment_mode", opts.method);
  if (opts.staffId) q = q.eq("sold_by", opts.staffId);
  if (opts.discountedOnly) q = q.gt("discount_paise", 0);

  const { data, error } = await q;
  if (error) return [];

  type Row = {
    id: string; bill_no: string; bill_date: string; total_paise: number;
    status: string; payment_mode: string | null;
    customer_id: string | null; sold_by: string | null;
    locations: { code: string } | { code: string }[] | null;
    customers: { name: string } | { name: string }[] | null;
    staff: { name: string } | { name: string }[] | null;
  };
  const one = <T,>(v: T | T[] | null): T | null =>
    Array.isArray(v) ? (v[0] ?? null) : v;

  return ((data ?? []) as unknown as Row[]).map((r) => ({
    id: r.id,
    customerId: r.customer_id ?? null,
    soldById: r.sold_by ?? null,
    billNo: r.bill_no,
    billDate: r.bill_date,
    locationCode: one(r.locations)?.code ?? null,
    customerName: one(r.customers)?.name ?? null,
    soldByName: one(r.staff)?.name ?? null,
    totalPaise: Number(r.total_paise ?? 0),
    status: r.status,
    paymentMode: r.payment_mode,
  }));
}
