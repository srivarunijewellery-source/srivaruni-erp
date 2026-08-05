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

export async function getSalesSummary(from: string, to: string): Promise<BranchSales[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("sales_summary", { p_from: from, p_to: to });
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

export async function listRecentBills(limit = 50): Promise<RecentBill[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("bills")
    .select(`id, bill_no, bill_date, total_paise, status, payment_mode,
             locations:location_id(code), customers:customer_id(name),
             staff:sold_by(name)`)
    .in("status", ["final", "cancelled"])
    .order("bill_date", { ascending: false })
    .order("finalised_at", { ascending: false, nullsFirst: false })
    .limit(limit);
  if (error) return [];

  type Row = {
    id: string; bill_no: string; bill_date: string; total_paise: number;
    status: string; payment_mode: string | null;
    locations: { code: string } | { code: string }[] | null;
    customers: { name: string } | { name: string }[] | null;
    staff: { name: string } | { name: string }[] | null;
  };
  const one = <T,>(v: T | T[] | null): T | null =>
    Array.isArray(v) ? (v[0] ?? null) : v;

  return ((data ?? []) as unknown as Row[]).map((r) => ({
    id: r.id,
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
  linesSold: number;
  pieces: number;
  soldPaise: number;
  billsTouched: number;
}

/**
 * Credit by LINE, falling back to the bill's seller — so a ticket split
 * between two people counts for both, which is the whole reason the
 * per-line column exists.
 */
export async function getSalespersonReport(
  from: string,
  to: string,
): Promise<SalespersonRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("salesperson_report", {
    p_from: from,
    p_to: to,
    p_location: null,
  });
  if (error) return [];

  type Row = Record<string, unknown>;
  return ((data ?? []) as Row[]).map((r) => ({
    staffId: String(r.staff_id),
    staffName: String(r.staff_name ?? ""),
    locationCode: r.location_code ? String(r.location_code) : null,
    linesSold: Number(r.lines_sold ?? 0),
    pieces: Number(r.pieces ?? 0),
    soldPaise: Number(r.sold_paise ?? 0),
    billsTouched: Number(r.bills_touched ?? 0),
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
